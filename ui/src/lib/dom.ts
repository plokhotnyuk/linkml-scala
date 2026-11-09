// Small helpers for finding, building and wiring elements of the page.

export const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;

/** A new element, with a class and text if they are given. */
export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/** Swap a text-only button's label for a moment, to confirm something happened. Ignored while a
 * previous flash is still up, so a double click cannot leave "Copied!" as the permanent label. */
export function flashDone(btn: HTMLButtonElement, label: string): void {
  if (btn.classList.contains("btn--done")) return;
  const original = btn.textContent;
  btn.textContent = label;
  btn.classList.add("btn--done");
  setTimeout(() => {
    btn.textContent = original;
    btn.classList.remove("btn--done");
  }, 1200);
}

/** Close a dialog on its header X, on any extra close button named here, and on a backdrop click -
 * which lands on the dialog element itself, since its content fills it. */
export function wireDialog(dialog: HTMLDialogElement, ...closeSelectors: string[]): void {
  for (const selector of [".modal-close", ...closeSelectors]) {
    dialog.querySelector<HTMLElement>(selector)!.addEventListener("click", () => dialog.close());
  }
  dialog.addEventListener("click", (e) => {
    if (e.target === dialog) dialog.close();
  });
}
