package eu.neverblink.linkml.generator.ossie

import eu.neverblink.linkml.generator.options.{ImportResult, OssieImporterOptions}
import eu.neverblink.linkml.generator.{ImportWarnings, SchemaImporter}
import eu.neverblink.linkml.generator.ossie.expression.*
import eu.neverblink.linkml.metamodel.*
import eu.neverblink.linkml.runtime.{
  LinkmlAny,
  PlainText,
  PrefixMap,
  Reference,
  SchemaConversionException,
  Uri,
  UriCurieValidator,
}
import eu.neverblink.linkml.schemaview.{Case, SchemaCodec}
import eu.neverblink.linkml.yaml.DecodeError
import org.virtuslab.yaml.{Node, NodeOps, parseYaml}

import java.io.InputStream

import scala.collection.immutable.VectorMap

/** Reads an Apache Ossie (incubating) ontology and produces a LinkML schema.
  *
  * Anything LinkML can't express is listed in [[OssieImporter.Result.warnings]].
  */
class OssieImporter extends SchemaImporter[OssieImporterOptions] {

  import OssieImporter.*

  override protected def defaultOptions: OssieImporterOptions = OssieImporterOptions()

  override def importSchema(
      in: InputStream,
      options: OssieImporterOptions = OssieImporterOptions(),
  ): SchemaDefinition =
    importWithWarnings(in, options).schema

  def importWithWarnings(
      in: InputStream,
      options: OssieImporterOptions = OssieImporterOptions(),
  ): Result =
    Conversion(decode(readUtf8(in)), options).result

  override def importResult(
      in: InputStream,
      options: OssieImporterOptions = OssieImporterOptions(),
  ): ImportResult = {
    val result = importWithWarnings(in, options)
    ImportResult(
      serializeSchema(result.schema, options.format, options.fullUris),
      result.warnings,
    )
  }

  /** Parse and decode an ontology document. Accepts JSON too, since JSON is YAML.
    *
    * @throws SchemaConversionException
    *   if the document isn't YAML, or doesn't have the shape of an ontology
    */
  private def decode(input: String): OssieOntology =
    parseYaml(input) match {
      case Right(node) =>
        try OssieOntology.codec.decode(node)
        catch { case e: DecodeError => throw notReadable(e.getMessage) }
      case Left(error) => throw notReadable(error.msg)
    }

  private def notReadable(reason: String): SchemaConversionException =
    SchemaConversionException("Not a readable Ossie ontology: ".concat(reason))
}

object OssieImporter {

  /** `warnings` has one line per kind of thing that could not be imported. */
  final case class Result(schema: SchemaDefinition, warnings: Seq[String])

  /** The LinkML type behind each of Ossie's built-in value types. */
  private val linkmlTypes: Map[String, String] = Map(
    BuiltInConcept.boolean -> "boolean",
    BuiltInConcept.date -> "date",
    BuiltInConcept.dateTime -> "datetime",
    BuiltInConcept.decimal -> "decimal",
    BuiltInConcept.float -> "float",
    BuiltInConcept.integer -> "integer",
    BuiltInConcept.string -> "string",
  )

  private val linkmlNamespace = "https://w3id.org/linkml/"

  /** The class standing in for Ossie's `Any`, declared only when something actually refers to it.
    */
  private val anyClass = "Any"

  /** The URI that marks an element as LinkML's "anything". */
  private val anyUri = Uri(linkmlNamespace.concat("Any"))

  /** Ossie's `identify_by` key has no name of its own, so a compound key one is named after the
    * field.
    */
  private val uniqueKeyName = "identify_by"

  /** One ontology file import. */
  private final class Conversion(ontology: OssieOntology, options: OssieImporterOptions) {

    private val warnings = ImportWarnings()

    import warnings.warn

    /** Concept name to LinkML element name. */
    private val elementNames: Map[String, String] = {
      val pairs = ontology.ontology.map(c => c.concept -> Case.baseToPascal(Case.base(c.concept)))
      val clashes = pairs.groupBy(_._2).filter(_._2.sizeIs > 1)
      if clashes.nonEmpty then
        throw SchemaConversionException(
          "Concepts that differ only in naming style cannot both be imported: " +
            clashes.toSeq.sortBy(_._1).map { (element, from) =>
              s"${from.map(_._1).mkString(" and ")} would both become '$element'"
            }.mkString("; "),
        )
      pairs.toMap
    }

    private val (valueTypes, entityTypes) =
      ontology.ontology.partition(_.conceptType == ConceptType.ValueType)

    private val (enumConcepts, typeConcepts) =
      valueTypes.partition(c => permissibleValues(c).isDefined)

    private val typeNames: Set[String] = typeConcepts.map(c => elementNames(c.concept)).toSet

    private val conceptsByName: Map[String, Concept] =
      ontology.ontology.map(c => c.concept -> c).toMap

    /** The ontology's prefixes that the schema can declare as they are.
      *
      * `linkml` is taken, because the schema needs it for its own imports.
      */
    private val keptPrefixes: VectorMap[String, String] = {
      val b = VectorMap.newBuilder[String, String]
      ontology.prefixes.foreach { e =>
        val p = e._1
        val ns = e._2
        if (!UriCurieValidator.isValidUri(ns))
          throw SchemaConversionException(
            s"The namespace '$ns' of the prefix '$p' isn't a valid IRI",
          )
        if (p != "linkml" || ns == linkmlNamespace) b.addOne(e)
      }
      b.result()
    }

    // The ontology's prefixes, then those of the metamodel, as when a LinkML schema is read
    private val reading = PrefixMap(overrides = ontology.prefixes, defaults = Prefixes.map)

    /** An `iri` as a LinkML URI.
      *
      * A QName is expanded with the ontology's prefixes, or else with those of the LinkML
      * metamodel, such as `skos`. Anything else must be a full IRI, such as `acme:Thing` when
      * `acme` isn't a prefix. A URI that a kept prefix covers is written as a CURIE.
      *
      * @throws SchemaConversionException
      *   if the `iri` is neither a full IRI nor a QName with a known prefix, such as `Person`
      */
    private def uriOf(iri: String): Uri = {
      val expanded = reading.expandOrNull(iri)
      val uri = if (expanded ne null) expanded else iri
      if (!UriCurieValidator.isValidUri(uri))
        throw SchemaConversionException(
          s"The iri '$iri' is neither a full IRI nor a QName with a declared prefix",
        )
      Uri(uri)
    }

    private val schemaId: String = {
      val id = options.schemaId.getOrElse {
        val slug = Case.base(ontology.name)
        "https://example.org/" + (if slug.isEmpty then "ontology" else slug)
      }
      if (!UriCurieValidator.isValidUri(id))
        throw SchemaConversionException(s"The schema id '$id' isn't a valid URI")
      id
    }

    /** The namespace of the schema's elements that have no `iri`. */
    private lazy val namespace: String = SchemaCodec.defaultNamespace(schemaId, None, Map.empty)

    def result: Result = Result(schema, warnings.lines)

    private def schema: SchemaDefinition = {
      ontology.requires.foreach(e => warn("Ontology-wide expression, which is not read", e))
      ontology.ontologyMappings.foreach { m =>
        val name = m match {
          case Node.MappingNode(entries, _) =>
            entries.collectFirst { case (Node.ScalarNode("name", _), Node.ScalarNode(n, _)) => n }
          case _ => None
        }
        warn("Ontology mapping, which is not read", name.getOrElse("(no name)"))
      }
      val classes = entityTypes.map(classOf)
      // Only a range can refer to Any, and the class is declared only when one does.
      val any = Option.when(
        classes.exists(_.attributes.values.exists(_.range.contains(Reference(anyClass)))) &&
          !classes.exists(_.name == anyClass),
      )(ClassDefinition(name = anyClass, classUri = Some(anyUri)))

      SchemaDefinition(
        id = Uri(schemaId),
        name = ontology.name,
        description = ontology.description.map(PlainText.apply),
        prefixes = VectorMap(
          "linkml" -> Prefix("linkml", Uri(linkmlNamespace)),
        ) ++ keptPrefixes.map((p, ns) => p -> Prefix(p, Uri(ns))),
        defaultRange = Some(Reference("string")),
        imports = Seq(Uri(linkmlNamespace.concat("types"))),
        extensions = aiContext,
        classes = byName(classes ++ any),
        enums = byName(enumConcepts.map(enumOf)),
        types = byName(typeConcepts.map(typeOf)),
      )
    }

    /** The ontology's `ai_context`, as the `extensions` metaslot in LinkML. Its tag is the URI in
      * the schema's default namespace, which reading the written schema gives for `ai_context`.
      */
    private def aiContext: Map[String, ExtensionImpl] =
      ontology.aiContext.map { node =>
        val tag = Uri(namespace.concat("ai_context"))
        "ai_context" -> ExtensionImpl(extensionTag = tag, extensionValue = LinkmlAny(node.asYaml))
      }.toMap

    private def classOf(concept: Concept): ClassDefinition = {
      // The generator lists mixins before `is_a`, so the last entry is the one that was `is_a`.
      // Extending Any says nothing, so it's omitted.
      val parents = concept.extendsConcepts
        .filterNot(_ == BuiltInConcept.any)
        .map(name => elementNames.getOrElse(name, name))
      val declared = concept.relationships.map(r => r.name -> r).toMap
      val conceptRef = Ref(concept.concept)
      // Only `Concept.relationship` over a relationship of this concept says something LinkML can.
      val required = expressions(concept.concept, concept.requires).flatMap {
        case (Expression.Member(r, relationship), _)
            if r == conceptRef && declared.contains(relationship) =>
          Some(relationship)
        case (_, text) =>
          cannotExpress(concept.concept, text)
          None
      }.toSet
      notRead(concept.concept, concept.derivedBy)

      // An identifier made only of inherited relationships is left to the concept declaring them.
      val inherited = inheritedRelationships(concept)
      val unknownKeys = concept.identifyBy.filterNot(n => declared.contains(n) || inherited(n))
      if (unknownKeys.nonEmpty)
        warn(
          "Identifier made of relationships the concept does not have",
          s"${concept.concept}: ${concept.identifyBy.mkString(", ")}",
        )
      val identifier = concept.identifyBy match {
        case Seq(only) if declared.get(only).exists(canIdentify) => Some(only)
        case _ => None
      }
      val compoundKey = Option.when(
        identifier.isEmpty && concept.identifyBy.exists(declared.contains) && unknownKeys.isEmpty,
      )(
        UniqueKey(
          uniqueKeyName = uniqueKeyName,
          uniqueKeySlots = concept.identifyBy.map(name => Reference(Case.base(name))),
        ),
      )

      val name = elementNames(concept.concept)
      ClassDefinition(
        name = name,
        alias = Option.when(name != concept.concept)(concept.concept),
        classUri = concept.iri.map(uriOf),
        description = concept.description.map(PlainText.apply),
        isA = parents.lastOption.map(Reference.apply),
        mixins = parents.dropRight(1).map(Reference.apply),
        attributes = VectorMap.from(
          concept.relationships.zipWithIndex.map((r, i) =>
            attributeOf(
              concept.concept,
              name,
              r,
              required(r.name),
              identifier.contains(r.name),
              i + 1,
            ),
          ),
        ),
        uniqueKeys = compoundKey.map(uniqueKeyName -> _).toMap,
      )
    }

    /** The names of the relationships a concept gets from the concepts it extends. */
    private def inheritedRelationships(concept: Concept): Set[String] = {
      val seen = collection.mutable.Set(concept.concept)
      def walk(c: Concept): Iterator[String] =
        c.extendsConcepts.iterator.filter(seen.add).flatMap(conceptsByName.get).flatMap { parent =>
          parent.relationships.iterator.map(_.name) ++ walk(parent)
        }
      walk(concept).toSet
    }

    /** Whether a relationship can become LinkML's `identifier`, which has to be a single-valued
      * scalar. Others have to go through `unique_keys` instead.
      */
    private def canIdentify(relationship: Relationship): Boolean =
      relationship.multiplicity.contains(Multiplicity.OneToOne) &&
        relationship.roles.headOption.map(_.concept).exists(c =>
          linkmlTypes.contains(c) || typeNames.contains(elementNames.getOrElse(c, c)),
        )

    /** A relationship belongs to its concept, which plays its first role: Ossie names it
      * `Concept.relationship`. So without an `iri`, its URI includes the class name, and the class
      * is its domain.
      */
    private def attributeOf(
        conceptName: String,
        className: String,
        relationship: Relationship,
        required: Boolean,
        identifier: Boolean,
        rank: Int,
    ): (String, SlotDefinition) = {
      val name = Case.base(relationship.name)
      val owner = s"$conceptName.${relationship.name}"
      // We don't support multi-role relationships yet, so we only look at the first one.
      // TODO: consider synthesizing a LinkML class for the relationship and using it as the range.
      val role = relationship.roles.headOption
      relationship.roles.drop(1).foreach { r =>
        warn("Role after the first, as a slot has only one range", s"$owner: ${r.ref}")
      }
      notRead(owner, relationship.derivedBy)
      val constraints = constraintsOf(
        owner,
        role.fold(Ref(""))(r => Ref(r.ref)),
        relationship.requires,
      )
      // Try to get a title from the verbalization, but only if it is not empty
      // and not the same as the space-cased relationship name.
      val title = relationship.verbalizes.headOption
        .flatMap(Verbalization.parse)
        .map(_.phrase)
        .filter(phrase => phrase.nonEmpty && phrase != name.replace('_', ' '))

      name -> SlotDefinition(
        name = name,
        rank = Some(rank),
        alias = Option.when(name != relationship.name)(relationship.name),
        slotUri = Some(relationship.iri.map(uriOf).getOrElse(Uri(s"$namespace$className.$name"))),
        domain = Some(Reference(className)),
        title = title.map(PlainText.apply),
        description = relationship.description.map(PlainText.apply),
        range = role.map(r => Reference(rangeOf(r.concept))),
        multivalued = relationship.multiplicity.isEmpty,
        required = required,
        identifier = identifier,
        minimumValue = constraints.minimumValue,
        maximumValue = constraints.maximumValue,
        pattern = constraints.pattern,
      )
    }

    private def enumOf(concept: Concept): EnumDefinition = {
      warnAboutValueType(concept)
      EnumDefinition(
        name = elementNames(concept.concept),
        enumUri = concept.iri.map(uriOf),
        description = concept.description.map(PlainText.apply),
        permissibleValues = VectorMap.from(
          permissibleValues(concept).getOrElse(Nil).map(v => v -> PermissibleValue(text = v)),
        ),
      )
    }

    private def typeOf(concept: Concept): TypeDefinition = {
      val constraints = constraintsOf(concept.concept, Ref(concept.concept), concept.requires)
      warnAboutValueType(concept)
      concept.extendsConcepts.drop(1).foreach { p =>
        warn(
          "Parent of a value type after the first, as a type has only one",
          s"${concept.concept}: $p",
        )
      }
      // There is no LinkML type for Ossie's Any. We write `base: Any`, which LinkML does not
      // recognize, and the Ossie generator turns an unrecognized base back into Any.
      val overAny = concept.extendsConcepts.headOption.contains(BuiltInConcept.any)
      TypeDefinition(
        name = elementNames(concept.concept),
        description = concept.description.map(PlainText.apply),
        typeUri = concept.iri.map(uriOf).orElse(Option.when(overAny)(anyUri)),
        typeof = Option.unless(overAny)(
          Reference(concept.extendsConcepts.headOption.map(baseOf).getOrElse("string")),
        ),
        base = Option.when(overAny)(BuiltInConcept.any),
        minimumValue = constraints.minimumValue,
        maximumValue = constraints.maximumValue,
        pattern = constraints.pattern,
      )
    }

    /** The type a value type is based on. */
    private def baseOf(concept: String): String =
      linkmlTypes.getOrElse(
        concept, {
          val element = elementNames.getOrElse(concept, concept)
          if typeNames.contains(element) then element
          else {
            warn("Value type based on something other than a value type, read as String", concept)
            "string"
          }
        },
      )

    /** The LinkML range for the concept playing a role. */
    private def rangeOf(concept: String): String =
      if concept == BuiltInConcept.any then anyClass
      else linkmlTypes.getOrElse(concept, elementNames.getOrElse(concept, concept))

    /** Warns about what a value type has that neither an enum nor a type can hold. */
    private def warnAboutValueType(concept: Concept): Unit = {
      notRead(concept.concept, concept.derivedBy)
      concept.relationships.foreach { r =>
        warn("Relationship of a value type", s"${concept.concept}.${r.name}")
      }
      if (concept.identifyBy.nonEmpty)
        warn(
          "Identifier of a value type",
          s"${concept.concept}: ${concept.identifyBy.mkString(", ")}",
        )
    }

    /** The values a value type allows, if it is the enumerated kind. */
    private def permissibleValues(concept: Concept): Option[Seq[String]] =
      concept.requires match {
        case Seq(only) =>
          Expression.parse(only).collect {
            case Expression.InList(r, values) if r == Ref(concept.concept) => values.map(_.value)
          }
        case _ => None
      }

    /** The expressions that can be read, each with its text. Warns about the others.
      *
      * @param owner
      *   The concept or relationship the expressions belong to, for the warning
      */
    private def expressions(
        owner: String,
        texts: Seq[String],
    ): Seq[(expression.Expression, String)] =
      texts.flatMap { text =>
        val parsed = Expression.parse(text)
        if parsed.isEmpty then warn("Expression that cannot be read", s"$owner: $text")
        parsed.map(_ -> text)
      }

    /** The constraints that expressions place on `ref`. Warns about the expressions that are not
      * one.
      */
    private def constraintsOf(owner: String, ref: Ref, texts: Seq[String]): Constraints = {
      val read = expressions(owner, texts)
      val (constraints, unused) = Constraints.from(ref, read.map(_._1))
      // Expressions that read the same are interchangeable, so each unused one takes the first
      // text left that reads like it.
      val left = collection.mutable.ArrayBuffer.from(read)
      unused.foreach { e =>
        val i = left.indexWhere(_._1 == e)
        cannotExpress(owner, left.remove(i)._2)
      }
      constraints
    }

    private def cannotExpress(owner: String, text: String): Unit =
      warn("Expression that LinkML cannot express", s"$owner: $text")

    private def notRead(owner: String, derivedBy: Seq[String]): Unit =
      derivedBy.foreach(e => warn("Derivation (`derived_by`), which is not read", s"$owner: $e"))
  }

  private def byName[T <: Element](elements: Seq[T]): Map[String, T] =
    VectorMap.from(elements.map(e => e.name -> e))
}
