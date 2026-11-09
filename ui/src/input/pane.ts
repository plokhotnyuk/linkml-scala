// The input pane: the editor with the document that the generator or importer reads.
import type { Importer } from "../catalog/types.js";
import { scheduleGenerate, setInputSource } from "../generation.js";
import { createInput, setDoc, setInputLang } from "../lib/editor.js";
import { $ } from "../lib/dom.js";
import { activeStep, INDEX_PAGE, state } from "../state.js";
import { inputDoc, inputKey, storageKey } from "./documents.js";
import { clearLinkParams, syncLinkParams } from "./links.js";

const $inputSub = $("inputSub");
const $clearInput = $<HTMLButtonElement>("clearInput");

const inputView = createInput($("inputEditor"), inputDoc().text, (value) => {
  const doc = inputDoc();
  doc.text = value;
  localStorage.setItem(storageKey(inputKey()), value);
  // Once the text on screen differs from what the link serves, a shared address would hand the
  // other person something other than what you are looking at, so drop the link.
  if (value !== doc.remote) {
    doc.link = null;
    doc.ohi = null;
    clearLinkParams();
  }
  scheduleGenerate();
});

/** The text in the input editor. */
export function inputText(): string {
  return inputView.state.doc.toString();
}

setInputSource(inputText);

/** Put `text` in the input editor as another document, rather than as an edit of the one shown. */
export function setInput(text: string): void {
  setDoc(inputView, text);
  // Another schema has other pages.
  state.pagePath = INDEX_PAGE;
}

/** Which document the editor is showing, so that switching target within one direction does not
 * needlessly replace it. */
let shownInput = "";

/** Note that the editor shows the document of the direction and step in `state`, as when it was
 * made with it. */
export function markInputShown(): void {
  shownInput = inputKey();
}

/** Show the document of the direction and step in `state`, if it is not the one on screen. */
export function swapInput(): void {
  const key = inputKey();
  if (key === shownInput) return;
  shownInput = key;
  setInput(inputDoc().text);
  syncLinkParams();
}

/** The highlighting and the label of the pane, which follow the importer. */
export function renderInputLabels(): void {
  const importer = state.direction === "toLinkml" ? (activeStep() as Importer) : null;
  setInputLang(inputView, importer?.inputLang ?? "yaml");
  $inputSub.textContent = importer ? importer.inputLabel : "LinkML YAML";
}

// Lets the change listener do the storing: it already writes to the key the active document
// belongs to. So does loading an example (see load-dialog.ts).
$clearInput.addEventListener("click", () => {
  setInput("");
  localStorage.removeItem(storageKey(inputKey()));
  inputView.focus();
  scheduleGenerate(0);
});
