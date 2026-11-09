// The playground's page: wires its parts together, and puts on screen what the address asks for.
import { importerById } from "./catalog/importers.js";
import { DEFAULT_TARGET_ID, targetById } from "./catalog/targets.js";
import "./chrome/help.js";
import "./chrome/repo-stats.js";
import "./chrome/theme.js";
import { scheduleGenerate, startWorker } from "./generation.js";
import { inputDoc } from "./input/documents.js";
import { incomingImporter, incomingLink, incomingOhi, incomingTarget, syncLinkParams } from "./input/links.js";
import { loadOhiOrPrompt, loadOrPrompt, renderLoadLabels } from "./input/load-dialog.js";
import { pickOhiFormat } from "./input/ohi-search.js";
import { markInputShown, renderInputLabels, setInput, swapInput } from "./input/pane.js";
import { knownOptions, openShareLink, shareFragment, type SharedState } from "./input/share.js";
import { ohiChoices } from "./input/documents.js";
import { onPageChanged } from "./output/page-view.js";
import { onReversed, renderPanelLabels, updateReverseButton } from "./output/panel.js";
import { activeKey, activeStep, optionValues, state } from "./state.js";
import { onDirectionPicked, renderDirection } from "./toolbar/direction.js";
import { renderOptions } from "./toolbar/option-fields.js";
import { onStepPicked, renderTargetPicker } from "./toolbar/target-picker.js";

/** Everything that follows from the direction and the step selected within it. */
function renderStep(): void {
  renderInputLabels();
  renderTargetPicker();
  renderOptions();
  renderPanelLabels();
  renderLoadLabels();
  renderDirection();
  updateReverseButton();
}

/** Take a new direction or step, including the input document that goes with it. */
function selectStep(): void {
  renderStep();
  swapInput();
  // The address bar names the step as well, and `swapInput` does nothing when the document stays.
  syncLinkParams();
  scheduleGenerate(0);
}

onDirectionPicked((dir) => {
  state.direction = dir;
  selectStep();
});

onStepPicked((step) => {
  if (state.direction === "fromLinkml") state.targetId = step.id;
  else state.importerId = step.id;
  selectStep();
});

onReversed((step, text) => {
  state.direction = state.direction === "fromLinkml" ? "toLinkml" : "fromLinkml";
  if (state.direction === "toLinkml") state.importerId = step.id;
  else state.targetId = step.id;

  // The one place the two sides meet: what was generated becomes the other side's input, replacing
  // whatever was sitting there.
  const doc = inputDoc();
  doc.text = text;
  doc.link = null;
  doc.remote = null;
  doc.ohi = null;
  selectStep();
});

onPageChanged(() => scheduleGenerate(0));

/** Put the state that a share link carries on screen. */
function applySharedState(shared: SharedState): void {
  // An id this build does not know (a link from a newer playground) leaves the default generator
  // selected, and its options with it - they would not mean anything here either.
  const importer = shared.i === undefined ? undefined : importerById(shared.i);
  if (importer) {
    state.direction = "toLinkml";
    state.importerId = importer.id;
  } else {
    state.direction = "fromLinkml";
    state.targetId = targetById(shared.t ?? "")?.id ?? DEFAULT_TARGET_ID;
  }
  Object.assign(optionValues[activeKey()]!, knownOptions(activeStep(), shared.o));
  renderStep();

  // The direction decides which document the link's text belongs to, so it is set first and the
  // editor only pointed at that document once the answer is known.
  markInputShown();
  if (shared.u !== undefined) {
    void loadOrPrompt(shared.u);
  } else {
    const doc = inputDoc();
    doc.link = null;
    doc.remote = null;
    doc.ohi = null;
    setInput(shared.s ?? "");
    scheduleGenerate(0);
  }
}

// ── Start ────────────────────────────────────────────────────────────────

// A link may name the generator it was made from; an importer's own link is read further down,
// together with the input pane it belongs to.
const initialTarget = incomingTarget();
if (initialTarget) state.targetId = initialTarget.id;

// The editor was built from this document, so record it rather than swapping it back in.
markInputShown();
renderStep();

const initialShare = shareFragment();
const initialLink = incomingLink();
const initialOhi = incomingOhi();
if (initialShare !== null) {
  // Read once, then dropped from the address bar: it keeps the URL legible, and stops an
  // edit-then-reload resurrecting the state the link came with. The schema itself survives a
  // reload either way, through localStorage.
  const clean = new URL(location.href);
  clean.hash = "";
  history.replaceState(null, "", clean);
  startWorker();
  void openShareLink(initialShare, applySharedState);
} else if (initialLink === null && initialOhi === null) {
  // Starts the worker, which begins loading the LinkML bundle immediately. The request waits on
  // that load inside the worker, so the page is interactive while the multi-MB bundle parses.
  scheduleGenerate(0);
} else {
  // Same warm-up, minus the request: the download generates once it lands, so asking for a
  // generation here as well would parse the previous session's schema for nothing.
  startWorker();
  // The link may belong to an importer's pane, which has to be on screen before it loads.
  const importer = incomingImporter();
  if (importer) {
    state.direction = "toLinkml";
    state.importerId = importer.id;
    renderStep();
    swapInput();
  }
  if (initialOhi) {
    // A format this pane cannot read falls back to the one it reads by default.
    const choice = ohiChoices().find((c) => c.format === initialOhi.format) ?? ohiChoices()[0]!;
    pickOhiFormat(choice.format);
    void loadOhiOrPrompt(initialOhi.value, choice.format);
  } else {
    void loadOrPrompt(initialLink!);
  }
}
