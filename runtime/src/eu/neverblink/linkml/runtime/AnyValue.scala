package eu.neverblink.linkml.runtime

case class AnyValue private (value: String) {
  override def toString: String = value
}

object AnyValue {
  def apply(s: String) = new AnyValue(s)
}
