package eu.neverblink.linkml.tests

import eu.neverblink.linkml.schemaview.StringImporter

object CatalogueImporter extends StringImporter {
  def read(path: String): String = Resources.read(path)
}
