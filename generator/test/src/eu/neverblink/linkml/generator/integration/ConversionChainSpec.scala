package eu.neverblink.linkml.generator.integration

import eu.neverblink.linkml.generator.ossie.{OssieCases, OssieImporter}
import eu.neverblink.linkml.generator.owl.{Axiom, ClassExpr, EntityKind, OwlGenerator, PropertyRef}
import eu.neverblink.linkml.generator.rdfs.RdfsGenerator
import eu.neverblink.linkml.rdf.{CollectingRdfSink, Iri, Rdfs, Triple}
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

  /** Person and Car with a `name` each, both with `iri` or neither. */
  private def personAndCar(iri: String): String =
    s"""version: 0.2.0.dev0
       |name: names
       |ontology:
       |  - concept: Person
       |    type: EntityType
       |    relationships:
       |      - name: name$iri
       |        roles: [{concept: String}]
       |        multiplicity: ManyToOne
       |        verbalizes: ['{Person} has name {String}']
       |  - concept: Car
       |    type: EntityType
       |    relationships:
       |      - name: name$iri
       |        roles: [{concept: String}]
       |        multiplicity: ManyToOne
       |        verbalizes: ['{Car} has name {String}']
       |""".stripMargin

  private val ns = "https://example.org/names/"

  private def domainsInRdfs(ontology: String): Set[(String, String)] = {
    val sink = CollectingRdfSink()
    RdfsGenerator(using importOssie(ontology)).generate(sink)
    sink.triples.collect { case Triple(Iri(p), Rdfs.domain, Iri(c)) => p -> c }.toSet
  }

  private def domainsInOwl(ontology: String): Set[Axiom] =
    OwlGenerator(using importOssie(ontology)).ontology().axioms.collect { case d: Axiom.Domain =>
      d
    }.toSet

  "Ossie -> LinkML -> RDFS" should {
    "keep same-named relationships of two concepts apart, each with its concept as domain" in {
      domainsInRdfs(personAndCar("")) shouldBe
        Set(s"${ns}Person.name" -> s"${ns}Person", s"${ns}Car.name" -> s"${ns}Car")
    }

    "give a relationship iri that unrelated concepts share no domain" in {
      domainsInRdfs(personAndCar(s"\n        iri: ${ns}name")) shouldBe empty
    }
  }

  "Ossie -> LinkML -> OWL" should {
    "make each concept the domain of its relationships" in {
      domainsInOwl(personAndCar("")) shouldBe Set(
        Axiom.Domain(s"${ns}Person.name", ClassExpr.Named(s"${ns}Person")),
        Axiom.Domain(s"${ns}Car.name", ClassExpr.Named(s"${ns}Car")),
      )
    }

    "make the union of the concepts the domain of a relationship iri they share" in {
      domainsInOwl(personAndCar(s"\n        iri: ${ns}name")) shouldBe Set(
        Axiom.Domain(
          s"${ns}name",
          ClassExpr.UnionOf(Seq(ClassExpr.Named(s"${ns}Person"), ClassExpr.Named(s"${ns}Car"))),
        ),
      )
    }

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
