package eu.neverblink.linkml.generator.graphql

import eu.neverblink.linkml.tests.{ModelCatalogue, ModelCatalogueSpec}
import eu.neverblink.linkml.schemaview.SchemaIssues
import eu.neverblink.linkml.schemaview.SchemaView
import org.scalatest.wordspec.AnyWordSpec
import org.scalatest.matchers.should.Matchers
import sangria.ast
import sangria.schema.Schema
import sangria.parser.{ParserConfig, QueryParser}

class GraphQlGeneratorSyntaxSpec extends AnyWordSpec, Matchers, ModelCatalogueSpec {
  // dummy query object to make the generated types a valid graphql schema
  val dummyQuery: String =
    """type Query {
      |  test: String
      |}
      |""".stripMargin

  def parseOrThrow(schema: String): Schema[Any, Any] = {
    val doc = QueryParser.parse(schema, ParserConfig()).get
    checkInterfaceFields(doc)
    Schema.buildFromAst(doc)
  }

  /** Checks that each type and interface has all fields of the interfaces it implements, with the
    * same type or a subtype of it, as GraphQL requires. Sangria adds a missing field from the
    * interface, so it doesn't report it.
    */
  private def checkInterfaceFields(doc: ast.Document): Unit = {
    val interfaceFields = doc.definitions.collect { case i: ast.InterfaceTypeDefinition =>
      i.name -> i.fields
    }.toMap
    val implemented = doc.definitions.collect {
      case o: ast.ObjectTypeDefinition => o.name -> o.interfaces.map(_.name)
      case i: ast.InterfaceTypeDefinition => i.name -> i.interfaces.map(_.name)
    }.toMap
    def implements(name: String, interface: String): Boolean =
      name == interface || implemented.getOrElse(name, Nil).exists(implements(_, interface))
    // A subtype adds `!`, or is a type that implements the interface's type
    def isSubtype(tpe: ast.Type, of: ast.Type): Boolean = tpe match {
      case t: ast.NotNullType =>
        of match {
          case o: ast.NotNullType => isSubtype(t.ofType, o.ofType)
          case _ => isSubtype(t.ofType, of)
        }
      case t: ast.ListType =>
        of match {
          case o: ast.ListType => isSubtype(t.ofType, o.ofType)
          case _ => false
        }
      case t: ast.NamedType =>
        of match {
          case o: ast.NamedType => implements(t.name, o.name)
          case _ => false
        }
    }
    def show(tpe: ast.Type): String = tpe match {
      case t: ast.NotNullType => show(t.ofType).concat("!")
      case t: ast.ListType => s"[${show(t.ofType)}]"
      case t: ast.NamedType => t.name
    }
    def check(name: String, interfaces: Seq[ast.NamedType], fields: Seq[ast.FieldDefinition]) =
      interfaces.foreach { i =>
        interfaceFields.getOrElse(i.name, Vector.empty).foreach { inherited =>
          withClue(s"$name.${inherited.name} of ${i.name}: ") {
            val field = fields.find(_.name == inherited.name)
            field.map(_.name) shouldBe Some(inherited.name)
            withClue(s"${show(field.get.fieldType)} of ${show(inherited.fieldType)}: ") {
              isSubtype(field.get.fieldType, inherited.fieldType) shouldBe true
            }
          }
        }
      }
    doc.definitions.foreach {
      case o: ast.ObjectTypeDefinition => check(o.name, o.interfaces, o.fields)
      case i: ast.InterfaceTypeDefinition => check(i.name, i.interfaces, i.fields)
      case _ =>
    }
  }

  "GraphQlGenerator" should {
    for entry <- ModelCatalogue.all do
      s"generate a valid schema for model '${entry.name}'" in {
        processSkip(entry.name, "")
        val schema = {
          dummyQuery +
            GraphQlGenerator(using entry.model).serialize()
        }
        val result = parseOrThrow(schema)

        result.typeList.map(_.name) should contain(
          GraphQlRenamer.className(entry.model.treeRoot.get),
        )
      }

    "give an implementation the stub field of an interface without fields" in {
      val sv = SchemaIssues.orThrow(
        SchemaView.loadSchemaViewFromString(
          """id: https://example.org/stub/
            |name: stub
            |prefixes:
            |  linkml: https://w3id.org/linkml/
            |default_prefix: stub
            |imports:
            |  - linkml:types
            |classes:
            |  Empty:
            |    abstract: true
            |  Filled:
            |    is_a: Empty
            |    slots:
            |      - labels
            |slots:
            |  labels:
            |    range: string
            |""".stripMargin,
        ),
      )
      val result = parseOrThrow(dummyQuery + GraphQlGenerator(using sv).serialize())
      result.typeList.map(_.name) should contain("Filled")
    }

    "generate the metamodel" in {
      val sv = SchemaIssues.orThrow(SchemaView.loadSchemaViewFromUri("linkml:meta"))
      val schema = {
        dummyQuery +
          GraphQlGenerator(using sv).serialize()
      }

      val result = parseOrThrow(schema)

      result.typeList.map(_.name) should contain(GraphQlRenamer.className(sv.treeRoot.get))
    }
  }
}
