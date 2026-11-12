package eu.neverblink.linkml.schemaview

import org.scalatest.matchers.should.Matchers
import org.scalatest.wordspec.AnyWordSpec

class SlotShapesSpec extends AnyWordSpec, Matchers {
  private given sv: SchemaView = SchemaIssues.orThrow(
    SchemaView.loadSchemaViewFromString(
      """id: https://example.org/shapes/
        |name: shapes
        |imports:
        |  - linkml:types
        |default_prefix: https://example.org/shapes/
        |classes:
        |  Base:
        |    slots:
        |      - title
        |  Middle:
        |    is_a: Base
        |    slot_usage:
        |      title:
        |        required: true
        |  Leaf:
        |    is_a: Middle
        |  Optional:
        |    mixin: true
        |    slots:
        |      - title
        |  Required:
        |    mixin: true
        |    slots:
        |      - title
        |    slot_usage:
        |      title:
        |        required: true
        |  Both:
        |    mixins:
        |      - Optional
        |      - Required
        |  Alone:
        |    slots:
        |      - title
        |    slot_usage:
        |      title:
        |        required: true
        |slots:
        |  title:
        |    range: string
        |""".stripMargin,
    ),
  )

  // The shape is whether the slot is required
  private val shapes = new SlotShapes((a, b) => a.slot.required == b.slot.required)

  private def required(cls: String): Boolean = shapes.of(sv.classes(cls), "title").slot.required

  "SlotShapes" should {
    "give the descendants the version of the topmost class with the slot" in {
      sv.classes("Middle").derivedAttributes("title").slot.required shouldBe true
      required("Base") shouldBe false
      required("Middle") shouldBe false
      required("Leaf") shouldBe false
    }
    "give the slot as defined when the topmost classes disagree" in {
      sv.classes("Required").derivedAttributes("title").slot.required shouldBe true
      required("Optional") shouldBe false
      required("Required") shouldBe false
      required("Both") shouldBe false
    }
    "give a class without parents or descendants with the slot its own version" in {
      required("Alone") shouldBe true
    }
  }
}
