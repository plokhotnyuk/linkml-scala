package eu.neverblink.linkml.runtime

final case class Anything private (value: String) {
  override def toString: String = value
}

object Anything {
  def apply(s: String) = new Anything(s)
}
