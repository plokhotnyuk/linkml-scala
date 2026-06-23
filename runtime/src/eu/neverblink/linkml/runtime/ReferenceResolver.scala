package eu.neverblink.linkml.runtime

/** Trait that allows resolving references. Implementations of this are expected to pattern match on
  * the erased value of `T` to specialize the resolution logic for a specific type.
  *
  * Implementations of this trait can be provided in the implicit scope, which allows using the
  * [[Reference.resolve]] method.
  */
trait ReferenceResolver {

  /** Resolve a reference if it can be resolved
    * @param ref
    *   The reference to resolve
    * @tparam T
    *   Type of the referenced value. Implementations are expected to use
    *   [[scala.compiletime.erasedValue]] to pattern match on this type to specialize the resolution
    *   method.
    * @return
    *   The resolved reference or None if it could not be resolved
    */
  inline def resolve[T](inline ref: Reference[T]): Option[T]
}
