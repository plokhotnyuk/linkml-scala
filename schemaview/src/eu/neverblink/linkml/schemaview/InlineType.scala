package eu.neverblink.linkml.schemaview

/** Inline type for a with commonly enforceable typing rules:
  *
  * Given a type `T`, the inlined types in Scala would be:
  *   - plain: `T`
  *   - optional: `Option[T]`
  *   - list: `Seq[T]`
  *   - dict: `Map[String, T]`
  */
enum InlineType:
  case plain, optional, list
  case dict(form: DictForm)

object InlineType {

  /** Derive an [[InlineType]] for a given slot's range using an implicit SchemaView
    */
  def apply(v: SlotView): InlineType = {
    val inlined = v.derivedInlined

    if !v.slot.required && !v.slot.multivalued then optional
    else if v.slot.multivalued && (!inlined || v.slot.inlinedAsList) then list
    else if v.slot.multivalued && inlined && !v.slot.inlinedAsList then {
      CollectionForm.ofRange(v) match {
        case CollectionForm.ListOnly => list
        case style: DictForm => dict(style)
      }
    } else plain
  }
}
