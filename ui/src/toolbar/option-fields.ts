// The option widgets of the generator or importer, and on a phone the popup that holds them.
import type { Option } from "../catalog/types.js";
import { scheduleGenerate } from "../generation.js";
import { $ } from "../lib/dom.js";
import { activeKey, activeStep, optionValues } from "../state.js";

const $optionsRow = $("optionsRow");
const $settingsToggle = $<HTMLButtonElement>("settingsToggle");
const $settingsPanel = $("settingsPanel");

/** The widgets on screen, so [[updateOptionVisibility]] can reach them. */
let optionFields: { opt: Option; field: HTMLElement }[] = [];

/** Some options only mean anything alongside another - the tree root is dead weight unless the
 * pruning mode is tree-root. Hidden rather than rebuilt, so showing or hiding one never takes
 * focus away from the widget that is being used. */
function updateOptionVisibility(): void {
  const values = optionValues[activeKey()]!;
  for (const { opt, field } of optionFields) {
    field.hidden = opt.showIf !== undefined && !opt.showIf(values);
  }
}

export function renderOptions(): void {
  const step = activeStep();
  const values = optionValues[activeKey()]!;
  $optionsRow.innerHTML = "";
  optionFields = [];

  for (const opt of step.options) {
    const field = document.createElement("div");
    field.className = "opt-field";
    const id = `opt-${activeKey()}-${opt.key}`;

    if (opt.type === "checkbox") {
      field.innerHTML = `<input type="checkbox" id="${id}"><label for="${id}">${opt.label}</label>`;
      const input = field.querySelector("input")!;
      input.checked = !!values[opt.key];
      if (opt.title) field.title = opt.title;
      input.addEventListener("change", () => {
        values[opt.key] = input.checked;
        updateOptionVisibility();
        scheduleGenerate();
      });
    } else if (opt.type === "select") {
      const select = document.createElement("select");
      select.id = id;
      for (const choice of opt.choices ?? []) {
        const o = document.createElement("option");
        o.value = choice;
        o.textContent = choice;
        select.appendChild(o);
      }
      select.value = String(values[opt.key]);
      const label = document.createElement("label");
      label.htmlFor = id;
      label.textContent = opt.label;
      field.append(label, select);
      select.addEventListener("change", () => {
        values[opt.key] = select.value;
        updateOptionVisibility();
        scheduleGenerate();
      });
    } else {
      const input = document.createElement("input");
      input.type = opt.type;
      input.id = id;
      input.value = String(values[opt.key]);
      if (opt.placeholder) input.placeholder = opt.placeholder;
      const label = document.createElement("label");
      label.htmlFor = id;
      label.textContent = opt.label;
      field.append(label, input);
      input.addEventListener("input", () => {
        values[opt.key] = input.value;
        updateOptionVisibility();
        scheduleGenerate();
      });
    }

    $optionsRow.appendChild(field);
    optionFields.push({ opt, field });
  }

  updateOptionVisibility();
}

// The popup that holds them on a phone

function settingsOpen(): boolean {
  return $settingsPanel.classList.contains("settings-panel--open");
}

function setSettingsOpen(open: boolean): void {
  $settingsPanel.classList.toggle("settings-panel--open", open);
  $settingsToggle.setAttribute("aria-expanded", String(open));
}

$settingsToggle.addEventListener("click", () => setSettingsOpen(!settingsOpen()));

// Close on a press anywhere outside the button and the popup.
document.addEventListener("pointerdown", (e) => {
  const target = e.target as Node;
  if (settingsOpen() && !$settingsPanel.contains(target) && !$settingsToggle.contains(target))
    setSettingsOpen(false);
});

$settingsPanel.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  setSettingsOpen(false);
  $settingsToggle.focus();
});
