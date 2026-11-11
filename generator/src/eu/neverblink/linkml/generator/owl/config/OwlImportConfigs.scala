package eu.neverblink.linkml.generator.owl.config

import eu.neverblink.linkml.generator.options.{NameStyle, OwlImportConfig, SomeValuesFrom}
import eu.neverblink.linkml.generator.owl.OwlImportNames
import eu.neverblink.linkml.yaml.LinkmlYamlCodec
import org.virtuslab.yaml.parseYaml

/** Reading [[OwlImportConfig]], which is generated from `model/converter/importer/owl-config.yaml`,
  * and the defaults that depend on code.
  */
object OwlImportConfigs {

  given codec: LinkmlYamlCodec[OwlImportConfig] = LinkmlYamlCodec.derived

  /** Read a config from YAML (or JSON). */
  def parse(yaml: String): OwlImportConfig =
    parseYaml(yaml).fold(
      error => throw IllegalArgumentException(s"Not a readable config: ${error.msg}"),
      node => codec.decode(node),
    )

  /** Default properties for each metaslot, in order of preference. Each list starts with the
    * metaslot's property in the LinkML metamodel, which the OWL generator writes. The exceptions
    * are `title`, written as `rdfs:label`, and `description`, written as `rdfs:comment` unless
    * asked for `skos:definition`. If a term has both, the definition becomes the description.
    * `rdfs:comment` comes before `dcterms:description`, which Dublin Core uses for usage notes.
    *
    * A value goes to the first metaslot that lists its property and still has room. So a second
    * `rdfs:comment` goes to `comments` once `description` has one.
    *
    * Subproperties declared in the ontology are read right after their parent.
    */
  val defaultMetadata: Seq[(String, Seq[String])] = Seq(
    "title" -> Seq("rdfs:label", "dcterms:title", "dc:title", "skos:prefLabel"),
    "description" -> Seq(
      "skos:definition",
      "obo:IAO_0000115",
      "prov:definition",
      "rdfs:comment",
      "dcterms:description",
      "dc:description",
      "obo:IAO_0000600",
      "dcterms:abstract",
    ),
    "aliases" -> Seq(
      "skos:altLabel",
      "oboInOwl:hasExactSynonym",
      "obo:IAO_0000118",
      "obo:IAO_0000111",
      "rdfs:label",
      "skos:prefLabel",
      "oboInOwl:hasRelatedSynonym",
      "oboInOwl:hasBroadSynonym",
      "oboInOwl:hasNarrowSynonym",
      "oboInOwl:hasSynonym",
    ),
    "comments" -> Seq("skos:note", "rdfs:comment", "skos:scopeNote", "vann:usageNote"),
    "notes" -> Seq(
      "skos:editorialNote",
      "skos:historyNote",
      "skos:changeNote",
      "obo:IAO_0000116",
      "obo:IAO_0000232",
    ),
    "examples" -> Seq("skos:example", "obo:IAO_0000112", "vann:example"),
    "see_also" -> Seq("rdfs:seeAlso", "obo:IAO_0000233"),
    "source" -> Seq("dcterms:source", "dc:source"),
    "contributors" -> Seq(
      "dcterms:contributor",
      "dcterms:creator",
      "dc:creator",
      "dc:contributor",
      "obo:IAO_0000117",
    ),
    "created_by" -> Seq("pav:createdBy", "oboInOwl:created_by"),
    "created_on" ->
      Seq("pav:createdOn", "dcterms:created", "oboInOwl:creation_date", "dcterms:issued"),
    "last_updated_on" -> Seq("pav:lastUpdatedOn", "dcterms:modified"),
    "modified_by" -> Seq("oslc:modifiedBy"),
    "status" -> Seq("bibo:status", "vs:term_status", "obo:IAO_0000114"),
    "in_language" -> Seq("schema:inLanguage"),
    "keywords" -> Seq("schema:keywords", "dc:subject"),
    "categories" -> Seq("dcterms:subject"),
    "mappings" -> Seq("skos:mappingRelation"),
    "exact_mappings" -> Seq("skos:exactMatch"),
    "close_mappings" -> Seq("skos:closeMatch"),
    "related_mappings" -> Seq("skos:relatedMatch"),
    "narrow_mappings" -> Seq("skos:narrowMatch"),
    "broad_mappings" -> Seq("skos:broadMatch"),
    "deprecated" -> Seq("owl:deprecated"),
    "license" -> Seq("dcterms:license", "cc:license", "dc:rights", "dcterms:rights"),
    "version" -> Seq("pav:version", "owl:versionInfo"),
  )

  /** Defaults that differ for the ontology itself. An ontology usually puts its summary in
    * `dcterms:description` or `dc:description`, and uses `rdfs:comment` for a change log, a request
    * to cite it or its terms of use.
    */
  val defaultOntologyMetadata: Map[String, Seq[String]] = Map(
    "description" -> Seq(
      "dcterms:description",
      "dc:description",
      "dcterms:abstract",
      "skos:definition",
      "obo:IAO_0000115",
      "prov:definition",
      "rdfs:comment",
      "obo:IAO_0000600",
    ),
  )

  private val defaultSlots: Set[String] = defaultMetadata.iterator.map(_._1).toSet

  extension (c: OwlImportConfig) {

    /** The default metadata sources, with this config's overrides applied.
      *
      * @param ontology
      *   Whether they are for the ontology header rather than its terms.
      */
    def metadataSources(ontology: Boolean = false): Seq[(String, Seq[String])] = {
      val sources = Vector.newBuilder[(String, Seq[String])]
      defaultMetadata.foreach { default =>
        val slot = default._1
        val overridden = c.metadata.getOrElse(slot, null)
        val defaults =
          if (ontology) defaultOntologyMetadata.getOrElse(slot, default._2) else default._2
        // Expand the defaults with the well-known prefixes only, not the ontology's: FRBR, for
        // example, binds `skos` to an old SKOS namespace.
        sources.addOne(
          slot -> (
            if (overridden ne null) overridden.properties
            else defaults.map(OwlImportNames.expand(_, Nil))
          ),
        )
      }
      c.metadata.foreachEntry { (slot, overridden) =>
        if (!defaultSlots.contains(slot)) sources.addOne(slot -> overridden.properties)
      }
      sources.result()
    }

    def prefixMap: Map[String, String] = c.prefixes.view.mapValues(_.namespace).toMap

    def renameMap: Map[String, String] = c.renames.view.mapValues(_.newName).toMap

    def datatypeMap: Map[String, String] = c.datatypes.view.mapValues(_.typeName).toMap

    def importMap: Map[String, String] = c.imports.view.mapValues(_.schema).toMap

    def classStyle: NameStyle = c.naming.flatMap(_.classes).getOrElse(NameStyle.Keep)

    def slotStyle: NameStyle = c.naming.flatMap(_.slots).getOrElse(NameStyle.Snake)

    def permissibleValueStyle: NameStyle =
      c.naming.flatMap(_.permissibleValues).getOrElse(NameStyle.Keep)

    def someValuesFromStyle: SomeValuesFrom = c.someValuesFrom.getOrElse(SomeValuesFrom.Required)
  }
}
