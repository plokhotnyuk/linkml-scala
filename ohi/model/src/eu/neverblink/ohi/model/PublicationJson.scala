package eu.neverblink.ohi.model

import eu.neverblink.linkml.yaml.LinkmlYamlCodec
import eu.neverblink.ohi.model.generated.{ArtifactOrigin, Format, Publication}
import org.virtuslab.yaml.Node

/** Decodes publication metadata into the generated class, discarding undeclared fields and
  * artifacts with a format or origin added after this build.
  */
object PublicationJson {
  private val codec: LinkmlYamlCodec[Publication] = LinkmlYamlCodec.derived
  private val formatCodec: LinkmlYamlCodec[Format] = LinkmlYamlCodec.derived
  private val originCodec: LinkmlYamlCodec[ArtifactOrigin] = LinkmlYamlCodec.derived

  /** @throws IllegalArgumentException
    *   if `text` does not decode as a publication or breaks a rule between its fields
    */
  def decode(text: String): Publication = {
    val node = ModelJson.updated(ModelJson.parse(text), "artifacts") {
      case artifacts: Node.SequenceNode =>
        val known = artifacts.nodes.filterNot(artifact =>
          ModelJson.get(artifact, "format").exists(ModelJson.isNew(formatCodec, _)) ||
            ModelJson.get(artifact, "origin").exists(ModelJson.isNew(originCodec, _)),
        )
        require(
          artifacts.nodes.isEmpty || known.nonEmpty,
          "publication has no artifacts that this SDK version supports",
        )
        Node.SequenceNode(known*)
      case other => other
    }
    val publication = ModelJson.decode(codec, node)
    require(
      publication.preferredPrefix.isEmpty || publication.namespaceIri.nonEmpty,
      "preferred_prefix requires namespace_iri",
    )
    val artifactUrls = publication.artifacts.map(_.url)
    require(artifactUrls.distinct.size == artifactUrls.size, "artifacts must have unique URLs")
    val dependencyUrls = publication.dependencies.map(_.baseUrl)
    require(
      dependencyUrls.distinct.size == dependencyUrls.size,
      "dependencies must have unique base_url values",
    )
    require(
      !dependencyUrls.contains(publication.baseUrl),
      "dependencies must not contain the publication itself",
    )
    publication
  }
}
