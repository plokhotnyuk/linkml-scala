package eu.neverblink.linkml.generator.util

import eu.neverblink.linkml.schemaview.{ClassView, InlineType}

/** Describes the type of a whole document that the code generators add for a tree root. */
object TreeRootDocument {

  def description(root: ClassView, inlineType: InlineType): String = inlineType match {
    case _: InlineType.plain.type => "A whole document: one " + root.name + "."
    case _: InlineType.optional.type => "A whole document: one " + root.name + " or null."
    case _: InlineType.list.type => "A whole document: a list of " + root.name + "."
    case _ => "A whole document: a dict of " + root.name + " by key."
  }
}
