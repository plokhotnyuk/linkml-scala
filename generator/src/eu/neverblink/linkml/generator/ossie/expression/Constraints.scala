package eu.neverblink.linkml.generator.ossie.expression

import eu.neverblink.linkml.generator.ossie.expression.Expression.{AtLeast, AtMost, RegexpLike}
import eu.neverblink.linkml.runtime.FastUtils.*
import eu.neverblink.linkml.runtime.LinkmlAny

/** The value constraints used in Ossie in the `requires` field, for one specific [[Ref]].
  *
  * This is the subset of the constraints that can be expressed in LinkML currently.
  */
private[ossie] final case class Constraints(
    minimumValue: Option[LinkmlAny] = None,
    maximumValue: Option[LinkmlAny] = None,
    pattern: Option[String] = None,
) {

  /** As expressions over [[ref]]. A bound that cannot be written as an Ossie value is left out. */
  def render(ref: Ref): Seq[Expression] = {
    val out = Seq.newBuilder[Expression]
    minimumValue.flatMap(Literal.fromLinkml).foreachFast(v => out += AtLeast(ref, v))
    maximumValue.flatMap(Literal.fromLinkml).foreachFast(v => out += AtMost(ref, v))
    pattern.foreachFast(p => out += RegexpLike(ref, Literal.Text(p)))
    out.result()
  }
}

private[ossie] object Constraints {

  /** Gather constraints [[expressions]] place on [[ref]] into [[Constraints]].
    *
    * @return
    *   the constraints, and the expressions that did not become one: those about another name,
    *   those that LinkML cannot express, and a second bound or pattern
    */
  def from(ref: Ref, expressions: Seq[Expression]): (Constraints, Seq[Expression]) = {
    val unused = Seq.newBuilder[Expression]
    val constraints = expressions.foldLeft(Constraints()) { (acc, expression) =>
      expression match {
        case AtLeast(r, v) if r == ref && acc.minimumValue.isEmpty =>
          acc.copy(minimumValue = Some(v.toLinkml))
        case AtMost(r, v) if r == ref && acc.maximumValue.isEmpty =>
          acc.copy(maximumValue = Some(v.toLinkml))
        case RegexpLike(r, p) if r == ref && acc.pattern.isEmpty =>
          acc.copy(pattern = Some(p.value))
        case _ =>
          unused += expression
          acc
      }
    }
    (constraints, unused.result())
  }
}
