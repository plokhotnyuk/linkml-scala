// One page of the Docs target, with its Markdown on the Code half. Links lead to the other pages,
// which the Docs target is asked for one at a time, and the Home button back to the index.
import { $ } from "../lib/dom.js";
import { isPageLink, resolvePageLink } from "../lib/markdown.js";
import { INDEX_PAGE, state } from "../state.js";
import { errorNotice } from "./notice.js";
import { $outputEditorHost } from "./output-editor.js";
import { activate, type OutputView } from "./panel.js";
import { TwinTabs } from "./view-tabs.js";

const $pageView = $("pageView");

// The page that the page view shows, and its Markdown. Non-null exactly while the page view is up.
let shownPagePath: string | null = null;
let pageSource: string | null = null;
// Where the page view is scrolled to, and where to scroll it when it is shown again. It is kept up
// to date by the `scroll` listener of the page view, because reading `scrollTop` when the page has
// changed makes the browser lay out the page first.
let pageScrollTop = 0;

const tabs = new TwinTabs("Page", $pageView, () => showHalf());

const pageView: OutputView = {
  hide() {
    $pageView.hidden = true;
    $pageView.innerHTML = "";
    pageSource = null;
    shownPagePath = null;
    pageScrollTop = 0;
    tabs.clear();
    $outputEditorHost.hidden = false;
  },
  copyText: () => pageSource,
};

/** What asking for another page does, once `state.pagePath` names it. */
let regenerate: () => void = () => {};

export function onPageChanged(handler: () => void): void {
  regenerate = handler;
}

/** Ask for the page `path` of the Docs target, which the page view then shows. */
function showDocsPage(path: string): void {
  state.pagePath = path;
  regenerate();
}

// The button back to the index, at the start of the tab bar, or on a phone beside the Page/Code
// switch.
const $pageHome = document.createElement("button");
$pageHome.className = "page-home";
$pageHome.title = "Back to the index";
$pageHome.setAttribute("aria-label", "Back to the index");
$pageHome.innerHTML =
  '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h5v-6h4v6h5V9.5"/></svg>';
$pageHome.addEventListener("click", () => showDocsPage(INDEX_PAGE));

/** Show the page `path` of the Docs target, with the Markdown `text` and the HTML `html`, behind a
 * Page/Code tab pair sharing the file tab bar. `html` is null if the documentation has no such
 * page. */
export function showPage(path: string, text: string, html: string | null): void {
  activate(pageView);
  tabs.setCode(text, "text");
  tabs.showTabs($pageHome);
  $pageHome.disabled = path === INDEX_PAGE;

  // Another page starts at the top. The same page regenerated, as while typing, keeps its place.
  if (path !== shownPagePath) pageScrollTop = 0;
  shownPagePath = path;
  pageSource = text;
  if (html === null) {
    $pageView.replaceChildren(errorNotice("This documentation has no such page", path));
  } else {
    // The HTML is safe to show as it is (see markdown.ts).
    $pageView.innerHTML = html;
  }
  showHalf();
}

function showHalf(): void {
  // A hidden element loses where it was scrolled to, and a new page starts at the top.
  if (tabs.showHalf()) $pageView.scrollTop = pageScrollTop;
}

$pageView.addEventListener(
  "scroll",
  () => {
    pageScrollTop = $pageView.scrollTop;
  },
  { passive: true },
);

// Show the pages that links lead to in the page view, and scroll it to the anchors that links
// within a page lead to, rather than letting the browser change the playground's own address.
$pageView.addEventListener("click", (e) => {
  const link = (e.target as Element).closest("a");
  const href = link?.getAttribute("href");
  if (!href) return;
  if (isPageLink(href)) {
    e.preventDefault();
    showDocsPage(resolvePageLink(shownPagePath ?? INDEX_PAGE, href));
  } else if (href.startsWith("#")) {
    e.preventDefault();
    const id = decodeURIComponent(href.slice(1));
    const target = id ? $pageView.querySelector(`[id="${CSS.escape(id)}"]`) : null;
    if (target) target.scrollIntoView({ block: "start" });
    else $pageView.scrollTop = 0;
  }
});
