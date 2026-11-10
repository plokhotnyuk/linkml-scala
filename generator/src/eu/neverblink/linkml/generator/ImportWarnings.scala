package eu.neverblink.linkml.generator

import _root_.scala.collection.mutable

/** What an importer could handle during the import process. Warnings are grouped by kind to keep
  * the report short.
  */
final class ImportWarnings {
  private val byKind = mutable.LinkedHashMap.empty[String, mutable.ArrayBuffer[String]]

  def warn(kind: String, detail: String): Unit =
    byKind.getOrElseUpdate(kind, mutable.ArrayBuffer.empty) += detail

  /** One line per kind, with the first few details. */
  def lines: Seq[String] =
    byKind.toSeq.map { (kind, details) =>
      val distinct = details.distinct
      val shown = distinct.take(5).mkString("; ")
      val more = if distinct.size > 5 then s"; and ${distinct.size - 5} more" else ""
      s"$kind (${distinct.size}): $shown$more"
    }
}
