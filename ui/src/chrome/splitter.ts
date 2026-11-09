// The divider between the input and the output panels: drag it, move it with the arrow keys, or
// click one of its triangles to show only one panel.
import { $ } from "../lib/dom.js";

const STORAGE_KEY = "linkml-ui-split";
/** How far one arrow key press moves the divider, as a share of the space. */
const KEY_STEP = 0.05;
/** The smallest a panel gets while dragging. Dragging past half of it hides the panel. */
const MIN_PANEL = 120;

type Mode = "both" | "input" | "output";

const $split = document.querySelector<HTMLElement>(".split")!;
const $splitter = $("splitter");
const $toOutput = $<HTMLButtonElement>("splitterToOutput");
const $toInput = $<HTMLButtonElement>("splitterToInput");
// The panels are stacked at this width (see styles.css), so the divider moves up and down.
const stacked = matchMedia("(max-width: 900px)");

/** The input's share of the space while both panels show. Kept while one is hidden, so the other
 * triangle brings back the same sizes. */
let ratio = 0.5;
let mode: Mode = "both";

function render(): void {
  const input = mode === "both" ? ratio : mode === "input" ? 1 : 0;
  $split.style.setProperty("--split-input", `${input}fr`);
  $split.style.setProperty("--split-output", `${1 - input}fr`);
  $split.classList.toggle("split--input-only", mode === "input");
  $split.classList.toggle("split--output-only", mode === "output");
  $splitter.setAttribute("aria-orientation", stacked.matches ? "horizontal" : "vertical");
  $splitter.setAttribute("aria-valuenow", String(Math.round(input * 100)));
  label($toOutput, mode === "input" ? "Show both panels" : "Show only the output");
  label($toInput, mode === "output" ? "Show both panels" : "Show only the input");
}

function label(btn: HTMLButtonElement, text: string): void {
  btn.title = text;
  btn.setAttribute("aria-label", text);
}

function save(): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ratio, mode }));
  } catch {
    // Storage may be blocked; the sizes then last until the page is closed.
  }
}

function set(nextRatio: number, nextMode: Mode): void {
  ratio = Math.min(1, Math.max(0, nextRatio));
  mode = nextMode;
  render();
  save();
}

/** Moves the divider all the way towards the input, so only the output shows. With only the input
 * showing, it brings back both panels at their earlier sizes instead. */
function towardsInput(): void {
  set(ratio, mode === "input" ? "both" : "output");
}

/** The same as [[towardsInput]], the other way round. */
function towardsOutput(): void {
  set(ratio, mode === "output" ? "both" : "input");
}

$toOutput.addEventListener("click", towardsInput);
$toInput.addEventListener("click", towardsOutput);

// ── Dragging ──

/** The input's share of the space for a pointer at `pos`, a page coordinate along the layout. */
function ratioAt(pos: number): { ratio: number; mode: Mode } {
  const box = $split.getBoundingClientRect();
  const across = stacked.matches ? $splitter.offsetHeight : $splitter.offsetWidth;
  // The space the two panels share, and how much of it the input would get.
  const size = (stacked.matches ? box.height : box.width) - across;
  const input = pos - (stacked.matches ? box.top : box.left) - across / 2;
  if (size <= 0) return { ratio, mode };
  if (input < MIN_PANEL / 2) return { ratio, mode: "output" };
  if (size - input < MIN_PANEL / 2) return { ratio, mode: "input" };
  const min = Math.min(MIN_PANEL, size / 2);
  return { ratio: Math.min(size - min, Math.max(min, input)) / size, mode: "both" };
}

$splitter.addEventListener("pointerdown", (e) => {
  // The triangles are buttons of their own; a press on one is a click, not a drag.
  if (e.button !== 0 || (e.target as Element).closest(".splitter-btn")) return;
  e.preventDefault();
  $splitter.setPointerCapture(e.pointerId);
  $splitter.classList.add("splitter--dragging");
});

$splitter.addEventListener("pointermove", (e) => {
  if (!$splitter.hasPointerCapture(e.pointerId)) return;
  const next = ratioAt(stacked.matches ? e.clientY : e.clientX);
  ratio = next.ratio;
  mode = next.mode;
  render();
});

function endDrag(e: PointerEvent): void {
  if (!$splitter.classList.contains("splitter--dragging")) return;
  $splitter.classList.remove("splitter--dragging");
  if ($splitter.hasPointerCapture(e.pointerId)) $splitter.releasePointerCapture(e.pointerId);
  save();
}
$splitter.addEventListener("pointerup", endDrag);
$splitter.addEventListener("pointercancel", endDrag);

// ── Keyboard ──

$splitter.addEventListener("keydown", (e) => {
  if (e.target !== $splitter) return;
  switch (e.key) {
    case "ArrowLeft":
    case "ArrowUp":
      // A step past the edge hides the input, and keeps its last size for when it comes back.
      if (mode === "input") set(ratio, "both");
      else if (mode === "output") break;
      else if (ratio - KEY_STEP < KEY_STEP / 2) set(ratio, "output");
      else set(ratio - KEY_STEP, "both");
      break;
    case "ArrowRight":
    case "ArrowDown":
      if (mode === "output") set(ratio, "both");
      else if (mode === "input") break;
      else if (ratio + KEY_STEP > 1 - KEY_STEP / 2) set(ratio, "input");
      else set(ratio + KEY_STEP, "both");
      break;
    case "Home":
      set(ratio, "output");
      break;
    case "End":
      set(ratio, "input");
      break;
    default:
      return;
  }
  e.preventDefault();
});

// ── Start ──

try {
  const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null");
  if (typeof saved?.ratio === "number" && saved.ratio > 0 && saved.ratio < 1) ratio = saved.ratio;
  if (saved?.mode === "input" || saved?.mode === "output") mode = saved.mode;
} catch {
  // Nothing saved, or storage is blocked: both panels, half each.
}
stacked.addEventListener("change", render);
render();
