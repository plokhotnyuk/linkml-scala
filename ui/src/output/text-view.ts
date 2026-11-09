// Generated text in the output editor: one document, an error, or a generator's files behind tabs.
import type { Target } from "../catalog/types.js";
import { setOutput, type OutputLang } from "../lib/editor.js";
import { stepLang } from "../state.js";
import { outputView } from "./output-editor.js";
import { activate, type OutputView } from "./panel.js";
import { hideTabs, showFileTabs } from "./view-tabs.js";

/** Copy hands out what the output editor holds, and there is nothing else to forget. */
const textView: OutputView = {
  hide() {},
  copyText: () => null,
};

export function showText(text: string, lang: OutputLang): void {
  activate(textView);
  hideTabs();
  setOutput(outputView, text, lang);
}

export function showError(text: string): void {
  activate(textView);
  hideTabs();
  outputView.dom.classList.add("cm-output--error");
  setOutput(outputView, text, "text");
}

// Which file tab is open, per target.
const activeFile: Record<string, string | null> = {};

export function showFiles(target: Target, dict: Record<string, string>): void {
  activate(textView);
  const names = Object.keys(dict);
  let active = activeFile[target.id] ?? null;
  if (!active || !names.includes(active)) active = names[0] ?? null;
  activeFile[target.id] = active;
  showFileTabs(names, active, (name) => {
    activeFile[target.id] = name;
    showFiles(target, dict);
  });
  // Only a generator produces files, so this is always the generator direction.
  setOutput(outputView, (active && dict[active]) || "", stepLang(target, "fromLinkml"));
}
