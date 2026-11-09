// The load dialog: a schema or an ontology from a link, from ohi.dev or the example.
import type { Format as OhiFormat } from "@neverblink/ohi";
import type { Importer } from "../catalog/types.js";
import { scheduleGenerate } from "../generation.js";
import { $, wireDialog } from "../lib/dom.js";
import { activeStep, state } from "../state.js";
import { exampleInput, inputDoc } from "./documents.js";
import { loadFromUrl } from "./download.js";
import { hideOhiError, loadOhiPackage, openOhi, showOhiError } from "./ohi-search.js";
import { setInput } from "./pane.js";

const $loadDialog = $<HTMLDialogElement>("loadDialog");
const $urlForm = $<HTMLFormElement>("urlForm");
const $urlInput = $<HTMLInputElement>("urlInput");
const $urlError = $("urlError");
const $urlSubmit = $<HTMLButtonElement>("urlSubmit");
const $loadFrom = $<HTMLButtonElement>("loadFrom");

function showUrlError(message: string): void {
  $urlError.textContent = message;
  $urlError.hidden = false;
}

/** Load a link, and on failure hand it back in the dialog to be fixed. Nothing else on screen
 * would explain why the editor stayed empty. */
export async function loadOrPrompt(link: string): Promise<void> {
  const res = await loadFromUrl(link);
  if (res.ok || res.error === null) return;
  openLoadDialog();
  $urlInput.value = link;
  showUrlError(res.error);
  $urlInput.focus();
  scheduleGenerate(0);
}

export function openLoadDialog(): void {
  $urlInput.value = inputDoc().link ?? "";
  $urlError.hidden = true;
  hideOhiError();
  $loadDialog.showModal();
  openOhi();
}

$loadFrom.addEventListener("click", openLoadDialog);

$("exampleSubmit").addEventListener("click", () => {
  setInput(exampleInput());
  scheduleGenerate(0);
  $loadDialog.close();
});

$urlForm.addEventListener("submit", async (e) => {
  // Handled here rather than by the browser: the dialog stays open when the fetch fails.
  e.preventDefault();
  const link = $urlInput.value.trim();
  if (!link) return;
  $urlSubmit.disabled = true;
  $urlSubmit.textContent = "Loading…";
  const res = await loadFromUrl(link);
  $urlSubmit.disabled = false;
  $urlSubmit.textContent = "Load";
  if (res.ok) $loadDialog.close();
  else if (res.error !== null) showUrlError(res.error);
});

wireDialog($loadDialog);

/** Like [[loadOrPrompt]], for a package named in the address. */
export async function loadOhiOrPrompt(value: string, format: OhiFormat): Promise<void> {
  const res = await loadOhiPackage(value, format);
  if (res.ok || res.error === null) return;
  openLoadDialog();
  showOhiError(res.error);
  scheduleGenerate(0);
}

/** The labels that name what the dialog loads: a schema, or the ontology an importer reads. */
export function renderLoadLabels(): void {
  const importer = state.direction === "toLinkml" ? (activeStep() as Importer) : null;
  // Phrased without an article, so it reads right whatever an importer calls its input format.
  $("urlLabel").textContent = `${importer ? importer.inputLabel : "LinkML schema (YAML)"} to load`;
  // Every importer reads some kind of ontology, while the LinkML side reads a schema.
  const noun = importer ? "ontology" : "schema";
  $loadFrom.textContent = `Load ${noun}…`;
  $("loadTitle").textContent = `Load ${noun}`;
  $("exampleHint").textContent =
    `A small ${noun} for a library, with books, people and loans.`;
}
