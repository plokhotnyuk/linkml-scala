// Conversion worker. Owns the LinkML API, the parsed `SchemaView` and all generator and importer
// calls.
import { importerById } from "../catalog/importers.js";
import { targetById } from "../catalog/targets.js";
import type { LinkMLApi, LoadResult } from "../linkml";
import { renderMarkdown } from "../lib/markdown.js";
import type { ConvertRequest, ConvertResponse, ResultKind, WorkerMessage } from "./protocol.js";

const LINKML_BUNDLE_URL = "./linkml.js";

// The Scala.js bundle expects a Node-ish `process` global.
(globalThis as { process?: unknown }).process ??= { cwd: () => "/" };

// Started at module load so the multi-MB bundle is already parsing while the page renders.
// Requests that arrive before it resolves simply await it.
const apiPromise: Promise<LinkMLApi> = import(LINKML_BUNDLE_URL).then((m: { LinkML: LinkMLApi }) => m.LinkML);

// The UI tsconfig ships the DOM lib rather than webworker, and pulling lib.webworker in here would
// collide with it. Only these two globals are used, so declare them exactly - which also types
// both ends of the protocol instead of leaving them as `any`.
declare const self: {
  onmessage: ((e: MessageEvent<ConvertRequest>) => void) | null;
  postMessage: (message: WorkerMessage) => void;
};

// Announced rather than asked for: there is nothing to ask about, and the page wants the version
// whether or not anyone has generated anything yet. Like the reports, the build info is a parsed
// JSON object, so it crosses the boundary as it is.
apiPromise
  .then((api) => self.postMessage({ build: api.buildInfo() }))
  .catch(() => {
    // A bundle that failed to load reports itself through the first generation request.
  });

// Parse the schema once and reuse it across target/option changes; only re-parse when the input
// text actually changes.
let cachedSchema: { text: string; loaded: LoadResult } | null = null;

// The last pages of the Docs target, with their HTML, so that going back to one shows it straight
// away. Keyed by the page and the options, and emptied when the schema changes. Oldest first.
const pageCache = new Map<string, { markdown: string; html: string | null }>();
const PAGE_CACHE_SIZE = 16;

self.onmessage = async (e: MessageEvent<ConvertRequest>) => {
  const { id, direction, input: schema, stepId, options, page = "index.md" } = e.data;
  try {
    const api = await apiPromise;

    if (direction === "toLinkml") {
      const importer = importerById(stepId);
      if (!importer) throw new Error(`Unknown importer: ${stepId}`);
      const t0 = performance.now();
      const result = importer.call(api, schema, options);
      const genMs = Math.round(performance.now() - t0);
      reply({ id, ok: true, direction, stepId, kind: "text", result, loadMs: null, genMs });
      return;
    }

    let loadMs: number | null = null;
    if (!cachedSchema || cachedSchema.text !== schema) {
      // Drop the old parse before starting a new one - these are large, and holding both at once
      // is what pushes a big schema over the heap limit.
      cachedSchema = null;
      pageCache.clear();
      const t0 = performance.now();
      // The empty object is the import map (filename -> YAML). The UI has no extra imports.
      const loaded = api.loadFromString(schema, {});
      loadMs = Math.round(performance.now() - t0);
      cachedSchema = { text: schema, loaded };
    }

    const { view, report } = cachedSchema.loaded;

    // Fatal problems mean there is no view to generate from, so every target shows the report.
    if (!view) {
      reply({ id, ok: true, direction, stepId, kind: "report", result: report, loadMs, genMs: 0, fatal: true });
      return;
    }

    const target = targetById(stepId);
    if (!target) throw new Error(`Unknown target: ${stepId}`);

    if (target.view === "page") {
      const key = JSON.stringify([stepId, options, page]);
      const cached = pageCache.get(key);
      if (cached) {
        // Moved to the end, as the newest
        pageCache.delete(key);
        pageCache.set(key, cached);
        const result = cached.markdown;
        reply({ id, ok: true, direction, stepId, kind: "page", result, loadMs, genMs: 0, page: { path: page, html: cached.html, cached: true } });
        return;
      }
      const t1 = performance.now();
      const markdown = (target.call(api, view, options, page) as Record<string, string>)[page];
      const genMs = Math.round(performance.now() - t1);
      const t2 = performance.now();
      const html = markdown === undefined ? null : renderMarkdown(markdown);
      const htmlMs = Math.round(performance.now() - t2);
      pageCache.set(key, { markdown: markdown ?? "", html });
      if (pageCache.size > PAGE_CACHE_SIZE) pageCache.delete(pageCache.keys().next().value!);
      const result = markdown ?? "";
      reply({ id, ok: true, direction, stepId, kind: "page", result, loadMs, genMs, page: { path: page, html, cached: false }, htmlMs });
      return;
    }

    const t1 = performance.now();
    const result = target.call(api, view, options, page);
    const genMs = Math.round(performance.now() - t1);

    const kind: ResultKind = target.view === "report"
      ? "report"
      : target.view === "diagram"
      ? "diagram"
      : target.view === "stats"
      ? "stats"
      : typeof result === "object"
      ? "files"
      : "text";
    reply({ id, ok: true, direction, stepId, kind, result, loadMs, genMs });
  } catch (err) {
    reply({ id, ok: false, error: err instanceof Error ? err.toString() : String(err) });
  }
};

function reply(msg: ConvertResponse): void {
  self.postMessage(msg);
}
