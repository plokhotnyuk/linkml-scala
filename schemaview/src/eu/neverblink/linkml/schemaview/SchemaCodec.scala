package eu.neverblink.linkml.schemaview

import eu.neverblink.linkml.metamodel.{Codec, Prefix, Prefixes, SchemaDefinition}
import eu.neverblink.linkml.runtime.{PrefixMap, UriOrCurie, named, simpleDict}
import eu.neverblink.linkml.runtime.FastUtils.*
import eu.neverblink.linkml.yaml.LinkmlYamlCodec
import org.virtuslab.yaml.{Node, StringNode}

/** Decodes and encodes LinkML schemas with their prefixes.
  *
  * Decoding expands each CURIE in a `uriorcurie` slot whose prefix is known, and encoding compacts
  * each URI that a known namespace matches. So code that works with a decoded schema gets URIs, not
  * CURIEs. A value with an unknown prefix, such as `xsd:string` without an `xsd` prefix, is a URI
  * with that prefix as its scheme.
  *
  * The prefixes of a schema are, in order of precedence:
  *
  *   1. The schema's own `prefixes`.
  *   2. The `semweb_context` prefixes, if the schema lists it in `default_curi_maps`.
  *   3. The prefixes of the LinkML metamodel.
  *
  * The prefixes of imported schemas are never used.
  *
  * A value without a colon, such as `Person`, is put after the namespace of the schema's
  * `default_prefix`, or after the schema's `id` if it has no `default_prefix` (see
  * [[defaultNamespace]]). This isn't done for `imports`, where such a value is a path relative to
  * the importing schema.
  */
object SchemaCodec {

  /** Decode a schema, expanding CURIEs with its prefixes.
    *
    * @throws eu.neverblink.linkml.yaml.DecodeError
    *   If the node is not a valid schema
    */
  def decode(node: Node): SchemaDefinition = {
    val declared = prefixesCodec.decode(node)
    val prefixes = prefixMap(
      declared.prefixes,
      declared.defaultCuriMaps,
      new Some(defaultNamespace(declared.id, declared.defaultPrefix, declared.prefixes)),
    )
    val imports = importsCodec
      .decode(node, prefixes = prefixMap(declared.prefixes, declared.defaultCuriMaps, None))
      .imports
    Codec.codec.decode(node, prefixes = prefixes).copy(imports = imports)
  }

  /** Decode a schema that may leave out its `id`, `name` and default prefix, expanding CURIEs with
    * its prefixes. Each given value is used only where the schema doesn't declare its own:
    *
    *   - `id` when the schema has no `id`, and `name` when it has no `name`.
    *   - `defaultPrefix` is added to the schema's `prefixes` when they have no prefix with its
    *     name, and is the schema's `default_prefix` when the schema has none.
    *
    * The given values are added before decoding, so CURIEs and values without a colon are expanded
    * with them.
    *
    * @throws eu.neverblink.linkml.yaml.DecodeError
    *   If the node is not a valid schema
    */
  def decode(
      node: Node,
      id: String,
      name: String,
      defaultPrefix: Option[Prefix] = None,
  ): SchemaDefinition =
    node match {
      case m: Node.MappingNode => decode(withDefaults(m, id, name, defaultPrefix))
      case _ => decode(node)
    }

  /** Encode a schema, compacting URIs with its prefixes.
    *
    * @param fullUris
    *   Write URIs in full instead
    */
  def encode(schema: SchemaDefinition, fullUris: Boolean = false): Node = {
    val prefixes = prefixMap(schema)
    Codec.codec.encode(schema, prefixes = if (fullUris) prefixes.withoutCompaction else prefixes)
  }

  /** Get the prefixes of a schema, in the order of precedence given above.
    *
    * Namespaces aren't checked here. When a schema is loaded, the validator reports a namespace
    * that isn't a valid URI as `InvalidUriOrCurie`.
    */
  def prefixMap(schema: SchemaDefinition): PrefixMap =
    prefixMap(
      schema.prefixes,
      schema.defaultCuriMaps,
      new Some(defaultNamespace(schema.id.original, schema.defaultPrefix, schema.prefixes)),
    )

  /** Get the namespace of a schema's `default_prefix`. Without a `default_prefix`, or if it isn't
    * in the schema's `prefixes`, it is the schema's `id`, with a `/` added if the `id` doesn't end
    * with `/` or `#`, as in LinkML-Python.
    */
  def defaultNamespace(
      id: String,
      defaultPrefix: Option[String],
      prefixes: Map[String, Prefix],
  ): String =
    defaultPrefix.flatMapFast(p => prefixes.get(p)).foldFast {
      val len = id.length
      if (len > 0) {
        val ch = id.charAt(len - 1)
        if (ch == '#' || ch == '/') id
        else id.concat("/")
      } else "/"
    }(_.prefixReference.original)

  /** Get the prefixes of a schema from its `prefixes`, `default_curi_maps` and default namespace.
    */
  private def prefixMap(
      prefixes: Map[String, Prefix],
      defaultCuriMaps: Seq[String],
      defaultNamespace: Option[String],
  ): PrefixMap =
    PrefixMap(
      overrides = prefixes.values.map(p => (p.prefixPrefix, p.prefixReference.original)),
      defaults =
        if (defaultCuriMaps.contains("semweb_context")) semwebContextPrefixes
        else metamodelPrefixes,
      defaultNamespace = defaultNamespace,
    )

  /** Add the given `id`, `name` and default prefix to a schema's mapping where it doesn't declare
    * them. The values are tagged as strings, so a name of digits only stays a string.
    */
  private def withDefaults(
      node: Node.MappingNode,
      id: String,
      name: String,
      defaultPrefix: Option[Prefix],
  ): Node.MappingNode = {
    var hasId, hasName, hasDefaultPrefix = false
    var prefixesKey, prefixes: Node = null
    val mappings = Map.newBuilder[Node, Node]
    // The declared `prefixes` are left out here and added back below, with the default prefix if
    // they don't have it. A key node equals another only at the same position, so adding `prefixes`
    // again without removing it would keep both.
    node.mappings.foreach { kv =>
      var keep = true
      kv._1 match {
        case k: Node.ScalarNode =>
          k.value match {
            case "id" => hasId = true
            case "name" => hasName = true
            case "default_prefix" => hasDefaultPrefix = true
            case "prefixes" =>
              prefixesKey = k
              prefixes = kv._2
              keep = false
            case _ =>
          }
        case _ =>
      }
      if (keep) mappings.addOne(kv)
    }
    if (!hasId) mappings.addOne((StringNode("id"), StringNode(id)))
    if (!hasName) mappings.addOne((StringNode("name"), StringNode(name)))
    defaultPrefix match {
      case p: Some[Prefix] =>
        val prefix = p.value.prefixPrefix
        val entry = (StringNode(prefix), StringNode(p.value.prefixReference.original))
        prefixes match {
          case null => mappings.addOne((StringNode("prefixes"), Node.MappingNode(entry)))
          case m: Node.MappingNode if !m.mappings.keysIterator.exists {
                case k: Node.ScalarNode => k.value == prefix
                case _ => false
              } =>
            mappings.addOne((prefixesKey, Node.MappingNode(m.mappings + entry)))
          case _ => mappings.addOne((prefixesKey, prefixes))
        }
        if (!hasDefaultPrefix) mappings.addOne((StringNode("default_prefix"), StringNode(prefix)))
      case _ =>
        if (prefixes ne null) mappings.addOne((prefixesKey, prefixes))
    }
    Node.MappingNode(mappings.result())
  }

  /** The prefixes of the LinkML metamodel. */
  private val metamodelPrefixes: Iterable[(String, String)] = Prefixes.map

  /** The prefixes of the `semweb_context` CURIE map, together with the metamodel's. */
  private val semwebContextPrefixes: Iterable[(String, String)] = Vector.newBuilder
    .addAll(metamodelPrefixes)
    .addAll(semwebContextOnly)
    .result()

  private def semwebContextOnly: Seq[(String, String)] = Seq(
    "dc" -> "http://purl.org/dc/terms/",
    "faldo" -> "http://biohackathon.org/resource/faldo#",
    "foaf" -> "http://xmlns.com/foaf/0.1/",
    "oa" -> "http://www.w3.org/ns/oa#",
    "idot" -> "http://identifiers.org/",
    "void" -> "http://rdfs.org/ns/void#",
    "prov" -> "http://www.w3.org/ns/prov#",
    "dcat" -> "http://www.w3.org/ns/dcat#",
  )

  /** The slots of a schema that hold its prefixes, read before the rest of the schema. */
  private final case class DeclaredPrefixes(
      @simpleDict prefixes: Map[String, Prefix] = Map(),
      @named("default_curi_maps") defaultCuriMaps: Seq[String] = Nil,
      @named("default_prefix") defaultPrefix: Option[String] = None,
      id: String = "",
  )

  private val prefixesCodec: LinkmlYamlCodec[DeclaredPrefixes] =
    LinkmlYamlCodec.derived(extraSlotsAllowed = true)

  /** The imports of a schema, decoded without a default namespace. */
  private final case class DeclaredImports(imports: Seq[UriOrCurie] = Nil)

  private val importsCodec: LinkmlYamlCodec[DeclaredImports] =
    LinkmlYamlCodec.derived(extraSlotsAllowed = true)
}
