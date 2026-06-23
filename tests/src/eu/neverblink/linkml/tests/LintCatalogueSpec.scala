package eu.neverblink.linkml.tests

import org.scalatest.matchers.should.Matchers
import org.scalatest.wordspec.AnyWordSpec

class LintCatalogueSpec extends AnyWordSpec, Matchers {
  for entry <- ModelCatalogue.all do {
    s"Model '${entry.model.root.name}'" should {
      "lint" in {
        entry.model.lint() shouldBe None
      }
    }
  }
}
