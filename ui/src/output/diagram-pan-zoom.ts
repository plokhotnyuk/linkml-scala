// Panning and zooming the ER diagram: a scale and a translation, applied to a wrapper around the SVG.
import { $ } from "../lib/dom.js";

const $diagramView = $("diagramView");

/** The diagram's viewport: a scale plus a translation, applied to a wrapper around the SVG.
 *
 * `adjusted` records whether the user has moved it themselves. Until they do, every re-render
 * re-fits; afterwards their framing is kept, so editing the schema with auto-generate on does not
 * yank the view back on every keystroke. */
export const diagramFrame = { scale: 1, x: 0, y: 0, adjusted: false };

const DIAGRAM_MIN_SCALE = 0.05;
const DIAGRAM_MAX_SCALE = 8;
/** Floor for *fitting* only - zooming out by hand still goes to [[DIAGRAM_MIN_SCALE]].
 *
 * A long chain of classes lays out tall and narrow (50 classes come out ~11 000 px high), and
 * fitting that into the panel would land around 0.05, where the diagram is a few pixels wide and the
 * labels are invisible. Past this point it is more use to open at a readable size, anchored at the
 * top left, and let the reader pan. */
const DIAGRAM_FIT_FLOOR = 0.4;

export function diagramCanvas(): HTMLElement | null {
  return $diagramView.querySelector<HTMLElement>(".diagram-canvas");
}

export function applyDiagramView(): void {
  const canvas = diagramCanvas();
  if (!canvas) return;
  const { x, y, scale } = diagramFrame;
  canvas.style.transform = `translate(${x}px, ${y}px) scale(${scale})`;
}

/** Pin the SVG to the pixel size of its own viewBox.
 *
 * Mermaid emits `width="100%"` plus a `max-width` style, which is right for a page that lets it
 * shrink to fit. Here the wrapper's transform does the scaling, so the SVG needs a fixed natural
 * size for the fit maths - and for a percentage width to mean anything at all inside a wrapper that
 * has no width of its own. */
export function sizeDiagramToViewBox(): void {
  const svg = diagramCanvas()?.querySelector("svg");
  const box = svg?.getAttribute("viewBox")?.split(/[\s,]+/).map(Number);
  if (!svg || !box || box.length !== 4 || !box[2] || !box[3]) return;
  svg.setAttribute("width", String(box[2]));
  svg.setAttribute("height", String(box[3]));
  svg.style.maxWidth = "none";
}

/** Scale the diagram to fit the panel and centre it. Never enlarges past 1:1, and never shrinks past
 * [[DIAGRAM_FIT_FLOOR]] - beyond that it anchors at the top left instead, to be panned. */
export function fitDiagram(): void {
  const canvas = diagramCanvas();
  const svg = canvas?.querySelector("svg");
  if (!canvas || !svg) return;
  const width = Number(svg.getAttribute("width")) || svg.getBoundingClientRect().width;
  const height = Number(svg.getAttribute("height")) || svg.getBoundingClientRect().height;
  if (!width || !height) return;
  const pad = 24;
  const scale = Math.max(
    DIAGRAM_FIT_FLOOR,
    Math.min(1, ($diagramView.clientWidth - pad) / width, ($diagramView.clientHeight - pad) / height),
  );
  diagramFrame.scale = scale;
  // `max(0, ...)` centres what fits and pins the rest to the top left, ready to be panned.
  diagramFrame.x = Math.max(0, ($diagramView.clientWidth - width * scale) / 2);
  diagramFrame.y = Math.max(0, ($diagramView.clientHeight - height * scale) / 2);
  diagramFrame.adjusted = false;
  applyDiagramView();
}

/** Zoom about a point in the viewport, so whatever sits under the cursor stays under it. */
function zoomDiagramAt(clientX: number, clientY: number, factor: number): void {
  const rect = $diagramView.getBoundingClientRect();
  const px = clientX - rect.left;
  const py = clientY - rect.top;
  const next = Math.min(DIAGRAM_MAX_SCALE, Math.max(DIAGRAM_MIN_SCALE, diagramFrame.scale * factor));
  if (next === diagramFrame.scale) return;
  diagramFrame.x = px - ((px - diagramFrame.x) / diagramFrame.scale) * next;
  diagramFrame.y = py - ((py - diagramFrame.y) / diagramFrame.scale) * next;
  diagramFrame.scale = next;
  diagramFrame.adjusted = true;
  applyDiagramView();
}

$diagramView.addEventListener(
  "wheel",
  (e: WheelEvent) => {
    if (!$diagramView.classList.contains("diagram--interactive")) return;
    e.preventDefault();
    // Trackpad pinches arrive as ctrl+wheel with much smaller deltas than a mouse notch.
    const intensity = e.ctrlKey ? 0.01 : 0.0015;
    zoomDiagramAt(e.clientX, e.clientY, Math.exp(-e.deltaY * intensity));
  },
  // Not passive: zooming has to stop the panel from scrolling.
  { passive: false },
);

$diagramView.addEventListener("pointerdown", (e: PointerEvent) => {
  if (!$diagramView.classList.contains("diagram--interactive") || e.button !== 0) return;
  const startX = e.clientX - diagramFrame.x;
  const startY = e.clientY - diagramFrame.y;
  $diagramView.setPointerCapture(e.pointerId);
  $diagramView.classList.add("diagram--panning");

  const move = (ev: PointerEvent) => {
    diagramFrame.x = ev.clientX - startX;
    diagramFrame.y = ev.clientY - startY;
    diagramFrame.adjusted = true;
    applyDiagramView();
  };
  const up = () => {
    $diagramView.classList.remove("diagram--panning");
    $diagramView.removeEventListener("pointermove", move);
    $diagramView.removeEventListener("pointerup", up);
    $diagramView.removeEventListener("pointercancel", up);
  };
  $diagramView.addEventListener("pointermove", move);
  $diagramView.addEventListener("pointerup", up);
  $diagramView.addEventListener("pointercancel", up);
});

$diagramView.addEventListener("dblclick", () => {
  if ($diagramView.classList.contains("diagram--interactive")) fitDiagram();
});
