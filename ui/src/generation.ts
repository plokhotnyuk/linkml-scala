// Running the generator or importer: the worker that does it, the requests to it, and the status
// pill that says how long it took.
//
// Parsing and generation run in a worker, so a multi-second SHACL doesn't freeze the page. The worker
// owns the LinkML bundle and the parsed SchemaView. This thread only sends the input text plus the
// chosen target and shows whatever comes back.
import type { SchemaStats, SchemaValidationReport, Target } from "./catalog/types.js";
import { showBuildInfo } from "./chrome/build-info.js";
import { $ } from "./lib/dom.js";
import { showDiagram } from "./output/diagram-view.js";
import { showPage } from "./output/page-view.js";
import { setReversibleOutput } from "./output/panel.js";
import { showReport } from "./output/report-view.js";
import { showStats } from "./output/stats-view.js";
import { showError, showFiles, showText } from "./output/text-view.js";
import { activeKey, activeStep, optionValues, state, stepById, stepLang } from "./state.js";
import type { ConvertRequest, ConvertResponse, WorkerMessage } from "./worker/protocol.js";

// Resolved against dist/app.js at runtime, so it lands on the sibling dist/worker.js. Built from a
// variable rather than a literal to keep esbuild from trying to resolve it at bundle time.
const WORKER_URL = "./worker.js";

const $outputPanel = $("outputPanel");
const $statusPill = $("statusPill");
const $generateBtn = $<HTMLButtonElement>("generateBtn");
const $autoGenerate = $<HTMLInputElement>("autoGenerate");

let generateTimer: ReturnType<typeof setTimeout> | undefined;
let busyTimer: ReturnType<typeof setTimeout> | undefined;
// Every request is numbered and only the newest one is shown. Generation is async, so a burst of
// tab clicks would otherwise let a slow earlier result land on top of a fast later one.
let requestId = 0;
let pendingId: number | null = null;

/** Where the text to convert comes from: the input editor (see pane.ts). */
let readInput: () => string = () => "";

export function setInputSource(read: () => string): void {
  readInput = read;
}

let worker: Worker | null = null;

/** The worker, started if it is not running. Starting it begins loading the LinkML bundle. */
export function startWorker(): Worker {
  if (worker) return worker;
  const w = new Worker(new URL(WORKER_URL, import.meta.url), { type: "module" });
  w.onmessage = (e: MessageEvent<WorkerMessage>) => {
    // Everything except the one-off build announcement is an answer to a request.
    if ("build" in e.data) showBuildInfo(e.data.build);
    else onResult(e.data);
  };
  w.onerror = (e) => {
    e.preventDefault();
    // A worker that died (out of memory on a huge schema, say) never answers again, so drop it.
    // The next request builds a fresh one, which also means a fresh parse.
    w.terminate();
    if (worker === w) worker = null;
    pendingId = null;
    setBusy(false);
    showError(`Generation worker failed: ${e.message || "unknown error"}`);
    setStatus(false, "error");
  };
  worker = w;
  return w;
}

/** Run the generator or importer after `delay` ms, unless Auto is off. With no delay, it runs
 * whether Auto is on or not, as for the Generate button. */
export function scheduleGenerate(delay = 400): void {
  if (!$autoGenerate.checked && delay > 0) return;
  clearTimeout(generateTimer);
  generateTimer = setTimeout(runGenerate, delay);
}

$generateBtn.addEventListener("click", () => scheduleGenerate(0));

function runGenerate(): void {
  const input = readInput();

  if (!input.trim()) {
    pendingId = null;
    setBusy(false);
    $statusPill.hidden = true;
    setReversibleOutput(null);
    showText("", "text");
    return;
  }

  const step = activeStep();
  const id = ++requestId;
  pendingId = id;
  setBusy(true);
  const request: ConvertRequest = {
    id,
    direction: state.direction,
    input,
    stepId: step.id,
    options: optionValues[activeKey()]!,
    page: state.pagePath,
  };
  startWorker().postMessage(request);
}

function onResult(res: ConvertResponse): void {
  // Superseded by a newer request - its answer is the one that should land.
  if (res.id !== pendingId) return;
  pendingId = null;
  setBusy(false);

  if (!res.ok) {
    setReversibleOutput(null);
    showError(res.error);
    setStatus(false, "error");
    return;
  }

  // Showing the result is the one part still on this thread, so it counts towards what the user
  // waited for.
  const start = performance.now();
  const step = stepById(res.direction, res.stepId) ?? activeStep();
  if (res.kind === "report") {
    showReport(res.result as SchemaValidationReport);
  } else if (res.kind === "files") {
    showFiles(step as Target, res.result as Record<string, string>);
  } else if (res.kind === "diagram") {
    showDiagram(res.result as string);
  } else if (res.kind === "page") {
    showPage(res.page!.path, res.result as string, res.page!.html);
  } else if (res.kind === "stats") {
    showStats(res.result as SchemaStats);
  } else {
    showText((res.result as string) || "Schema is clean", stepLang(step, res.direction));
  }
  const displayMs = Math.round(performance.now() - start);

  // Only a plain document can be handed back to the other direction - file tabs, reports and
  // diagrams are not one.
  setReversibleOutput(res.kind === "text" ? (res.result as string) || null : null);

  // The pill reports the LinkML work itself: the parse when one happened, plus generation.
  setStatus(!res.fatal, `${(res.loadMs ?? 0) + res.genMs}ms`, breakdown(res, displayMs));
}

/** Where the time went, for the pill's tooltip. Spells out when a parse was reused, which is what
 * makes the headline number jump between a cold load and a tab switch. */
function breakdown(res: Extract<ConvertResponse, { ok: true }>, displayMs: number): string {
  const parts: string[] = [];
  if (res.direction === "toLinkml") {
    // An importer parses its own input inside the call, so there is no separate load step.
    parts.push(`convert ${res.genMs}ms`);
  } else {
    parts.push(res.loadMs === null ? "parse cached" : `parse ${res.loadMs}ms`);
    if (res.page?.cached) parts.push("page cached");
    else if (!res.fatal) parts.push(`generate ${res.genMs}ms`);
    if (res.htmlMs !== undefined) parts.push(`HTML ${res.htmlMs}ms`);
  }
  parts.push(`display ${displayMs}ms`);
  return parts.join(" · ");
}

function setStatus(ok: boolean, text: string, title = ""): void {
  $statusPill.hidden = false;
  $statusPill.textContent = text;
  $statusPill.title = title;
  $statusPill.classList.remove("status-pill--busy");
  $statusPill.classList.toggle("status-pill--error", !ok);
}

/** Show that work is in flight, but only once it has been running long enough to notice.
 *
 * The example schema generates in a few milliseconds; flashing a busy state at it would be a
 * worse artefact than showing nothing. The previous result stays on screen throughout - it is
 * dimmed, never cleared, so switching tabs on a big schema doesn't blank the panel. */
const BUSY_DELAY_MS = 150;

function setBusy(busy: boolean): void {
  clearTimeout(busyTimer);
  if (!busy) {
    $outputPanel.classList.remove("panel--busy");
    return;
  }
  busyTimer = setTimeout(() => {
    $outputPanel.classList.add("panel--busy");
    $statusPill.hidden = false;
    $statusPill.textContent = "working…";
    $statusPill.title = "";
    $statusPill.classList.remove("status-pill--error");
    $statusPill.classList.add("status-pill--busy");
  }, BUSY_DELAY_MS);
}
