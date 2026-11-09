package eu.neverblink.linkml.generator.integration

import eu.neverblink.linkml.generator.ossie.{OssieCases, OssieImporter}
import eu.neverblink.linkml.generator.owl.{Axiom, ClassExpr, EntityKind, OwlGenerator, PropertyRef}
import eu.neverblink.linkml.schemaview.{SchemaIssues, SchemaView}
import org.scalatest.matchers.should.Matchers
import org.scalatest.wordspec.AnyWordSpec

import java.io.ByteArrayInputStream
import java.nio.charset.StandardCharsets.UTF_8

/** Tests that import a schema with one converter and generate from it with another. */
class ConversionChainSpec extends AnyWordSpec, Matchers {

  private def importOssie(ontology: String): SchemaView =
    SchemaIssues.orThrow(
      SchemaView.loadSchemaViewFromString(
        OssieImporter().serialize(ByteArrayInputStream(ontology.getBytes(UTF_8))),
      ),
    )

  "Ossie -> LinkML -> OWL" should {
    "keep a literal identifier as a required property" in {
      val axioms = OwlGenerator(using importOssie(OssieCases.nonStandardLibrary)).ontology().axioms
      val isbn = "https://example.org/books/isbn"
      axioms should contain allOf (
        Axiom.Declaration(EntityKind.DataProperty, isbn),
        Axiom.SubClassOf(
          ClassExpr.Named("https://example.org/books/Book"),
          ClassExpr.Cardinality(ClassExpr.Bound.Exact, 1, PropertyRef(isbn)),
        ),
      )
    }
  }
}
