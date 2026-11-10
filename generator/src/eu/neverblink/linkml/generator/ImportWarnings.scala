package eu.neverblink.linkml.generator

import _root_.scala.collection.mutable

/** What an importer could handle during the import process. Warnings are grouped by kind to keep
  * the report short.
  */
final class ImportWarnings {

  /** Warning details by kind. */
  private val byKind = mutable.HashMap.empty[String, mutable.ArrayBuffer[String]]

  /** The kinds of warnings, in the order of their first warning. */
  private val kinds = mutable.ArrayBuffer.empty[String]

  def warn(kind: String, detail: String): Unit = {
    var details = byKind.getOrElse(kind, null)
    if (details eq null) {
      details = mutable.ArrayBuffer.empty
      byKind.update(kind, details)
      kinds.addOne(kind)
    }
    details.addOne(detail)
  }

  /** One line per kind, with the first few details. */
  def lines: Seq[String] = {
    val report = Vector.newBuilder[String]
    kinds.foreach { kind =>
      val details = mutable.ArrayBuffer.empty[String]
      val seen = mutable.HashSet.empty[String]
      byKind(kind).foreach(d => if (seen.add(d)) details.addOne(d))
      val line = new java.lang.StringBuilder(kind).append(" (").append(details.length)
        .append("): ")
      var i = 0
      while (i < details.length && i < 5) {
        if (i > 0) line.append("; ")
        line.append(details(i))
        i += 1
      }
      if (details.length > 5) line.append("; and ").append(details.length - 5).append(" more")
      report.addOne(line.toString)
    }
    report.result()
  }
}
