package millbuild

import mill.*
import mill.scalalib.ScalaModule
import mill.util.Jvm

/** A module for which we don't publish javadocs, like the model catalogue in `tests`.
  *
  * The javadoc for this module in particular is very large and not very useful.
  */
trait NoDocs extends ScalaModule {
  override def docJar: T[PathRef] = Task {
    os.write(
      Task.dest / "docs" / "index.html",
      s"""<!DOCTYPE html>
         |<p>${artifactName()} has no API docs.</p>
         |""".stripMargin,
      createFolders = true,
    )
    PathRef(Jvm.createJar(Task.dest / "out.jar", Seq(Task.dest / "docs")))
  }
}
