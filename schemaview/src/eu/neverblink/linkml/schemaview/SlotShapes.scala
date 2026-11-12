package eu.neverblink.linkml.schemaview

import eu.neverblink.linkml.runtime.FastUtils.*
import scala.collection.mutable

/** Tells which version of a slot sets the shape of a field in each class, so that the field fits
  * what the class's ancestors say about it.
  *
  * In many formats a class inherits what its parents say about a field: the fields of a GraphQL
  * interface, the `def`s of a Scala abstract class. A field can only narrow them in the ways the
  * format allows, so a `slot_usage` that changes the field in other ways can't change it in the
  * output. For example, a Scala field can't become `String` when the parent has `Option[String]`.
  *
  * All classes that inheritance links and that have the slot use the shape of the topmost classes
  * among them: those without a parent that has the slot. When the topmost classes give different
  * shapes, such as two mixins of a class, they all use the slot as its definition gives it, before
  * any `slot_usage`.
  *
  * @param sameShape
  *   Whether two versions of a slot give fields of the same shape in the format, such as the same
  *   wrapper in Scala.
  */
final class SlotShapes(sameShape: (SlotView, SlotView) => Boolean)(using sv: SchemaView) {

  /** The results of [[shapesOf]], by slot name. */
  private val shapes = mutable.HashMap.empty[String, collection.Map[String, SlotView]]

  /** The version of the slot that sets the shape of its field in the class.
    *
    * @param cls
    *   The class
    * @param name
    *   Name of the slot
    * @return
    *   The class's own version of the slot if the class doesn't have the slot
    */
  def of(cls: ClassView, name: String): SlotView = {
    val byClass = shapes.getOrElseUpdate(name, shapesOf(name))
    val shape = byClass.getOrElse(cls.name, null)
    if (shape ne null) shape else cls.derivedAttributes(name)
  }

  /** The version of a slot that sets the shape of its field in each class with the slot, by class
    * name.
    */
  private def shapesOf(name: String): collection.Map[String, SlotView] = {
    val result = mutable.HashMap.empty[String, SlotView]
    sv.classes.values.foreach { start =>
      if (!result.contains(start.name) && start.derivedAttributes.contains(name)) {
        // The classes with the slot that inheritance links to `start`
        val group = mutable.ArrayBuffer(start)
        val seen = mutable.HashSet(start.name)
        def visit(cls: ClassView): Unit =
          if (cls.derivedAttributes.contains(name) && seen.add(cls.name)) group.addOne(cls)
        var i = 0
        while (i < group.size) {
          val cls = group(i)
          cls.parents.foreach(visit)
          cls.children.foreach(visit)
          i += 1
        }
        var shape: SlotView = null
        var same = true
        group.foreach { cls =>
          if (!cls.parents.exists(_.derivedAttributes.contains(name))) {
            val own = cls.derivedAttributes(name)
            if (shape eq null) shape = own
            else if (!sameShape(shape, own)) same = false
          }
        }
        if (!same) shape = start.definedSlot(name).getOrElseFast(shape)
        group.foreach(cls => result.update(cls.name, shape))
      }
    }
    result
  }
}
