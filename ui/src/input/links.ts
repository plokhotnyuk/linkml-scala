// The address bar, which names what the input pane was loaded from, so that it is a link to what is
// on screen: `?url=`, or `?ohi=` for a file on ohi.dev, plus the generator or importer showing it.
import { importerById } from "../catalog/importers.js";
import { targetById } from "../catalog/targets.js";
import type { Importer, Target } from "../catalog/types.js";
import { state } from "../state.js";
import { inputDoc, ohiChoices, type InputDoc } from "./documents.js";

// Query parameter holding the link the schema was loaded from, so the address bar is a share link.
const URL_PARAM = "url";
// Takes its place for a file from ohi.dev: `namespace/name@version`, which reads better than the
// file's own address. `format` follows only when it is not the input pane's default one.
const OHI_PARAM = "ohi";
const FORMAT_PARAM = "format";
// Next to either, the importer whose input pane the link belongs to. Absent means the LinkML pane.
const INPUT_PARAM = "input";
// And the generator whose output the link shows. Absent in the other direction, where `input`
// names the importer instead.
const TARGET_PARAM = "target";
const LINK_PARAMS = [URL_PARAM, OHI_PARAM, FORMAT_PARAM, INPUT_PARAM, TARGET_PARAM];
/** The `?url=` the page was opened with. Once a document is loaded, its own `link` is what counts -
 * the address bar just follows whichever document is on screen. */
export function incomingLink(): string | null {
  return new URL(location.href).searchParams.get(URL_PARAM);
}

/** The `?ohi=` the page was opened with, as given, and the format next to it. Both are checked
 * once the input pane is known. */
export function incomingOhi(): { value: string; format: string | null } | null {
  const params = new URL(location.href).searchParams;
  const value = params.get(OHI_PARAM);
  return value === null ? null : { value, format: params.get(FORMAT_PARAM) };
}

/** The importer named next to the link the page was opened with, if this build has it. */
export function incomingImporter(): Importer | undefined {
  const id = new URL(location.href).searchParams.get(INPUT_PARAM);
  return id === null ? undefined : importerById(id);
}

/** The generator named next to it, if this build has it. */
export function incomingTarget(): Target | undefined {
  const id = new URL(location.href).searchParams.get(TARGET_PARAM);
  return id === null ? undefined : targetById(id);
}

/** The query parameters that point at what the document on screen was loaded from. Without the
 * pane it belongs to, a reload would load an Ossie or OWL file into the LinkML pane. */
export function linkParams(doc: InputDoc): [string, string][] {
  const params: [string, string][] = [];
  if (doc.ohi) {
    params.push([OHI_PARAM, `${doc.ohi.pkg}@${doc.ohi.version}`]);
    if (doc.ohi.format !== ohiChoices()[0]!.format) params.push([FORMAT_PARAM, doc.ohi.format]);
  } else {
    params.push([URL_PARAM, doc.link!]);
  }
  if (state.direction === "toLinkml") params.push([INPUT_PARAM, state.importerId]);
  else params.push([TARGET_PARAM, state.targetId]);
  return params;
}

/** Point the address bar at whichever document is on screen, and at the step showing it. */
export function syncLinkParams(): void {
  const doc = inputDoc();
  if (doc.link) setLinkParams(doc);
  else clearLinkParams();
}

export function setLinkParams(doc: InputDoc): void {
  const here = new URL(location.href);
  for (const p of LINK_PARAMS) here.searchParams.delete(p);
  for (const [k, v] of linkParams(doc)) here.searchParams.set(k, v);
  history.replaceState(null, "", readable(here));
}

/** `searchParams` escapes `/`, `:` and `@`, though a query may hold them as they are. Left
 * escaped, `?ohi=w3c/prov-o@2013` would read `?ohi=w3c%2Fprov-o%402013`. */
export function readable(u: URL): string {
  return u.href.replace(/%2F/gi, "/").replace(/%3A/gi, ":").replace(/%40/g, "@");
}

export function clearLinkParams(): void {
  const here = new URL(location.href);
  if (!LINK_PARAMS.some((p) => here.searchParams.has(p))) return;
  for (const p of LINK_PARAMS) here.searchParams.delete(p);
  history.replaceState(null, "", here);
}
