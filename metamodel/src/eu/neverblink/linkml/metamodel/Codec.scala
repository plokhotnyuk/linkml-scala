package eu.neverblink.linkml.metamodel

import eu.neverblink.linkml.yaml.LinkmlYamlCodec

object Codec {
  implicit val codec: LinkmlYamlCodec[SchemaDefinitionImpl] = LinkmlYamlCodec.derived
}
