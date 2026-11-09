// The messages between the page and the generation worker (see worker.ts).
import type { BuildInfo, Direction, OptionValues, TargetResult } from "../catalog/types.js";

export interface ConvertRequest {
  id: number;
  direction: Direction;
  /** The LinkML schema, or the document to import. */
  input: string;
  /** Target id for `fromLinkml`, importer id for `toLinkml`. The two sets overlap. */
  stepId: string;
  options: OptionValues;
  /** For the Docs target, the path of the page to show, such as `index.md` or `classes/person.md`. */
  page?: string;
}

/** How the UI should render `result`: as editor text, as the Scala file tabs, as the report view, as
 * a Mermaid diagram, as a Markdown page, or as the statistics tables. */
export type ResultKind = "text" | "files" | "report" | "diagram" | "page" | "stats";

export type ConvertResponse =
  | {
      id: number;
      ok: true;
      /** Both echoed back so the UI renders with what was asked for, not what is selected now. */
      direction: Direction;
      stepId: string;
      kind: ResultKind;
      result: TargetResult;
      /** Time spent parsing the schema: null when the cached parse was reused, and for an importer,
       * which has no schema to parse. */
      loadMs: number | null;
      genMs: number;
      /** For a `page`, the page that `result` has the Markdown of, its HTML, and the time spent
       * making that. The HTML is null, and the Markdown empty, if the documentation has no such
       * page. */
      page?: { path: string; html: string | null; cached: boolean };
      htmlMs?: number;
      /** Set when the schema failed to load at all, so the report is a failure rather than a result. */
      fatal?: true;
    }
  | { id: number; ok: false; error: string };

/** Sent once, unprompted, when the bundle finishes loading. Every other message answers a request,
 * so the UI tells the two apart by looking for `build`. */
export interface BuildMessage {
  build: BuildInfo;
}

export type WorkerMessage = ConvertResponse | BuildMessage;
