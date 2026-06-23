package eu.neverblink.linkml.js

import eu.neverblink.linkml.generator.jsonschema.JsonSchemaGenerator
import eu.neverblink.linkml.generator.scala.ScalaGenerator
import eu.neverblink.linkml.generator.shacl.ShaclGenerator
import eu.neverblink.linkml.schemaview.{StringImporter, SchemaView}

import scala.scalajs.js
import scala.scalajs.js.JSConverters.JSRichMap
import scala.scalajs.js.annotation.{JSExportAll, JSExportTopLevel}

@JSExportTopLevel("LinkML")
@JSExportAll
object LinkMlJsApi {
  private case class JsImporter(map: js.Dictionary[String]) extends StringImporter {
    override def read(path: String): String =
      map.get(path).getOrElse(sys.error(s"Could not read from import map: $path"))
  }

  /** Generate JSON Schema from the provided LinkML model
    * @param mainSchema
    *   Main LinkML model in YAML format. It may import other models using LinkML `imports`, but all
    *   imports must be made available in the [[importMap]].
    * @param importMap
    *   JS dictionary (object) containing a mapping from filename to LinkML models (in YAML format)
    * @param open
    *   Whether the JSON Schema should allow `additionalProperties` or not.
    * @param treeRootOverride
    *   Override for the LinkML `tree_root` class which will be at the root of the JSON Schema.
    * @return
    *   Serialized JSON Schema
    */
  def jsonSchema(
      mainSchema: String,
      importMap: js.Dictionary[String],
      open: Boolean = false,
      treeRootOverride: js.UndefOr[String] = js.undefined,
  ): String = {
    val sv = SchemaView.loadSchemaViewFromString(mainSchema, JsImporter(importMap))
    JsonSchemaGenerator(using sv).serialize(open, treeRootOverride.toOption)
  }

  /** Generate SHACL shapes (in N-Triples format) from the provided LinkML model
    *
    * @param mainSchema
    *   Main LinkML model in YAML format. It may import other models using LinkML `imports`, but all
    *   imports must be made available in the [[importMap]].
    * @param importMap
    *   JS dictionary (object) containing a mapping from filename to LinkML models (in YAML format)
    * @param open
    *   Whether the SHACL shapes should be open (`_:b sh:closed false .`, allowing additional
    *   properties).
    * @return
    *   SHACL shapes in N-Triples format
    */
  def shacl(
      mainSchema: String,
      importMap: js.Dictionary[String],
      open: Boolean = false,
  ): String = {
    val sv = SchemaView.loadSchemaViewFromString(mainSchema, JsImporter(importMap))
    ShaclGenerator(using sv).generate(open)._2.map(_.nt).mkString("\n")
  }

  /** Generate Scala code from the provided LinkML model. This is primarily used for the metamodel
    *
    * @param mainSchema
    *   Main LinkML model in YAML format. It may import other models using LinkML `imports`, but all
    *   imports must be made available in the [[importMap]].
    * @param importMap
    *   JS dictionary (object) containing a mapping from filename to LinkML models (in YAML format)
    * @param `package`
    *   Package to generate the classes in
    * @return
    *   JS dictionary (object) containing a mapping from filename to the generated Scala code.
    */
  def scala(
      mainSchema: String,
      importMap: js.Dictionary[String],
      `package`: String,
  ): js.Dictionary[String] = {
    val sv = SchemaView.loadSchemaViewFromString(mainSchema, JsImporter(importMap))
    ScalaGenerator(using sv).generate(`package`).toMap.toJSDictionary
  }

  /** Lint the provided LinkML model, finding problems that may cause issues when using the model.
    *
    * @param mainSchema
    *   Main LinkML model in YAML format. It may import other models using LinkML `imports`, but all
    *   imports must be made available in the [[importMap]].
    * @param importMap
    *   JS dictionary (object) containing a mapping from filename to LinkML models (in YAML format)
    * @param maxProblems
    *   Maximum number of problems to include in the summary
    * @param verbose
    *   Whether to use the more verbose problem descriptions
    * @return
    *   The summary of detected problems, or an empty string if everything is correct
    */
  def lint(
      mainSchema: String,
      importMap: js.Dictionary[String],
      maxProblems: Int = 5,
      verbose: Boolean = false,
  ): String = {
    val sv = SchemaView.loadSchemaViewFromString(mainSchema, JsImporter(importMap))
    sv.lint(maxProblems, verbose).getOrElse("")
  }
}
