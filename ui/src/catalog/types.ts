// The types of the catalog of everything the playground can run (see targets.ts and
// importers.ts), and of the LinkML API's results that the UI shows.
import type { Format as OhiFormat } from "@neverblink/ohi";
import type { LinkMLApi, SchemaStats, SchemaValidationReport, SchemaView } from "../linkml";
import type { OutputLang } from "../lib/editor.js";

/** `fromLinkml` runs a generator over a LinkML schema; `toLinkml` runs an importer over a document in
 * another format. */
export type Direction = "fromLinkml" | "toLinkml";

export interface Option {
  key: string;
  type: "checkbox" | "text" | "number" | "select";
  label: string;
  title?: string;
  placeholder?: string;
  choices?: string[];
  default?: string | number | boolean;
  /** Shown only when this holds for the step's current option values. Absent means always shown. */
  showIf?: (o: OptionValues) => boolean;
}

export type OptionValues = Record<string, string | number | boolean>;

/** The validation report types, generated from model/issue-types.yaml into linkml.d.ts. */
export type { IssueLocation, SchemaIssue, SchemaValidationReport } from "../linkml";

/** The schema statistics, generated from model/schema-stats.yaml into linkml.d.ts. */
export type { SchemaStats } from "../linkml";

export type TargetResult = string | Record<string, string> | SchemaValidationReport | SchemaStats;

/** The build info, generated from model/build-info.yaml into linkml.d.ts. */
export type { BuildInfo } from "../linkml";

/** What a [[Target]] and an [[Importer]] have in common: a tab, a set of option widgets and an
 * output language. The UI works in terms of this wherever the direction does not matter. */
export interface Step {
  id: string;
  label: string;
  docs: string;
  options: Option[];
  lang: OutputLang | ((o: OptionValues) => OutputLang);
}

/** A generator: LinkML in, something else out. */
export interface Target extends Step {
  /** How to display what `call` returns. Defaults to text, or the file tabs for a `Record`.
   * `diagram` renders the result with Mermaid, behind a Diagram/Code tab pair. `page` renders it
   * as Markdown, behind a Page/Code tab pair. `stats` renders the statistics as tables. */
  view?: "report" | "diagram" | "page" | "stats";
  /** Runs in the worker only. `api` is injected rather than imported so this module stays free of
   * the multi-MB Scala.js bundle, which the UI thread never loads. For a `page`, `page` is the path
   * of the page to show, such as `index.md`. */
  call: (api: LinkMLApi, view: SchemaView, o: OptionValues, page: string) => TargetResult;
}

/** An importer: some other format in, LinkML out.
 *
 * Unlike a generator it never sees a `SchemaView` - there is no LinkML schema yet - so it is handed
 * the input document as text.
 */
export interface Importer extends Step {
  /** What the input pane calls the document it wants. */
  inputLabel: string;
  /** Starting point for the example in the load dialog. */
  example: string;
  /** Which files on ohi.dev this importer can read. When there is more than one, the load dialog
   * offers a choice between them, and the first is the default. */
  ohiFormats: OhiChoice[];
  /** Ids of the generators this undoes, if any. Both directions of each pair get the reverse
   * button in the output pane. Going back from the importer picks the first one, unless the
   * generator last used is also on the list. */
  reverses?: string[];
  /** How to highlight the input pane. Defaults to YAML. */
  inputLang?: OutputLang;
  call: (api: LinkMLApi, input: string, o: OptionValues) => string;
}

/** A file format on ohi.dev that an input pane can read. `label` names it on the format toggle,
 * `name` in the note on an ontology that has no such file. */
export interface OhiChoice {
  format: OhiFormat;
  label: string;
  name: string;
}
