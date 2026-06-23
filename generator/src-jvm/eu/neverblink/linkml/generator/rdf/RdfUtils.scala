package eu.neverblink.linkml.generator.rdf

import eu.neverblink.linkml.generator.rdf.Triple
import org.eclipse.rdf4j.rio.{RDFFormat, Rio, WriterConfig}
import org.eclipse.rdf4j.model.{Model, Value, ValueFactory}
import org.eclipse.rdf4j.model.{IRI as Rdf4jIri, Resource as Rdf4jResource}
import org.eclipse.rdf4j.model.impl.SimpleValueFactory
import org.eclipse.rdf4j.model.util.ModelBuilder
import org.eclipse.rdf4j.rio.helpers.BasicWriterSettings
import java.io.StringWriter

object RdfUtils {

  /** Convert the provided RDF model to rdf4j model.
    *
    * @param model
    *   the model to convert
    * @param vf
    *   the rdf4j value factory
    * @return
    *   the rdf4j model
    */
  def toRdf4jModel(model: (Seq[Namespace], Seq[Triple]))(using vf: ValueFactory): Model = {
    def toRdf4jValue(node: Node): Value = node match {
      case r: Resource => toRdf4jResource(r)
      case l: Literal => vf.createLiteral(l.value, toRdf4jIri(l.datatype))
    }

    def toRdf4jResource(res: Resource): Rdf4jResource = res match {
      case i: Iri => toRdf4jIri(i)
      case b: BlankNode => vf.createBNode(b.id)
    }

    def toRdf4jIri(iri: Iri): Rdf4jIri = vf.createIRI(iri.value)

    val (namespaces, triples) = model
    val builder = new ModelBuilder
    namespaces.foreach(n => builder.setNamespace(n.prefix, n.name))
    triples.foreach { t =>
      builder.add(toRdf4jResource(t.subj), toRdf4jIri(t.pred), toRdf4jValue(t.obj))
    }
    builder.build()
  }

  /** Serialize the provided RDF model into the turtle format.
    * @param model
    *   the model to serialize
    * @return
    *   the string of turtle representation
    */
  def toTurtle(model: (Seq[Namespace], Seq[Triple])): String = {
    val out = new StringWriter
    val config = new WriterConfig
    config.set(BasicWriterSettings.INLINE_BLANK_NODES, true)
    Rio.write(
      toRdf4jModel(model)(using SimpleValueFactory.getInstance()),
      out,
      RDFFormat.TURTLE,
      config,
    )
    out.toString
  }
}
