// The tab bar above the output: a generator's files, or the two halves of a view that has a Code
// twin, such as Diagram/Code.
import type { OutputLang } from "../lib/editor.js";
import { setOutput } from "../lib/editor.js";
import { $ } from "../lib/dom.js";
import { $outputEditorHost, outputView, whenOutputInView } from "./output-editor.js";
import { showsCode } from "./panel.js";

const $fileTabs = $("fileTabs");

// On a phone, the two halves of a view move out of the tab bar into the Output bar, as a two-way
// switch, which saves the row the tab bar would take. A generator's files stay in the tab bar, even
// when there are two of them. Matches the narrow layout in styles.css.
const narrowLayout = matchMedia("(max-width: 640px)");
const $outputHead = $("outputPanel").querySelector<HTMLElement>(".panel-head")!;
/** Whether the tab bar holds the two halves of a view, rather than a generator's files. */
let tabsAreViews = false;
/** A button that goes before the tabs, such as the page view's Home button. */
let leading: HTMLElement | null = null;

function placeTabs(): void {
  const inHead = tabsAreViews && narrowLayout.matches;
  $fileTabs.classList.toggle("file-tabs--switch", inHead);
  const after = inHead ? $outputHead.querySelector(".panel-title")! : $outputHead;
  if ($fileTabs.previousElementSibling !== after) after.after($fileTabs);
  // Not one of the two halves, so on a phone it goes beside the switch rather than in it.
  if (leading) {
    if (inHead) $fileTabs.before(leading);
    else $fileTabs.prepend(leading);
  }
}
narrowLayout.addEventListener("change", placeTabs);

/** Fill the tab bar with a button for each of `labels`, the one at `active` marked, and `first`
 * before them. */
function fillTabs(labels: string[], active: string | null, pick: (label: string, btn: HTMLElement) => void, first: HTMLElement | null): void {
  $fileTabs.innerHTML = "";
  if (leading !== first) leading?.remove();
  leading = first;
  for (const label of labels) {
    const btn = document.createElement("button");
    btn.className = "file-tab" + (label === active ? " file-tab--active" : "");
    btn.textContent = label;
    btn.addEventListener("click", () => pick(label, btn));
    $fileTabs.appendChild(btn);
  }
  placeTabs();
}

/** Take the tab bar off screen, for a view that has no tabs. */
export function hideTabs(): void {
  tabsAreViews = false;
  fillTabs([], null, () => {}, null);
  $fileTabs.hidden = true;
}

/** A tab for each of a generator's files, called `names`, with the one called `active` marked. The
 * bar is left out when there is only one file. */
export function showFileTabs(names: string[], active: string | null, pick: (name: string) => void): void {
  tabsAreViews = false;
  fillTabs(names, active, pick, null);
  $fileTabs.hidden = names.length <= 1;
}

/** The two halves of a view with a Code twin: its own element, and the output editor with the
 * code it was made from.
 *
 * Which half is showing is kept across results, so typing in the schema does not throw you back to
 * the other one. The output editor gets the code only when the Code half is opened: an update makes
 * the editor read the selection, and if the other half is showing, the browser then has to lay it
 * out first, which takes seconds for a large page. */
export class TwinTabs {
  /** Whether the Code half is showing. */
  code = false;
  private text: string | null = null;
  private lang: OutputLang = "text";
  /** Whether the output editor holds older code than [[text]]. */
  private behind = false;

  /**
   * @param label what the view's own half is called, such as "Diagram"
   * @param view the element of the view's own half
   * @param switched what to do once the user has switched halves
   */
  constructor(
    private readonly label: string,
    private readonly view: HTMLElement,
    private readonly switched: () => void,
  ) {}

  /** Put the two tabs in the tab bar, with `first` before them. */
  showTabs(first: HTMLElement | null = null): void {
    tabsAreViews = true;
    fillTabs([this.label, "Code"], this.code ? "Code" : this.label, (label, btn) => {
      const code = label === "Code";
      if (code === this.code) return;
      this.code = code;
      for (const other of $fileTabs.querySelectorAll(".file-tab")) {
        other.classList.toggle("file-tab--active", other === btn);
      }
      this.switched();
    }, first);
    $fileTabs.hidden = false;
  }

  /** The code that the Code half shows. */
  setCode(text: string, lang: OutputLang): void {
    this.text = text;
    this.lang = lang;
    this.behind = true;
  }

  /** Show the half that [[code]] says. Returns whether that is the view's own half. */
  showHalf(): boolean {
    showsCode(this.code);
    if (!this.code) {
      $outputEditorHost.hidden = true;
      this.view.hidden = false;
      return true;
    }
    this.view.hidden = true;
    $outputEditorHost.hidden = false;
    if (this.behind) {
      this.behind = false;
      setOutput(outputView, "", "text");
      whenOutputInView(() => {
        if (this.text !== null && this.code) setOutput(outputView, this.text, this.lang);
        else this.behind = this.text !== null;
      });
    }
    return false;
  }

  /** Forget the code, as the view is going off screen. */
  clear(): void {
    this.text = null;
    this.behind = false;
  }
}
