// The generator or importer picker: a button that opens a list with a search box.
import type { Step } from "../catalog/types.js";
import { $ } from "../lib/dom.js";
import { activeStep, state, steps } from "../state.js";

const $targetCombo = $("targetCombo");
const $targetButton = $<HTMLButtonElement>("targetButton");
const $targetLabel = $("targetLabel");
const $targetPopup = $("targetPopup");
const $targetSearch = $<HTMLInputElement>("targetSearch");
const $targetList = $("targetList");

/** What picking a generator or importer does, once the list has closed. */
let onPick: (step: Step) => void = () => {};

export function onStepPicked(handler: (step: Step) => void): void {
  onPick = handler;
}

function pick(step: Step): void {
  closeCombo(true);
  onPick(step);
}

/** What the user has typed to narrow the list. Null means they have not typed anything since the
 * list opened, so every option is on offer. */
let comboQuery: string | null = null;
/** The options currently listed, in the order they are shown, with the element for each. */
let comboItems: { step: Step; el: HTMLElement }[] = [];
/** Index into [[comboItems]] of the option the arrow keys are on. */
let comboActive = 0;

function comboOpen(): boolean {
  return !$targetPopup.hidden;
}

/** Show the label of whatever is selected. Called on every render, so a change of direction or a
 * reverse lands on the button too. */
export function renderTargetPicker(): void {
  $targetLabel.textContent = activeStep().label;
  if (comboOpen()) renderComboList();
}

function openCombo(): void {
  $targetPopup.hidden = false;
  $targetButton.setAttribute("aria-expanded", "true");
  comboQuery = null;
  $targetSearch.value = "";
  renderComboList();
  $targetSearch.focus();
}

/** `returnFocus` puts focus back on the button, for when the list closes while the search box has
 * focus - otherwise focus would fall back to the page and keyboard users would lose their place. */
function closeCombo(returnFocus = false): void {
  if (!comboOpen()) return;
  $targetPopup.hidden = true;
  $targetButton.setAttribute("aria-expanded", "false");
  $targetSearch.removeAttribute("aria-activedescendant");
  comboQuery = null;
  comboItems = [];
  if (returnFocus) $targetButton.focus();
}

export function renderComboList(): void {
  const query = (comboQuery ?? "").trim().toLowerCase();
  const matches = query ? steps(state.direction).filter((s) => s.label.toLowerCase().includes(query)) : steps(state.direction);
  const selectedId = activeStep().id;

  $targetList.innerHTML = "";
  comboItems = matches.map((step) => {
    const el = document.createElement("li");
    el.id = `target-opt-${step.id}`;
    el.className = "combo-option" + (step.id === selectedId ? " combo-option--selected" : "");
    el.setAttribute("role", "option");
    el.setAttribute("aria-selected", String(step.id === selectedId));
    el.textContent = step.label;
    // mousedown, not click, with the default stopped: otherwise the search box loses focus first
    // and the list closes out from under it.
    el.addEventListener("mousedown", (e) => {
      e.preventDefault();
      pick(step);
    });
    el.addEventListener("mousemove", () => setComboActive(comboItems.findIndex((it) => it.el === el)));
    $targetList.appendChild(el);
    return { step, el };
  });

  if (!comboItems.length) {
    const empty = document.createElement("li");
    empty.className = "combo-empty";
    empty.textContent = "No match";
    $targetList.appendChild(empty);
    $targetSearch.removeAttribute("aria-activedescendant");
    return;
  }
  // Start on what is selected when the list opens unfiltered, and on the first hit once filtering.
  const start = comboQuery === null ? comboItems.findIndex((it) => it.step.id === selectedId) : 0;
  setComboActive(Math.max(0, start));
}

/** Move the keyboard highlight, wrapping at both ends. `index` may be -1 or the length itself: one
 * step off either end wraps round to the other. */
function setComboActive(index: number): void {
  if (!comboItems.length) return;
  comboActive = (index + comboItems.length) % comboItems.length;
  comboItems.forEach((it, i) => it.el.classList.toggle("combo-option--active", i === comboActive));
  const current = comboItems[comboActive]!;
  $targetSearch.setAttribute("aria-activedescendant", current.el.id);
  current.el.scrollIntoView({ block: "nearest" });
}

// The default is stopped so a click on the button while the list is open does not pull focus out
// of the search box, which would close the list before the click could. Enter and Space on the
// button still fire the click.
$targetButton.addEventListener("mousedown", (e) => e.preventDefault());
$targetButton.addEventListener("click", () => {
  if (comboOpen()) closeCombo(true);
  else openCombo();
});
$targetButton.addEventListener("keydown", (e) => {
  if ((e.key === "ArrowDown" || e.key === "ArrowUp") && !comboOpen()) {
    e.preventDefault();
    openCombo();
  }
});

// Close once focus goes anywhere outside the button and the list.
$targetCombo.addEventListener("focusout", (e) => {
  if (!$targetCombo.contains(e.relatedTarget as Node | null)) closeCombo();
});

$targetSearch.addEventListener("input", () => {
  comboQuery = $targetSearch.value;
  renderComboList();
});

$targetSearch.addEventListener("keydown", (e) => {
  if (e.key === "ArrowDown" || e.key === "ArrowUp") {
    e.preventDefault();
    setComboActive(comboActive + (e.key === "ArrowDown" ? 1 : -1));
  } else if (e.key === "Enter") {
    e.preventDefault();
    const highlighted = comboItems[comboActive];
    if (highlighted) pick(highlighted.step);
  } else if (e.key === "Escape") {
    // Kept off the page: Escape would otherwise reach an enclosing dialog or reset the field.
    e.preventDefault();
    e.stopPropagation();
    closeCombo(true);
  }
});
