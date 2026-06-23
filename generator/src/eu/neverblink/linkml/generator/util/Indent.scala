package eu.neverblink.linkml.generator.util

import java.lang

class Indent(spaces: Int = 2)(inner: lang.StringBuilder => Unit) {
  override def toString: String = {
    val stringBuilder = new lang.StringBuilder()
    inner(stringBuilder)
    stringBuilder.toString.indent(spaces)
  }
}
