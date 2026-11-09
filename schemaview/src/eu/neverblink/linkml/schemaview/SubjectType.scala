package eu.neverblink.linkml.schemaview

/** Enum defining how a value of a LinkML type becomes RDF.
  *   - uri: value is an IRI
  *   - curie: value is a CURIE, expanded to an IRI
  *   - uriOrCurie: value is a URI or a CURIE, and lifted or expanded accordingly
  *   - implicitPrefix: value is appended to the `implicit_prefix` namespace to make an IRI
  *   - base: value is an RDF Literal. As an identifier, it is also resolved against the base to
  *     make the IRI of the node, and kept as a required property.
  *
  * An identifier of any other kind is only the IRI of the node, so stating it as a property is
  * optional.
  */
enum SubjectType:
  case uri, curie, uriOrCurie, base
  case implicitPrefix(prefix: String)

  /** Whether a value of this type that is not a reference is an RDF IRI rather than an RDF Literal.
    */
  def isIri: Boolean = this ne SubjectType.base
