package eu.neverblink.linkml.generator.owl

import eu.neverblink.linkml.generator.options.OwlImportConfig
import eu.neverblink.linkml.generator.owl.config.OwlImportConfigs.metadataSources
import eu.neverblink.linkml.metamodel.Annotation as LinkmlAnnotation
import eu.neverblink.linkml.rdf.{Iri, IntBuffer, LanguageLiteral, Literal, Node, Rdfs, XmlSchema}
import eu.neverblink.linkml.runtime.*

import scala.collection.immutable.VectorMap
import scala.collection.mutable
import scala.runtime.IntRef

/** Turns ontology annotations into LinkML metaslots where a mapping exists, and the rest into
  * `annotations`.
  *
  * @param annotationsOf
  *   Annotations by term IRI.
  * @param subPropertiesOf
  *   The subproperties of each property, from the ontology's `rdfs:subPropertyOf` axioms.
  * @param isOntology
  *   Whether an IRI is the ontology's own.
  */
private[owl] final class OwlAnnotationReader(
    annotationsOf: collection.Map[String, collection.Seq[Annotation]],
    ontologyAnnotations: Seq[Annotation],
    config: OwlImportConfig,
    names: OwlImportNames,
    subPropertiesOf: collection.Map[String, collection.Seq[String]] = Map.empty,
    isOntology: String => Boolean = _ => false,
) {
  import OwlAnnotationReader.*

  /** Subproperties added to the sources. Text metaslots take only their literals. */
  private val addedSubProperties = mutable.HashSet.empty[String]

  /** Lists the properties to read for each metaslot. If the ontology declares a subproperty of a
    * listed property, the subproperty is added to the list right after its parent.
    */
  private def sourcesOf(metadataSources: Seq[(String, Seq[String])]): Sources = {
    val listed = mutable.ArrayBuffer.empty[(field: Metadata.Field, properties: Seq[String])]
    val listedProperties = mutable.HashSet.empty[String]
    metadataSources.foreach { source =>
      val field = Metadata.byName.getOrElse(source._1, null)
      if (field ne null) {
        val properties = source._2.map(names.expand)
        listedProperties.addAll(properties)
        listed.addOne((field = field, properties = properties))
      }
    }
    val sources: Sources = mutable.ArrayBuffer.empty
    listed.foreach { source =>
      val properties = mutable.ArrayBuffer.empty[String]
      val seen = mutable.HashSet.empty[String]
      def addWithSubProperties(p: String): Unit =
        if (seen.add(p)) {
          properties.addOne(p)
          subPropertiesOf.getOrElse(p, Nil).foreach { sub =>
            if (!listedProperties.contains(sub)) {
              addedSubProperties.addOne(sub)
              addWithSubProperties(sub)
            }
          }
        }
      source.properties.foreach(addWithSubProperties)
      sources.addOne((field = source.field, properties = properties))
    }
    sources
  }

  private val sources = sourcesOf(config.metadataSources())

  private val ontologySources = sourcesOf(config.metadataSources(ontology = true))

  /** The annotation properties of human-readable metaslots, such as title and description. Examples
    * are skipped, as they are often code.
    */
  private val humanTextProperties: mutable.HashSet[String] = {
    val properties = mutable.HashSet.empty[String]
    sources.foreach { s =>
      val name = s.field.name
      if (Metadata.humanText(name) && name != "examples") properties.addAll(s.properties)
    }
    properties
  }

  /** The schema's `in_language`: the language tag of at least 90% of the human-readable text. Text
    * in that language is imported without the tag. Code examples, identifiers and other text with
    * no language are not counted.
    */
  val language: Option[String] = {
    val counts = mutable.HashMap.empty[String, IntRef]
    var texts = 0
    def count(a: Annotation): Unit =
      if (humanTextProperties.contains(a.property)) {
        a.value match {
          case l: LanguageLiteral =>
            texts += 1
            counts.getOrElseUpdate(l.language.toLowerCase, IntRef.create(0)).elem += 1
          case l: Literal => if (l.datatype == XmlSchema.string) texts += 1
          case _ =>
        }
      }
    annotationsOf.valuesIterator.foreach(_.foreach(count))
    ontologyAnnotations.foreach(count)
    var best: String = null
    var bestCount = 0
    counts.foreachEntry { (tag, count) =>
      if (count.elem > bestCount) {
        best = tag
        bestCount = count.elem
      }
    }
    if ((best ne null) && bestCount >= 0.9 * texts) Some(best) else None
  }

  /** [[language]], or `null` if there is none. */
  private val languageTag: String = language.orNull

  private def plainInLanguage(a: Annotation): Annotation = a.value match {
    case l: LanguageLiteral =>
      if ((languageTag ne null) && languageTag == l.language.toLowerCase)
        a.copy(value = Literal(l.value))
      else a
    case _ => a
  }

  /** A text's language tag, or the schema's language for plain text, or `null` if it has none. */
  private def languageOf(value: Node): String = value match {
    case l: LanguageLiteral => l.language
    case l: Literal => if (l.datatype == XmlSchema.string) languageTag else null
    case _ => null
  }

  /** Whether every value has a language and no two share one. */
  private def oneLanguageEach(values: collection.Seq[Annotation]): Boolean = {
    val seen = mutable.HashSet.empty[String]
    values.forall { a =>
      val language = languageOf(a.value)
      (language ne null) && seen.add(language.toLowerCase)
    }
  }

  def documentation(iri: String): Documentation =
    documentation(annotationsOf.getOrElse(iri, Nil))

  /** Skips `rdfs:isDefinedBy` that point to this ontology, since the term's schema says the same.
    */
  def documentation(annotations: collection.Seq[Annotation]): Documentation = {
    val own = mutable.ArrayBuffer.empty[Annotation]
    annotations.foreach { a =>
      if (a.property != Rdfs.isDefinedBy.value || !isOntology(textOrIri(a.value))) own.addOne(a)
    }
    documentationFrom(own, sources)
  }

  /** Like [[documentation]], with the defaults for an ontology header
    * (`OwlImportConfigs.defaultOntologyMetadata`).
    */
  def ontologyDocumentation(annotations: collection.Seq[Annotation]): Documentation =
    documentationFrom(annotations, ontologySources)

  private def documentationFrom(
      annotations: collection.Seq[Annotation],
      sources: Sources,
  ): Documentation = {
    val rest = mutable.ArrayBuffer.empty[Annotation]
    val metadata = metadataOf(annotations, sources, rest)
    (metadata = metadata, annotations = linkmlAnnotations(rest))
  }

  /** Splits annotations into metadata and the leftovers, which it adds to `remaining`.
    *
    * Each metaslot reads its properties in order. A single-valued one stops at the first property
    * with a value, or for text, takes one value per language. The values it takes, and any other
    * values with the same text, are not available to later metaslots.
    */
  private def metadataOf(
      annotations: collection.Seq[Annotation],
      sources: Sources,
      remaining: mutable.ArrayBuffer[Annotation],
  ): Metadata = {
    annotations.foreach(a => remaining.addOne(plainInLanguage(a)))
    val annotationCount = remaining.length
    val taken = new java.util.BitSet(annotationCount)
    val fieldValues = mutable.ArrayBuffer.empty[String | LocalizedText | UriOrCurie]
    val textsFromAllProperties = mutable.ArrayBuffer.empty[Annotation]
    val matches = mutable.ArrayBuffer.empty[Annotation]
    val matchIndices = new IntBuffer

    def findUntakenMatches(field: Metadata.Field, property: String): Unit = {
      matches.clear()
      matchIndices.clear()
      // gist's `gist:rangeIncludes` is a subproperty of `skos:scopeNote` with class IRIs as values.
      val textOnly = field.kind == Metadata.Kind.Text && addedSubProperties.contains(property)
      var i = 0
      while (i < annotationCount) {
        val a = remaining(i)
        if (
          !taken.get(i) && a.property == property && !(textOnly && a.value.isInstanceOf[Iri]) &&
          (valueOf(field, a.value) ne null)
        ) {
          matches.addOne(a)
          matchIndices.add(i)
        }
        i += 1
      }
    }

    def keepOnlyFirstMatch(): Unit = {
      matches.dropRightInPlace(matches.length - 1)
      matchIndices.truncate(1)
    }

    // PROV-O gives some terms the same link through two subproperties of `rdfs:seeAlso`.
    def addMatchesToFieldValues(field: Metadata.Field, isSingleValued: Boolean): Unit =
      if (field.kind == Metadata.Kind.Text) {
        if (!isSingleValued) {
          matches.foreach { a =>
            if (!textsFromAllProperties.exists(_.value == a.value)) textsFromAllProperties.addOne(a)
          }
        } else if (matches.nonEmpty) fieldValues.addOne(textOf(matches))
      } else {
        matches.foreach { a =>
          val value = valueOf(field, a.value)
          if ((value ne null) && !fieldValues.contains(value)) fieldValues.addOne(value)
        }
      }

    def readFieldValues(
        source: (field: Metadata.Field, properties: mutable.ArrayBuffer[String]),
    ): Unit = {
      val field = source.field
      val properties = source.properties
      val isSingleValued = singleValued(field.name)
      val isText = field.kind == Metadata.Kind.Text
      fieldValues.clear()
      textsFromAllProperties.clear()
      var j = 0
      while (j < properties.length && (!isSingleValued || fieldValues.isEmpty)) {
        findUntakenMatches(field, properties(j))
        val matchesAreTranslations = isText && oneLanguageEach(matches)
        if (isSingleValued && matches.length > 1 && !matchesAreTranslations) keepOnlyFirstMatch()
        matchIndices.foreach(taken.set)
        addMatchesToFieldValues(field, isSingleValued)
        j += 1
      }
      addTexts(textsFromAllProperties, fieldValues)
    }

    def takeUntakenWithSameText(): Unit = {
      val textsOfFieldValues = textsOf(fieldValues)
      var i = 0
      while (i < annotationCount) {
        if (!taken.get(i)) {
          val text = textIn(remaining(i).value)
          if ((text ne null) && textsOfFieldValues.contains(text)) taken.set(i)
        }
        i += 1
      }
    }

    var metadata = Metadata.empty
    sources.foreach { source =>
      readFieldValues(source)
      if (fieldValues.nonEmpty) {
        metadata = source.field.set(metadata, Vector.from(fieldValues))
        takeUntakenWithSameText()
      }
    }
    removeTaken(remaining, taken)
    metadata
  }

  /** The value of an annotation for a metaslot, or `null` if it can't be one. */
  private def valueOf(field: Metadata.Field, value: Node): String | UriOrCurie =
    field.kind match {
      case Metadata.Kind.Flag =>
        value match {
          case l: Literal => if (l.value == "true" || l.value == "1") "true" else null
          case _ => null
        }
      case Metadata.Kind.Reference =>
        value match {
          // An IRI that can't be a URI in the schema is left to the annotations, as text
          case i: Iri => if (names.isWritable(i.value)) names.uri(i.value) else null
          case l: Literal => referenceIn(l.value)
          // ENVO gives some links a language tag.
          case l: LanguageLiteral => referenceIn(l.value)
          case _ => null
        }
      case _ =>
        value match {
          case i: Iri => i.value
          case other => textIn(other)
        }
    }

  /** A URL, a URN or a CURIE with a known prefix, if its expansion can be a URI in the schema.
    * Otherwise `null`.
    */
  private def referenceIn(v: String): UriOrCurie =
    if (v.isEmpty) null
    else if (v.contains("://") || v.startsWith("urn:")) {
      if (names.isWritable(v)) names.uri(v) else null
    } else {
      val iri = names.expand(v)
      if (!iri.equals(v) && names.isWritable(iri)) {
        names.ensurePrefix(iri)
        names.uri(iri)
      } else null
    }

  /** One text from the values of annotations, with a language for each if there are several. */
  private def textOf(values: collection.Seq[Annotation]): LocalizedText = {
    val single = if (values.length == 1) singleText(values.head.value) else null
    if (single ne null) single
    else {
      val byLanguage = Map.newBuilder[String, String]
      values.foreach { a =>
        val language = languageOf(a.value)
        val text = textIn(a.value)
        if ((language ne null) && (text ne null)) byLanguage.addOne(language -> text)
      }
      MultilingualText(byLanguage.result())
    }
  }

  /** The text of a single value, or `null` if it is not a literal or an IRI. Text in the schema's
    * language is already plain, so a language tag is a different one.
    */
  private def singleText(value: Node): LocalizedText = value match {
    case l: Literal => PlainText(l.value)
    case i: Iri => PlainText(i.value)
    case l: LanguageLiteral => MultilingualText(Map(l.language -> l.value))
    case _ => null
  }

  /** Adds the values of a multivalued text metaslot, gathered from all its properties, to `out`.
    * Texts that each have a different language become one multilingual text. Otherwise we can't
    * tell which are translations, so each becomes its own value.
    */
  private def addTexts(
      values: mutable.ArrayBuffer[Annotation],
      out: mutable.ArrayBuffer[String | LocalizedText | UriOrCurie],
  ): Unit =
    if (values.length > 1 && oneLanguageEach(values)) out.addOne(textOf(values))
    else {
      values.foreach { a =>
        val text = singleText(a.value)
        out.addOne(if (text ne null) text else MultilingualText(Map.empty))
      }
    }

  private def linkmlAnnotations(
      rest: mutable.ArrayBuffer[Annotation],
  ): Map[String, LinkmlAnnotation] =
    if (!config.annotations) Map.empty
    else {
      val byProperty = mutable.HashMap.empty[String, mutable.ArrayBuffer[Node]]
      rest.foreach(a =>
        byProperty.getOrElseUpdate(a.property, mutable.ArrayBuffer.empty).addOne(a.value),
      )
      val properties = byProperty.keysIterator.toArray
      java.util.Arrays.sort(properties, Ordering.String)
      val result = VectorMap.newBuilder[String, LinkmlAnnotation]
      val texts = mutable.ArrayBuffer.empty[String]
      val seen = mutable.HashSet.empty[String]
      properties.foreach { property =>
        names.ensurePrefix(property)
        // The key is written as it is, so it is a CURIE if it can be.
        val key = names.curie(property)
        // Dropping language tags can make two values equal, so remove duplicates.
        texts.clear()
        seen.clear()
        byProperty(property).foreach { v =>
          val text = v match {
            case i: Iri => i.value
            case other => textIn(other)
          }
          if ((text ne null) && seen.add(text)) texts.addOne(text)
        }
        if (texts.nonEmpty) {
          val value =
            if (texts.length == 1) yamlString(texts.head)
            else {
              val sb = new java.lang.StringBuilder
              texts.foreach(t => sb.append("- ").append(yamlString(t).value))
              LinkmlAny(sb.toString)
            }
          result.addOne(
            key -> LinkmlAnnotation(extensionTag = names.uri(property), extensionValue = value),
          )
        }
      }
      result.result()
    }
}

private[owl] object OwlAnnotationReader {

  /** The metaslots of a term, and its other annotations. */
  type Documentation = (metadata: Metadata, annotations: Map[String, LinkmlAnnotation])

  /** The metaslots to fill, each with its annotation properties in order of preference. */
  private type Sources =
    mutable.ArrayBuffer[(field: Metadata.Field, properties: mutable.ArrayBuffer[String])]

  /** The text of a literal or an IRI, or `null` for anything else. */
  private def textOrIri(node: Node): String = node match {
    case i: Iri => i.value
    case other => textIn(other)
  }

  private val singleValued = Set(
    "title",
    "description",
    "source",
    "created_by",
    "created_on",
    "last_updated_on",
    "modified_by",
    "status",
    "in_language",
    "deprecated",
    "license",
    "version",
  )

  /** The text of a literal, or `null` if the node is not a literal. */
  private def textIn(node: Node): String = node match {
    case l: Literal => l.value
    case l: LanguageLiteral => l.value
    case _ => null
  }

  private def yamlString(value: String): LinkmlAny = LinkmlAny.text(value)

  private def textsOf(
      values: collection.Seq[String | LocalizedText | UriOrCurie],
  ): mutable.HashSet[String] = {
    val texts = mutable.HashSet.empty[String]
    values.foreach {
      case t: String => texts.addOne(t)
      case t: PlainText => texts.addOne(t.value)
      case t: MultilingualText => texts.addAll(t.mapping.valuesIterator)
      case u: UriOrCurie => texts.addOne(u.original)
    }
    texts
  }

  private def removeTaken(
      annotations: mutable.ArrayBuffer[Annotation],
      taken: java.util.BitSet,
  ): Unit = {
    val count = annotations.length
    var kept = 0
    var i = 0
    while (i < count) {
      if (!taken.get(i)) {
        annotations(kept) = annotations(i)
        kept += 1
      }
      i += 1
    }
    annotations.dropRightInPlace(count - kept)
  }
}
