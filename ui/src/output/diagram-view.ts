// The ER diagram, drawn with Mermaid, with its Mermaid source on the Code half.
import { $ } from "../lib/dom.js";
import { applyDiagramView, diagramCanvas, diagramFrame, fitDiagram, sizeDiagramToViewBox } from "./diagram-pan-zoom.js";
import { errorNotice } from "./notice.js";
import { $outputEditorHost } from "./output-editor.js";
import { activate, type OutputView } from "./panel.js";
import { TwinTabs } from "./view-tabs.js";

// Mermaid, bundled into dist/mermaid by build.mjs. Imported on first use only: it and its chunks
// are ~210 KB gzipped, which nobody who never opens the ER diagram tab should pay for.
const MERMAID_URL = "./mermaid/mermaid.js";

const $diagramView = $("diagramView");

// The Mermaid source on screen, kept so the tabs and the theme toggle can draw it again without
// waiting for another generation. Non-null exactly while the diagram view is up.
let diagramSource: string | null = null;
let diagramTimer: ReturnType<typeof setTimeout> | undefined;

const tabs = new TwinTabs("Diagram", $diagramView, () => showHalf());

const diagramView: OutputView = {
  hide() {
    clearTimeout(diagramTimer);
    $diagramView.hidden = true;
    $diagramView.innerHTML = "";
    $diagramView.classList.remove("diagram--interactive", "diagram--panning");
    diagramSource = null;
    tabs.clear();
    $outputEditorHost.hidden = false;
  },
  copyText: () => diagramSource,
};

/** Draw the Mermaid source, behind a Diagram/Code tab pair sharing the file tab bar. */
export function showDiagram(text: string): void {
  activate(diagramView);
  diagramSource = text;
  tabs.setCode(text, "text");
  tabs.showTabs();
  showHalf();
}

function showHalf(): void {
  if (tabs.showHalf() && diagramSource !== null) scheduleDiagramRender(diagramSource);
  else clearTimeout(diagramTimer);
}

/** Draw the diagram on screen again, as it bakes in the colours of the theme. */
export function redrawDiagram(): void {
  if (diagramSource !== null && !tabs.code && !$diagramView.hidden) scheduleDiagramRender(diagramSource, 0);
}

/** Mermaid's public surface, as much of it as this file uses. */
interface MermaidApi {
  initialize(config: Record<string, unknown>): void;
  parse(text: string, options?: { suppressErrors?: boolean }): Promise<unknown>;
  render(id: string, text: string): Promise<{ svg: string }>;
}

let mermaidPromise: Promise<MermaidApi> | null = null;

function loadMermaid(): Promise<MermaidApi> {
  mermaidPromise ??= import(MERMAID_URL).then((m: { default: MermaidApi }) => m.default);
  return mermaidPromise;
}

/** Only the newest render is allowed to reach the DOM. Mermaid's layout is synchronous once it
 * starts, so this cannot cancel work - it just stops a slow earlier diagram landing on a newer one. */
let diagramToken = 0;

/** True once a render's result is no longer wanted: a newer one started, or the diagram stopped
 * being the visible view (another target, or the Code tab) while this one was still laying out. */
function stale(token: number): boolean {
  return token !== diagramToken || $diagramView.hidden;
}

/** Rough size of a generated diagram, read off the text rather than parsed.
 *
 * Entity blocks and relationship lines both sit at one indent level; attribute rows are deeper. */
function diagramSize(text: string): { entities: number; relationships: number } {
  let entities = 0;
  let relationships = 0;
  for (const line of text.split("\n")) {
    if (!line.startsWith("  ") || line.startsWith("    ")) continue;
    const trimmed = line.trim();
    if (!trimmed || trimmed === "}" || trimmed.startsWith("%%") || trimmed === "erDiagram") continue;
    if (trimmed.includes(" : ")) relationships++;
    else entities++;
  }
  return { entities, relationships };
}

/** Above this, drawing takes long enough to be worth asking first. */
const DIAGRAM_SOFT_LIMIT = { entities: 40, relationships: 120 };
/** Above this it is not offered at all. */
const DIAGRAM_HARD_LIMIT = { entities: 150, relationships: 500 };

function over(size: { entities: number; relationships: number }, limit: typeof DIAGRAM_SOFT_LIMIT): boolean {
  return size.entities > limit.entities || size.relationships > limit.relationships;
}

/** Debounced so that typing in the schema does not queue up one blocking layout per keystroke. The
 * generation itself is already debounced; this covers the render on top of it. */
function scheduleDiagramRender(text: string, delay = 250): void {
  clearTimeout(diagramTimer);
  const size = diagramSize(text);
  if (over(size, DIAGRAM_SOFT_LIMIT)) {
    showDiagramGate(text, size);
    return;
  }
  diagramTimer = setTimeout(() => void renderDiagram(text), delay);
}

/** Offer (or decline) to draw a diagram that is large enough to lock the page up. */
function showDiagramGate(text: string, size: { entities: number; relationships: number }): void {
  const counts = `${size.entities} entities and ${size.relationships} relationships`;
  const notice = document.createElement("div");
  notice.className = "diagram-notice";

  if (over(size, DIAGRAM_HARD_LIMIT)) {
    notice.innerHTML =
      `<strong>Too large to draw</strong>This diagram has ${counts}. Mermaid lays that out on the ` +
      "page's own thread and would freeze the tab for minutes. Narrow it down with the Pruning " +
      "and Tree root options above, or read it on the Code tab.";
  } else {
    notice.innerHTML =
      `<strong>Large diagram</strong>${counts}. Drawing this may block the page for a few seconds.`;
    const btn = document.createElement("button");
    btn.className = "btn btn-secondary btn-sm";
    btn.textContent = "Render anyway";
    btn.addEventListener("click", () => void renderDiagram(text));
    notice.appendChild(btn);
  }

  showDiagramNotice(notice);
}

/** Put a notice where the diagram would go, and take the pan/zoom behaviour back off. */
function showDiagramNotice(notice: HTMLElement): void {
  $diagramView.classList.remove("diagram--interactive", "diagram--panning");
  $diagramView.removeAttribute("title");
  $diagramView.innerHTML = "";
  $diagramView.appendChild(notice);
}

function showDiagramError(message: string): void {
  showDiagramNotice(errorNotice("Could not draw this diagram", message));
}

async function renderDiagram(text: string): Promise<void> {
  const token = ++diagramToken;
  try {
    const mermaid = await loadMermaid();
    if (token !== diagramToken) return;
    mermaid.initialize({
      startOnLoad: false,
      // Diagram text is derived from the user's own schema, but it still ends up as markup.
      securityLevel: "strict",
      theme: document.documentElement.getAttribute("data-theme") === "light" ? "default" : "dark",
      // Both default caps (50 000 characters, 500 edges) are below what a real-world schema
      // produces. The gate above is what actually keeps the page responsive, so lift these and let
      // it decide.
      maxTextSize: 5_000_000,
      maxEdges: 10_000,
    });
    // Parse first: `render` answers a size or syntax problem with a picture of an error message
    // rather than by failing, which would otherwise reach the page as a successful render.
    await mermaid.parse(text, { suppressErrors: false });
    const { svg } = await mermaid.render(`mermaid-${token}`, text);
    if (stale(token)) return;
    // The SVG goes inside a wrapper that pan/zoom transforms, rather than being transformed itself:
    // Mermaid owns the element's own width/height/style attributes.
    $diagramView.innerHTML = `<div class="diagram-canvas"></div>`;
    diagramCanvas()!.innerHTML = svg;
    sizeDiagramToViewBox();
    $diagramView.classList.add("diagram--interactive");
    $diagramView.title = "Scroll to zoom, drag to pan, double-click to fit";
    // Keep the framing the user chose; re-fit only while they have not touched it.
    if (diagramFrame.adjusted) applyDiagramView();
    else fitDiagram();
  } catch (err) {
    if (stale(token)) return;
    showDiagramError(err instanceof Error ? err.message : String(err));
  }
}
