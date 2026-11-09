// The output panel: which view is on screen, and the buttons in its bar - Copy, the button that
// converts the output back, and the link to the docs of the generator or importer.
import { IMPORTERS } from "../catalog/importers.js";
import { targetById } from "../catalog/targets.js";
import type { Importer, Step } from "../catalog/types.js";
import { $, flashDone } from "../lib/dom.js";
import { activeStep, state } from "../state.js";
import { outputView } from "./output-editor.js";

const $outputPanel = $("outputPanel");
const $outputSub = $("outputSub");
const $outputHelp = $<HTMLAnchorElement>("outputHelp");
const $copyOutput = $<HTMLButtonElement>("copyOutput");
const $reverseOutput = $<HTMLButtonElement>("reverseOutput");

/** One of the ways the output panel shows a result: as text, a report, a diagram and so on. */
export interface OutputView {
  /** Take the view off screen, and forget what it showed. */
  hide(): void;
  /** What Copy hands out while the view is on screen, or null for what the output editor holds. */
  copyText(): string | null;
}

let current: OutputView | null = null;

/** Make `view` the one on screen, hiding the one that was. Each view calls this first when it shows
 * something. Showing the same view again keeps what it remembers, such as where it is scrolled to. */
export function activate(view: OutputView): void {
  if (current !== view) current?.hide();
  current = view;
  outputView.dom.classList.remove("cm-output--error");
  showsCode(true);
}

/** Whether the half of the view on screen is code, rather than a page, a diagram or tables. On a
 * phone, Copy is left out of the Output bar while it is not, as the bar has too much in it. */
export function showsCode(code: boolean): void {
  $outputPanel.classList.toggle("panel--visual", !code);
}

$copyOutput.addEventListener("click", async () => {
  const text = current?.copyText() ?? outputView.state.doc.toString();
  if (!text) return;
  try {
    await navigator.clipboard.writeText(text);
    flashDone($copyOutput, "Copied!");
  } catch {
    /* clipboard permission denied – nothing sensible to do */
  }
});

/** The labels of the panel that name the generator or importer. */
export function renderPanelLabels(): void {
  const step = activeStep();
  $outputHelp.href = `https://linkml.ohi.dev/docs/${step.docs}`;
  $outputHelp.title = `${step.label} documentation`;
  $outputHelp.setAttribute("aria-label", `${step.label} documentation (opens in a new tab)`);
  $outputSub.textContent = state.direction === "toLinkml" ? "LinkML" : "";
}

// ── Converting the output back ───────────────────────────────────────────

/** The step that would undo what is on screen: for a generator, the importer that reads its output
 * back; for an importer, the generator it undoes. */
function reverseStep(): Step | undefined {
  if (state.direction === "fromLinkml") return IMPORTERS.find((i) => i.reverses?.includes(state.targetId));
  const reverses = (activeStep() as Importer).reverses ?? [];
  return targetById(reverses.includes(state.targetId) ? state.targetId : (reverses[0] ?? ""));
}

/** The output as it would be handed over, while there is one to hand over. */
let reversibleOutput: string | null = null;

/** What converting `text` back with `step` does. */
let onReverse: (step: Step, text: string) => void = () => {};

export function onReversed(handler: (step: Step, text: string) => void): void {
  onReverse = handler;
}

export function setReversibleOutput(text: string | null): void {
  reversibleOutput = text;
  updateReverseButton();
}

export function updateReverseButton(): void {
  const step = reverseStep();
  $reverseOutput.hidden = step === undefined || reversibleOutput === null;
  if ($reverseOutput.hidden) return;
  const label = `Convert back to ${state.direction === "toLinkml" ? step!.label : "LinkML"}`;
  $reverseOutput.title = label;
  $reverseOutput.setAttribute("aria-label", label);
}

$reverseOutput.addEventListener("click", () => {
  const step = reverseStep();
  if (step && reversibleOutput !== null) onReverse(step, reversibleOutput);
});
