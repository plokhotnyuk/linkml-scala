package eu.neverblink.linkml.generator.owl

import eu.neverblink.linkml.generator.owl.Axiom.*
import eu.neverblink.linkml.rdf.Iri

import scala.collection.mutable
import scala.runtime.IntRef

/** Indexes an ontology's axioms for the importer and tracks which ones it has turned into LinkML.
  * The importer reports the ones left over.
  *
  * The entries of each index are in the order of the axioms.
  */
private[owl] final class OwlAxiomIndex(val axioms: Seq[Axiom]) {
  import OwlAxiomIndex.*

  private val handled = mutable.HashSet.empty[Axiom]

  /** Marks an axiom as turned into LinkML and returns it. */
  def take[A <: Axiom](a: A): A = {
    handled.addOne(a)
    a
  }

  /** Calls `f` with each axiom that was not turned into LinkML, in order. */
  def foreachUnhandled(f: Axiom => Unit): Unit = axioms.foreach(a => if (!handled.contains(a)) f(a))

  /** The kinds each IRI is declared as, one bit per [[EntityKind]]. */
  private val declared = mutable.HashMap.empty[String, IntRef]

  /** Whether the IRI is declared as any kind of entity. */
  def isDeclared(iri: String): Boolean = declared.contains(iri)

  /** Whether the IRI is declared as the given kind of entity. */
  def isDeclared(iri: String, kind: EntityKind): Boolean = {
    val kinds = declared.getOrElse(iri, null)
    (kinds ne null) && (kinds.elem & (1 << kind.ordinal)) != 0
  }

  // Each index below is filled while the axioms are read and is private, so only this class can
  // change it. The importer reads it through a method with the same name minus `Index`, which
  // returns it as a read-only type.

  private val annotationsOfIndex = mutable.HashMap.empty[String, mutable.ArrayBuffer[Annotation]]

  /** Annotations by subject. All of them are marked as handled here, and the importer reports the
    * ones it can't use itself.
    */
  def annotationsOf: Entries[Annotation] = annotationsOfIndex

  private val subClassOfIndex =
    mutable.HashMap.empty[String, mutable.ArrayBuffer[(axiom: SubClassOf, sup: ClassExpr)]]

  /** The superclasses of each named class. */
  def subClassOf: Entries[(axiom: SubClassOf, sup: ClassExpr)] = subClassOfIndex

  private val equivalentsIndex = mutable.HashMap
    .empty[String, mutable.ArrayBuffer[(axiom: EquivalentClasses, other: ClassExpr)]]

  /** Maps the first named class in each equivalence to the other operands. */
  def equivalents: Entries[(axiom: EquivalentClasses, other: ClassExpr)] = equivalentsIndex

  private val domainsIndex =
    mutable.HashMap.empty[String, mutable.ArrayBuffer[(axiom: Domain, domain: ClassExpr)]]

  /** The domains of each property. */
  def domains: Entries[(axiom: Domain, domain: ClassExpr)] = domainsIndex

  private val rangesIndex =
    mutable.HashMap.empty[String, mutable.ArrayBuffer[(axiom: Range, range: Filler)]]

  /** The ranges of each property. */
  def ranges: Entries[(axiom: Range, range: Filler)] = rangesIndex

  private val characteristicsOfIndex =
    mutable.HashMap.empty[String, mutable.ArrayBuffer[Characteristic]]

  /** The characteristic axioms of each property. */
  def characteristicsOf: Entries[Characteristic] = characteristicsOfIndex

  /** Whether the property is declared functional. */
  def isFunctional(property: String): Boolean = {
    val characteristics = characteristicsOfIndex.getOrElse(property, null)
    (characteristics ne null) &&
    characteristics.exists(_.characteristic == PropertyCharacteristic.Functional)
  }

  private val classAssertionsIndex = mutable.ArrayBuffer.empty[ClassAssertion]

  /** All class assertions, in order. */
  def classAssertions: collection.IndexedSeq[ClassAssertion] = classAssertionsIndex

  private val assertionsByIndividualIndex =
    mutable.HashMap.empty[String, mutable.ArrayBuffer[ClassAssertion]]

  /** The class assertions of each individual. */
  def assertionsByIndividual: Entries[ClassAssertion] = assertionsByIndividualIndex

  private val datatypeDefinitionsIndex = mutable.HashMap.empty[String, DatatypeDefinition]

  /** The definition of each datatype that has one. */
  def datatypeDefinitions: collection.Map[String, DatatypeDefinition] = datatypeDefinitionsIndex

  private val namedSubclassesIndex = mutable.HashSet.empty[String]

  /** Classes that have a named subclass. */
  def namedSubclasses: collection.Set[String] = namedSubclassesIndex

  private val inEquivalenceIndex = mutable.HashSet.empty[String]

  /** Classes that are an operand of an equivalence. */
  def inEquivalence: collection.Set[String] = inEquivalenceIndex

  private val inExpressionEquivalenceIndex = mutable.HashSet.empty[String]

  /** Classes that are an operand of an equivalence with an operand that is not a named class. */
  def inExpressionEquivalence: collection.Set[String] = inExpressionEquivalenceIndex

  private val domainClassesIndex = mutable.HashSet.empty[String]

  /** Classes that appear anywhere in the domain of some property, nested ones included. */
  def domainClasses: collection.Set[String] = domainClassesIndex

  private val superPropertiesIndex =
    mutable.HashMap.empty[String, mutable.ArrayBuffer[(axiom: SubPropertyOf, sup: String)]]

  /** The super properties of each property. */
  def superProperties: Entries[(axiom: SubPropertyOf, sup: String)] = superPropertiesIndex

  private val chainsIndex = mutable.HashMap.empty[String, mutable.ArrayBuffer[PropertyChain]]

  /** The property chains of each super property. */
  def chains: Entries[PropertyChain] = chainsIndex

  private val equivalentPropertiesIndex = mutable.HashMap
    .empty[String, mutable.ArrayBuffer[(axiom: EquivalentProperties, other: String)]]

  /** Maps the first property in each equivalence to the others. */
  def equivalentProperties: Entries[(axiom: EquivalentProperties, other: String)] =
    equivalentPropertiesIndex

  private val inversesIndex = mutable.ArrayBuffer.empty[InverseProperties]

  /** All inverse property axioms, in order. */
  def inverses: collection.IndexedSeq[InverseProperties] = inversesIndex

  private val disjointByClassIndex =
    mutable.HashMap.empty[String, mutable.ArrayBuffer[DisjointClasses]]

  /** The disjointness axioms of each named class in them. */
  def disjointByClass: Entries[DisjointClasses] = disjointByClassIndex

  private val disjointUnionsIndex = mutable.HashMap.empty[String, DisjointUnion]

  /** The disjoint union axiom of each class that has one. */
  def disjointUnions: collection.Map[String, DisjointUnion] = disjointUnionsIndex

  private val keysByClassIndex = mutable.HashMap.empty[String, mutable.ArrayBuffer[HasKey]]

  /** The key axioms of each named class. */
  def keysByClass: Entries[HasKey] = keysByClassIndex

  private val declarationsByIriIndex =
    mutable.HashMap.empty[String, mutable.ArrayBuffer[Declaration]]

  /** The declarations of each IRI. */
  def declarationsByIri: Entries[Declaration] = declarationsByIriIndex

  private val expressionsIndex = mutable.ArrayBuffer.empty[ClassExpr]

  /** Class expressions used directly in an axiom. Nested ones are not included. */
  def expressions: collection.IndexedSeq[ClassExpr] = expressionsIndex

  axioms.foreach {
    case a: Declaration =>
      declared.getOrElseUpdate(a.iri, IntRef.create(0)).elem |= 1 << a.kind.ordinal
      add(declarationsByIriIndex, a.iri, a)
    case a: AnnotationAssertion => add(annotationsOfIndex, a.subject, take(a).annotation)
    case a: SubClassOf =>
      a.sub match {
        case n: ClassExpr.Named =>
          add(subClassOfIndex, n.iri, (axiom = a, sup = a.sup))
          a.sup match {
            case sup: ClassExpr.Named => namedSubclassesIndex.addOne(sup.iri)
            case _ =>
          }
        case _ =>
      }
      expressionsIndex.addOne(a.sub)
      expressionsIndex.addOne(a.sup)
    case a: EquivalentClasses =>
      var first: ClassExpr.Named = null
      var allNamed = true
      a.operands.foreach {
        case n: ClassExpr.Named =>
          if (first eq null) first = n
          inEquivalenceIndex.addOne(n.iri)
        case _ => allNamed = false
      }
      if (!allNamed) {
        a.operands.foreach {
          case n: ClassExpr.Named => inExpressionEquivalenceIndex.addOne(n.iri)
          case _ =>
        }
      }
      if (first ne null) {
        a.operands.foreach { other =>
          if (other != first) add(equivalentsIndex, first.iri, (axiom = a, other = other))
        }
      }
      expressionsIndex.addAll(a.operands)
    case a: DisjointClasses =>
      a.operands.foreach {
        case n: ClassExpr.Named => add(disjointByClassIndex, n.iri, a)
        case _ =>
      }
      expressionsIndex.addAll(a.operands)
    case a: DisjointUnion =>
      disjointUnionsIndex.update(a.cls, a)
      expressionsIndex.addOne(ClassExpr.Named(a.cls))
      expressionsIndex.addAll(a.operands)
    case a: Domain =>
      add(domainsIndex, a.property, (axiom = a, domain = a.domain))
      foreachClassIn(a.domain)(domainClassesIndex.addOne)
      expressionsIndex.addOne(a.domain)
    case a: Range =>
      add(rangesIndex, a.property, (axiom = a, range = a.range))
      a.range match {
        case r: ClassExpr => expressionsIndex.addOne(r)
        case _ =>
      }
    case a: HasKey =>
      a.cls match {
        case n: ClassExpr.Named => add(keysByClassIndex, n.iri, a)
        case _ =>
      }
      expressionsIndex.addOne(a.cls)
    case a: ClassAssertion =>
      classAssertionsIndex.addOne(a)
      add(assertionsByIndividualIndex, a.individual, a)
      expressionsIndex.addOne(a.cls)
    case a: Characteristic => add(characteristicsOfIndex, a.property, a)
    case a: DatatypeDefinition => datatypeDefinitionsIndex.update(a.datatype, a)
    case a: SubPropertyOf => add(superPropertiesIndex, a.sub, (axiom = a, sup = a.sup))
    case a: PropertyChain => add(chainsIndex, a.sup, a)
    case a: EquivalentProperties =>
      if (a.operands.nonEmpty) {
        val first = a.operands.head
        a.operands.iterator.drop(1)
          .foreach(o => add(equivalentPropertiesIndex, first, (axiom = a, other = o)))
      }
    case a: InverseProperties => inversesIndex.addOne(a)
    case _ =>
  }
}

private[owl] object OwlAxiomIndex {

  /** A read-only index from an IRI to the entries for it, in the order of the axioms. */
  type Entries[A] = collection.Map[String, collection.IndexedSeq[A]]

  private def add[A](
      index: mutable.HashMap[String, mutable.ArrayBuffer[A]],
      key: String,
      value: A,
  ): Unit = index.getOrElseUpdate(key, mutable.ArrayBuffer.empty).addOne(value)

  /** Calls `f` with each named class in an expression, nested ones included, in order. */
  def foreachClassIn(e: Filler)(f: String => Unit): Unit = e match {
    case x: ClassExpr.Named => f(x.iri)
    case x: ClassExpr.IntersectionOf => x.operands.foreach(foreachClassIn(_)(f))
    case x: ClassExpr.UnionOf => x.operands.foreach(foreachClassIn(_)(f))
    case x: ClassExpr.ComplementOf => foreachClassIn(x.operand)(f)
    case x: ClassExpr.SomeValuesFrom => foreachClassIn(x.filler)(f)
    case x: ClassExpr.AllValuesFrom => foreachClassIn(x.filler)(f)
    case x: ClassExpr.Cardinality => if (x.filler.isDefined) foreachClassIn(x.filler.get)(f)
    case _ =>
  }

  /** Calls `f` with each property restricted in an expression, in order, and whether it is a data
    * restriction.
    */
  def foreachPropertyIn(e: Filler)(f: (String, Boolean) => Unit): Unit = e match {
    case x: ClassExpr.IntersectionOf => x.operands.foreach(foreachPropertyIn(_)(f))
    case x: ClassExpr.UnionOf => x.operands.foreach(foreachPropertyIn(_)(f))
    case x: ClassExpr.ComplementOf => foreachPropertyIn(x.operand)(f)
    case x: ClassExpr.SomeValuesFrom =>
      f(x.property.iri, x.filler.isInstanceOf[DataRange])
      foreachPropertyIn(x.filler)(f)
    case x: ClassExpr.AllValuesFrom =>
      f(x.property.iri, x.filler.isInstanceOf[DataRange])
      foreachPropertyIn(x.filler)(f)
    case x: ClassExpr.HasValue => f(x.property.iri, !x.value.isInstanceOf[Iri])
    case x: ClassExpr.HasSelf => f(x.property.iri, false)
    case x: ClassExpr.Cardinality =>
      val filler = x.filler
      f(x.property.iri, filler.isDefined && filler.get.isInstanceOf[DataRange])
      if (filler.isDefined) foreachPropertyIn(filler.get)(f)
    case _ =>
  }

  /** Calls `f` with each datatype in a range or expression, nested ones included, in order. */
  def foreachDatatypeIn(r: Filler)(f: String => Unit): Unit = r match {
    case x: DataRange.Datatype => f(x.iri)
    case x: DataRange.Restriction => f(x.datatype)
    case x: DataRange.UnionOf => x.operands.foreach(foreachDatatypeIn(_)(f))
    case x: DataRange.IntersectionOf => x.operands.foreach(foreachDatatypeIn(_)(f))
    case x: DataRange.ComplementOf => foreachDatatypeIn(x.operand)(f)
    case x: ClassExpr.SomeValuesFrom => foreachDatatypeIn(x.filler)(f)
    case x: ClassExpr.AllValuesFrom => foreachDatatypeIn(x.filler)(f)
    case x: ClassExpr.Cardinality => if (x.filler.isDefined) foreachDatatypeIn(x.filler.get)(f)
    case x: ClassExpr.IntersectionOf => x.operands.foreach(foreachDatatypeIn(_)(f))
    case x: ClassExpr.UnionOf => x.operands.foreach(foreachDatatypeIn(_)(f))
    case _ =>
  }
}
