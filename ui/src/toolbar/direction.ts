// Which way the conversion runs: the From/To toggle, and on a phone a list in its place.
import type { Direction } from "../catalog/types.js";
import { $ } from "../lib/dom.js";
import { state } from "../state.js";

const $dirToggle = $("dirToggle");
const $dirCombo = $("dirCombo");
const $dirButton = $<HTMLButtonElement>("dirButton");
const $dirLabel = $("dirLabel");
const $dirList = $("dirList");

/** What picking a direction other than the one in `state` does. */
let onPick: (dir: Direction) => void = () => {};

export function onDirectionPicked(handler: (dir: Direction) => void): void {
  onPick = handler;
}

/** Show the direction in `state` on the toggle and the list. */
export function renderDirection(): void {
  for (const btn of $dirToggle.querySelectorAll<HTMLButtonElement>(".dir-btn")) {
    const on = btn.dataset.dir === state.direction;
    btn.classList.toggle("dir-btn--active", on);
    btn.setAttribute("aria-pressed", String(on));
  }
  renderDirCombo();
}

$dirToggle.addEventListener("click", (e) => {
  const btn = (e.target as HTMLElement).closest<HTMLButtonElement>(".dir-btn");
  if (!btn || btn.dataset.dir === state.direction) return;
  onPick(btn.dataset.dir as Direction);
});

// The narrow layout's stand-in for the toggle: a list like the target picker's, with the same
// mouse and keyboard handling, but no search box. Focus sits on the list itself while it is open.

const dirOptions = [...$dirList.querySelectorAll<HTMLElement>(".combo-option")];
/** Index into [[dirOptions]] of the option the arrow keys are on. */
let dirActive = 0;

function dirComboOpen(): boolean {
  return !$dirList.hidden;
}

function renderDirCombo(): void {
  for (const el of dirOptions) {
    const on = el.dataset.dir === state.direction;
    el.classList.toggle("combo-option--selected", on);
    el.setAttribute("aria-selected", String(on));
    if (on) $dirLabel.textContent = el.textContent;
  }
}

function setDirActive(index: number): void {
  dirActive = (index + dirOptions.length) % dirOptions.length;
  dirOptions.forEach((el, i) => el.classList.toggle("combo-option--active", i === dirActive));
  $dirList.setAttribute("aria-activedescendant", dirOptions[dirActive]!.id);
}

function openDirCombo(): void {
  $dirList.hidden = false;
  $dirButton.setAttribute("aria-expanded", "true");
  setDirActive(dirOptions.findIndex((el) => el.dataset.dir === state.direction));
  $dirList.focus();
}

function closeDirCombo(returnFocus = false): void {
  if (!dirComboOpen()) return;
  $dirList.hidden = true;
  $dirButton.setAttribute("aria-expanded", "false");
  if (returnFocus) $dirButton.focus();
}

function pickDirection(dir: Direction): void {
  closeDirCombo(true);
  if (dir !== state.direction) onPick(dir);
}

// See the target picker's handlers for why mousedown is stopped.
$dirButton.addEventListener("mousedown", (e) => e.preventDefault());
$dirButton.addEventListener("click", () => {
  if (dirComboOpen()) closeDirCombo(true);
  else openDirCombo();
});
$dirButton.addEventListener("keydown", (e) => {
  if ((e.key === "ArrowDown" || e.key === "ArrowUp") && !dirComboOpen()) {
    e.preventDefault();
    openDirCombo();
  }
});
dirOptions.forEach((el, i) => {
  el.addEventListener("mousedown", (e) => {
    e.preventDefault();
    pickDirection(el.dataset.dir as Direction);
  });
  el.addEventListener("mousemove", () => setDirActive(i));
});
$dirList.addEventListener("keydown", (e) => {
  if (e.key === "ArrowDown" || e.key === "ArrowUp") {
    e.preventDefault();
    setDirActive(dirActive + (e.key === "ArrowDown" ? 1 : -1));
  } else if (e.key === "Enter" || e.key === " ") {
    e.preventDefault();
    pickDirection(dirOptions[dirActive]!.dataset.dir as Direction);
  } else if (e.key === "Escape") {
    e.preventDefault();
    e.stopPropagation();
    closeDirCombo(true);
  }
});
$dirCombo.addEventListener("focusout", (e) => {
  if (!$dirCombo.contains(e.relatedTarget as Node | null)) closeDirCombo();
});
