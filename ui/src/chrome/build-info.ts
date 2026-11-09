// The version of LinkML that the worker loaded, in the footer and the help dialog.
import type { BuildInfo } from "../catalog/types.js";
import { $ } from "../lib/dom.js";

const $footerVersion = $<HTMLButtonElement>("footerVersion");

/** Fill in the version rows once the worker reports what it loaded.
 *
 * Every slot is treated as optional: this mirrors an API that hands back plain JSON, and the
 * serializer leaves out slots that are empty. A missing one shows the same dash it started with.
 */
export function showBuildInfo(info: BuildInfo): void {
  const set = (id: string, value: string | undefined) => {
    if (value) $(id).textContent = value;
  };
  set("biVersion", info.linkml_scala_version);
  set("biMetamodel", info.metamodel_version);
  set("biScala", info.scala_version);
  set("biScalaJs", info.scala_js_version);
  set("biRuntime", info.runtime);

  if (info.linkml_scala_version) {
    $footerVersion.textContent = `v${info.linkml_scala_version}`;
    $footerVersion.hidden = false;
  }
}
