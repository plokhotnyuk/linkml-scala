package eu.neverblink.linkml.schemaview

import eu.neverblink.linkml.metamodel.{
  ClassDefinition,
  Element,
  EnumDefinition,
  SlotDefinition,
  SubsetDefinition,
  TypeDefinition,
}
import eu.neverblink.linkml.runtime.*

import scala.annotation.nowarn
import scala.collection.mutable
import scala.quoted.*

/** Macro validator result container
  * @param unknownReferences
  *   References that could not be resolved in the schema
  * @param invalidRanges
  *   Ranges that are invalid in the schema
  * @param invalidDefaultRanges
  *   Ranges whose inferred defaults wouldn't resolve
  */
case class ValidatorResult(
    unknownReferences: Seq[UnknownReference] = Seq.empty,
    invalidRanges: Seq[InvalidRange] = Seq.empty,
    invalidDefaultRanges: Seq[InvalidDefaultRange] = Seq.empty,
):
  /** Merge the [[ValidatorResult]]s */
  def +(other: ValidatorResult): ValidatorResult = ValidatorResult(
    unknownReferences ++ other.unknownReferences,
    invalidRanges ++ other.invalidRanges,
    invalidDefaultRanges ++ other.invalidDefaultRanges,
  )

  /** Add a [[prefix]] to each result's source path */
  def prependedPath(prefix: String): ValidatorResult = ValidatorResult(
    unknownReferences.map(_.prependedPath(prefix)),
    invalidRanges.map(_.prependedPath(prefix)),
    invalidDefaultRanges.map(_.prependedPath(prefix)),
  )

object ValidatorResult {
  val ok: ValidatorResult = ValidatorResult(Seq.empty, Seq.empty, Seq.empty)
}

/** A reference that could not be resolved in the [[SchemaView]]
  *
  * @param path
  *   JSON path to the invalid reference
  * @param referenceValue
  *   Value of the invalid reference
  */
case class UnknownReference(path: String, referenceValue: String):
  /** Add a [[prefix]] to this class' path */
  def prependedPath(prefix: String): UnknownReference =
    copy(path = prefix + path)

/** A `range` reference that is resolvable, but points to an invalid value
  *
  * @param path
  *   JSON path to the reference
  * @param value
  *   Value of the reference
  * @param actualType
  *   The definition type that this reference actually points to
  */
case class InvalidRange(path: String, value: String, actualType: String):
  /** Add a [[prefix]] to this class' path */
  def prependedPath(prefix: String): InvalidRange =
    copy(path = prefix + path)

/** An inferred default `range`, that is not allowed as the `default_range` slot is not resolvable.
  *
  * @param path
  *   JSON path to the reference
  */
case class InvalidDefaultRange(path: String):
  /** Add a [[prefix]] to this class' path */
  def prependedPath(prefix: String): InvalidDefaultRange =
    copy(path = prefix + path)

private trait MacroValidator[T] {
  def validate(t: T)(using SchemaView, ValidatorContext): ValidatorResult
}

/** Context for the validator
  *
  * @param defaultRangeAllowed
  *   Whether to treat omitted ranges as an error
  * @param isRange
  *   Whether this particular slot is a range and should be additionally checked
  */
final class ValidatorContext private (val defaultRangeAllowed: Boolean, val isRange: Boolean):
  /** Mark continue validating this slot as a range. SHOULD NOT BE USED OUTSIDE THE MACRO */
  def asRange: ValidatorContext =
    new ValidatorContext(defaultRangeAllowed, true)

object ValidatorContext:
  def apply(defaultRangeAllowed: Boolean): ValidatorContext =
    new ValidatorContext(defaultRangeAllowed, false)

private object MacroValidator {
  given MacroValidator[Anything] = new MacroValidator[Anything] {
    def validate(t: Anything)(using SchemaView, ValidatorContext): ValidatorResult =
      ValidatorResult.ok
  }

  given MacroValidator[AnyValue] = new MacroValidator[AnyValue] {
    def validate(t: AnyValue)(using SchemaView, ValidatorContext): ValidatorResult =
      ValidatorResult.ok
  }

  given MacroValidator[UriOrCurie] = new MacroValidator[UriOrCurie] {
    def validate(t: UriOrCurie)(using SchemaView, ValidatorContext): ValidatorResult =
      ValidatorResult.ok
  }

  private def formatRangeType(el: Element): String = {
    el match {
      case _: SubsetDefinition => "SubsetDefinition"
      case _: SlotDefinition => "SlotDefinition"
      case _ => "???"
    }
  }

  given referenceValidator[T <: Element]: MacroValidator[Reference[T]] =
    new MacroValidator[Reference[T]] {
      def validate(
          t: Reference[T],
      )(using sv: SchemaView, vc: ValidatorContext): ValidatorResult = t.resolve match {
        case Some(value) =>
          if !vc.isRange
            || value.isInstanceOf[TypeDefinition]
            || value.isInstanceOf[ClassDefinition]
            || value.isInstanceOf[EnumDefinition]
          then ValidatorResult.ok
          else
            ValidatorResult(invalidRanges = Seq(InvalidRange("", t.value, formatRangeType(value))))
        case None => ValidatorResult(unknownReferences = Seq(UnknownReference("", t.value)))
      }
    }

  inline def derived[T]: MacroValidator[T] = ${ ReferenceValidatorImpl.make }
}

private object ReferenceValidatorImpl {
  def make[T: Type](using Quotes): Expr[MacroValidator[T]] =
    new ReferenceValidatorImpl().make[T]
}

private class ReferenceValidatorImpl(using Quotes) {
  import quotes.reflect.*

  def make[T: Type]: Expr[MacroValidator[T]] = {
    val rootTpe = TypeRepr.of[T].dealias
    inferredValidators.put(rootTpe, None)
    val validatorDef = '{
      new MacroValidator[T] {
        override def validate(
            t: T,
        )(using sv: SchemaView, vc: ValidatorContext): ValidatorResult = ${
          genValidator[T](rootTpe, 't, 'sv, 'vc)
        }
      }
    }
    val validator =
      Block(defs.toList, validatorDef.asTerm).asExpr.asInstanceOf[Expr[MacroValidator[T]]]
//    report.info(
//      s"Generated reference validator for type '${rootTpe.show}':\n${codec.show}",
//      Position.ofMacroExpansion,
//    )
    validator
  }

  private case class ClassInfo(
      tpe: TypeRepr,
      tpeTypeArgs: List[TypeRepr],
      primaryConstructor: Symbol,
      paramLists: List[List[FieldInfo]],
  ) {
    val fields: List[FieldInfo] = paramLists.flatten
    {
      val collisions = duplicated(fields.map(_.mappedName))
      if (collisions.nonEmpty) {
        val formattedCollisions = collisions.mkString("'", "', '", "'")
        fail(
          s"Duplicated yaml key(s) defined for '${tpe.show}': $formattedCollisions. Keys are derived from " +
            s"field names of the class and can be overridden by '${TypeRepr.of[named].show}' annotation(s).",
        )
      }
      if (fields.count(_.kind == FieldKind.Id) > 1) {
        fail(s"More than one field is defined with '@id' annotation in '${tpe.show}'.")
      }
      if (fields.count(_.kind == FieldKind.Value) > 1) {
        fail(s"More than one field is defined with '@value' annotation in '${tpe.show}'.")
      }
    }

    def genNew(argss: List[List[Term]]): Term =
      val constructorNoTypes = Select(New(Inferred(tpe)), primaryConstructor)
      val constructor =
        if (tpeTypeArgs eq Nil) constructorNoTypes
        else TypeApply(constructorNoTypes, tpeTypeArgs.map(Inferred(_)))
      argss.tail.foldLeft(Apply(constructor, argss.head))(Apply(_, _))
  }

  private case class FieldInfo(
      symbol: Symbol,
      mappedName: String,
      getterOrField: Symbol,
      defaultValue: Option[Term],
      resolvedTpe: TypeRepr,
      kind: FieldKind,
  )

  private def genValidator[T: Type](
      tpe: TypeRepr,
      x: Expr[T],
      sv: Expr[SchemaView],
      vc: Expr[ValidatorContext],
  )(using Quotes): Expr[ValidatorResult] = {
    val implCodec = findImplicitCodec(tpe)
    if (implCodec.isDefined) {
      '{
        ${ implCodec.get.asInstanceOf[Expr[MacroValidator[T]]] }.validate($x)(using $sv, $vc)
      }
    } else if (tpe =:= stringTpe || tpe =:= intTpe || tpe =:= booleanTpe) {
      '{ ValidatorResult.ok }
    } else if (tpe <:< optionOfWildcardTpe) withValidatorFor(tpe, x, sv, vc) { (x, sv, vc) =>
      val tpe1 = typeArg1(tpe)
      tpe1.asType match {
        case '[t1] =>
          val opt = x.asInstanceOf[Expr[Option[t1]]]
          '{
            if ($opt ne None) ${ genValidator[t1](tpe1, '{ $opt.get }, sv, vc) }
            else if $vc.isRange && ! $vc.defaultRangeAllowed then
              ValidatorResult(
                invalidDefaultRanges = Seq(InvalidDefaultRange("")),
              )
            else ValidatorResult.ok
          }
      }
    }
    else if (tpe <:< seqOfWildcardTpe) withValidatorFor(tpe, x, sv, vc) { (x, sv, vc) =>
      val tpe1 = typeArg1(tpe)
      tpe1.asType match {
        case '[t1] =>
          val seq = x.asInstanceOf[Expr[Seq[t1]]]
          '{
            $seq.zipWithIndex.map((e, idx) =>
              ${ genValidator[t1](tpe1, 'e, sv, vc) }.prependedPath(s"$idx/"),
            ).fold(ValidatorResult.ok)(_ + _)
          }
      }
    }
    else if (tpe <:< mapOfWildcardsTpe) withValidatorFor(tpe, x, sv, vc) { (x, sv, vc) =>
      val tpe1 = typeArg1(tpe)
      val tpe2 = typeArg2(tpe)
      ((tpe1.asType, tpe2.asType): @nowarn) match {
        case ('[t1], '[t2]) =>
          val map = x.asInstanceOf[Expr[Map[t1, t2]]]
          '{
            $map.map((k, v) => ${ genValidator[t2](tpe2, 'v, sv, vc) }.prependedPath(s"$k/")).fold(
              ValidatorResult.ok,
            )(_ + _)
          }
      }
    }
    else if (isNonAbstractClass(tpe)) withValidatorFor(tpe, x, sv, vc) { (x, sv, vc) =>
      genValidatorNonAbstractClass(tpe, x, sv, vc)
    }
    else fail(s"Unsupported type ${tpe.show}")
  }.asInstanceOf[Expr[ValidatorResult]]

  private def genValidatorNonAbstractClass[T: Type](
      tpe: TypeRepr,
      x: Expr[T],
      sv: Expr[SchemaView],
      vc: Expr[ValidatorContext],
  )(using Quotes): Expr[ValidatorResult] = {
    val classInfo = getClassInfo(tpe)
    val fields = classInfo.fields

    def genValidateFields(
        kvs: Expr[mutable.Growable[ValidatorResult]],
    )(using Quotes): Expr[Unit] = {
      Block(
        fields.map { fieldInfo =>
          val fTpe = fieldInfo.resolvedTpe
          val getter = Select(x.asTerm, fieldInfo.getterOrField).asExpr
          val name = Expr(fieldInfo.mappedName)
          (fTpe.asType match {
            case '[ft] =>
              val encodeVal = genValidator[ft](
                fTpe,
                getter.asInstanceOf[Expr[ft]],
                sv,
                if fieldInfo.mappedName != "range" then vc
                else '{ $vc.asRange },
              )
              '{ $kvs.addOne($encodeVal.prependedPath(s"${$name}/")) }
          }).asTerm
        },
        '{}.asTerm,
      ).asExpr.asInstanceOf[Expr[Unit]]
    }
    '{
      val kvs = Seq.newBuilder[ValidatorResult]
      ${ genValidateFields('kvs) }
      kvs.result().fold(ValidatorResult.ok)(_ + _)
    }
  }

  private def getClassInfo(tpe: TypeRepr): ClassInfo = classInfos.getOrElseUpdate(
    tpe, {
      val tpeTypeArgs = typeArgs(tpe)
      val tpeClassSym = tpe.classSymbol.get
      val primaryConstructor = tpeClassSym.primaryConstructor
      val caseFields = tpeClassSym.caseFields
      var fieldMembers: List[Symbol] = null
      var companionRefAndClass: (Ref, Symbol) = null

      def createFieldInfos(params: List[Symbol], typeParams: List[Symbol]): List[FieldInfo] =
        params.map {
          var i = 0
          symbol =>
            i += 1
            val name = symbol.name
            var fieldTpe = tpe.memberType(symbol).dealias
            if (tpeTypeArgs ne Nil) fieldTpe = fieldTpe.substituteTypes(typeParams, tpeTypeArgs)
            fieldTpe match
              case _: TypeLambda =>
                fail(
                  s"Type lambdas are not supported for type '${tpe.show}' with field type for $name '${fieldTpe.show}'",
                )
              case _: TypeBounds =>
                fail(
                  s"Type bounds are not supported for type '${tpe.show}' with field type for $name '${fieldTpe.show}'",
                )
              case _ =>
            val defaultValue = if (symbol.flags.is(Flags.HasDefault)) new Some({
              if (companionRefAndClass eq null) {
                val typeSymbol = tpe.typeSymbol
                companionRefAndClass = (Ref(typeSymbol.companionModule), typeSymbol.companionClass)
              }
              val methodSymbol =
                companionRefAndClass._2.declaredMethod("$lessinit$greater$default$" + i).head
              val dvSelectNoTypes = Select(companionRefAndClass._1, methodSymbol)
              methodSymbol.paramSymss match
                case Nil => dvSelectNoTypes
                case List(params) if params.exists(_.isTypeParam) =>
                  TypeApply(dvSelectNoTypes, tpeTypeArgs.map(Inferred(_)))
                case paramss =>
                  fail(
                    s"Default method for $name of class ${tpe.show} have a complex parameter list: $paramss",
                  )
            })
            else None
            val getterOrField = caseFields.find(_.name == name) match
              case Some(caseField) => caseField
              case _ =>
                if (fieldMembers eq null) fieldMembers = tpeClassSym.fieldMembers
                fieldMembers.find(_.name == name) match
                  case Some(fieldMember) => fieldMember
                  case _ => Symbol.noSymbol
            if (!getterOrField.exists || getterOrField.flags.is(Flags.PrivateLocal)) {
              fail(
                s"Getter or field '$name' of '${tpe.show}' is private. It should be defined as 'val' or 'var' in the primary constructor.",
              )
            }
            var named: Option[Term] = None
            var kind: FieldKind = FieldKind.Regular
            getterOrField.annotations.foreach { annotation =>
              val aTpe = annotation.tpe
              if (aTpe =:= namedTpe) {
                if (named eq None) named = new Some(annotation)
                else fail(s"Duplicated '${namedTpe.show}' defined for '$name' of '${tpe.show}'.")
              } else {
                if (kind != FieldKind.Regular) {
                  fail(
                    s"Expected only one of annotation: '@id', '@value', '@simpleDict', '@compactDict', or '@expandedDict' for '$name' of '${tpe.show}'.",
                  )
                }
                if (aTpe =:= idTpe) kind = FieldKind.Id
                else if (aTpe =:= valueTpe) kind = FieldKind.Value
                else if (aTpe =:= simpleDictTpe) kind = FieldKind.SimpleDict
                else if (aTpe =:= compactDictTpe) kind = FieldKind.CompactDict
                else if (aTpe =:= expandedDictTpe) kind = FieldKind.ExpandedDict
              }
            }
            val mappedName = namedValueOpt(named, tpe) match
              case Some(name1) => name1
              case _ => name
            new FieldInfo(symbol, mappedName, getterOrField, defaultValue, fieldTpe, kind)
        }

      new ClassInfo(
        tpe,
        tpeTypeArgs,
        primaryConstructor,
        primaryConstructor.paramSymss match {
          case tps :: pss if tps.exists(_.isTypeParam) => pss.map(ps => createFieldInfos(ps, tps))
          case pss => pss.map(ps => createFieldInfos(ps, Nil))
        },
      )
    },
  )

  private def withValidatorFor[T: Type](
      tpe: TypeRepr,
      x: Expr[T],
      sv: Expr[SchemaView],
      vc: Expr[ValidatorContext],
  )(
      f: (Expr[T], Expr[SchemaView], Expr[ValidatorContext]) => Expr[ValidatorResult],
  ): Expr[ValidatorResult] =
    Apply(
      validateRefs.getOrElse(
        tpe, {
          val sym = Symbol.newMethod(
            Symbol.spliceOwner,
            s"e${validateRefs.size}",
            MethodType("x" :: "sv" :: "vc" :: Nil)(
              _ => tpe :: schemaViewTpe :: validatorContextTpe :: Nil,
              _ => validatorResultTpe,
            ),
          )
          val ref = Ref(sym)
          validateRefs.update(tpe, ref)
          defs.addOne(
            DefDef(
              sym,
              params => {
                val List(x, sv, vc) = params.head
                new Some(
                  f(
                    x.asExpr.asInstanceOf[Expr[T]],
                    sv.asExpr.asInstanceOf[Expr[SchemaView]],
                    vc.asExpr.asInstanceOf[Expr[ValidatorContext]],
                  ).asTerm.changeOwner(sym),
                )
              },
            ),
          )
          ref
        },
      ),
      List(x.asTerm, sv.asTerm, vc.asTerm),
    ).asExpr.asInstanceOf[Expr[ValidatorResult]]

  private def findImplicitCodec(tpe: TypeRepr): Option[Expr[MacroValidator[?]]] =
    inferredValidators.getOrElseUpdate(
      tpe, {
        Implicits.search(referenceValidatorTpe.appliedTo(tpe)) match
          case s: ImplicitSearchSuccess =>
            new Some(s.tree.asExpr.asInstanceOf[Expr[MacroValidator[?]]])
          case _ => None
      },
    )

  private def isNonAbstractClass(tpe: TypeRepr): Boolean = tpe.classSymbol.fold(false) { symbol =>
    val flags = symbol.flags
    !(flags.is(Flags.Abstract) || flags.is(Flags.JavaDefined) || flags.is(Flags.Trait))
  }

  private def namedValueOpt(namedAnnotation: Option[Term], tpe: TypeRepr): Option[String] =
    namedAnnotation.map { case Apply(_, List(param)) =>
      param match
        case Literal(StringConstant(s)) => s
        case _ =>
          fail(
            s"Cannot evaluate a parameter of the '@named' annotation in type '${tpe.show}': $param.",
          )
    }

  private def duplicated[A](xs: collection.Seq[A]): collection.Seq[A] = xs.filter {
    val seen = new mutable.HashSet[A]
    x => !seen.add(x)
  }

  private def typeArgs(tpe: TypeRepr): List[TypeRepr] = tpe match
    case AppliedType(_, typeArgs) => typeArgs.map(_.dealias)
    case _ => Nil

  private def typeArg1(tpe: TypeRepr): TypeRepr = tpe match
    case AppliedType(_, typeArg1 :: _) => typeArg1.dealias
    case _ => fail(s"Cannot get 1st type argument in '${tpe.show}'")

  private def typeArg2(tpe: TypeRepr): TypeRepr = tpe match
    case AppliedType(_, _ :: typeArg2 :: _) => typeArg2.dealias
    case _ => fail(s"Cannot get 2nd type argument in '${tpe.show}'")

  private def fail(msg: String): Nothing = report.errorAndAbort(msg, Position.ofMacroExpansion)

  private val classInfos = new mutable.HashMap[TypeRepr, ClassInfo]
  private val inferredValidators =
    new mutable.HashMap[TypeRepr, Option[Expr[MacroValidator[?]]]]
  private val validateRefs = new mutable.HashMap[TypeRepr, Ref]
  private val defs = new mutable.ListBuffer[Definition]
  private val intTpe = defn.IntClass.typeRef
  private val booleanTpe = defn.BooleanClass.typeRef
  private val stringTpe = defn.StringClass.typeRef
  private val anyTpe = defn.AnyClass.typeRef
  private val wildcardBounds = TypeBounds(defn.NothingClass.typeRef, anyTpe)
  defn.OptionClass.typeRef.appliedTo(anyTpe)
  private val optionOfWildcardTpe = defn.OptionClass.typeRef.appliedTo(wildcardBounds)
  private val referenceValidatorTpe =
    Symbol.requiredClass("eu.neverblink.linkml.schemaview.MacroValidator").typeRef
  private val seqOfWildcardTpe =
    Symbol.requiredClass("scala.collection.immutable.Seq").typeRef.appliedTo(wildcardBounds)
  private val mapOfWildcardsTpe = Symbol.requiredClass(
    "scala.collection.immutable.Map",
  ).typeRef.appliedTo(wildcardBounds :: wildcardBounds :: Nil)
  private val namedTpe = Symbol.requiredClass("eu.neverblink.linkml.runtime.named").typeRef
  private val idTpe = Symbol.requiredClass("eu.neverblink.linkml.runtime.id").typeRef
  private val valueTpe = Symbol.requiredClass("eu.neverblink.linkml.runtime.value").typeRef
  private val simpleDictTpe =
    Symbol.requiredClass("eu.neverblink.linkml.runtime.simpleDict").typeRef
  private val compactDictTpe =
    Symbol.requiredClass("eu.neverblink.linkml.runtime.compactDict").typeRef
  private val expandedDictTpe =
    Symbol.requiredClass("eu.neverblink.linkml.runtime.expandedDict").typeRef

  private val schemaViewTpe =
    Symbol.requiredClass("eu.neverblink.linkml.schemaview.SchemaView").typeRef
  private val validatorContextTpe =
    Symbol.requiredClass("eu.neverblink.linkml.schemaview.ValidatorContext").typeRef
  private val validatorResultTpe =
    Symbol.requiredClass("eu.neverblink.linkml.schemaview.ValidatorResult").typeRef
}

private enum FieldKind {
  case Regular, Id, Value, SimpleDict, CompactDict, ExpandedDict
}
