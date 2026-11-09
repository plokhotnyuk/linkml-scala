// One page of the Docs target. Links lead to the other pages, which the Docs target is asked for
// one at a time. The Home, Back and Forward buttons do what the browser's would, as the playground
// is a single page that the browser's own buttons would leave.
import { $ } from "../lib/dom.js";
import { isPageLink, resolvePageLink } from "../lib/markdown.js";
import { INDEX_PAGE, type PageVisit, state } from "../state.js";
import { errorNotice } from "./notice.js";
import { $outputEditorHost } from "./output-editor.js";
import { activate, showsCode, type OutputView } from "./panel.js";
import { showButtons } from "./view-tabs.js";

const $pageView = $("pageView");

// The page that the page view shows, and its Markdown. Non-null exactly while the page view is up.
let shownPagePath: string | null = null;
let pageSource: string | null = null;
// Where the page view is scrolled to, and where to scroll it when it is shown again. It is kept up
// to date by the `scroll` listener of the page view, because reading `scrollTop` when the page has
// changed makes the browser lay out the page first.
let pageScrollTop = 0;
// Where to scroll the next page that is shown, when Back or Forward asks for it.
let nextScrollTop = 0;

const pageView: OutputView = {
  hide() {
    $pageView.hidden = true;
    $pageView.innerHTML = "";
    pageSource = null;
    shownPagePath = null;
    pageScrollTop = 0;
    $outputEditorHost.hidden = false;
  },
  copyText: () => pageSource,
};

/** What asking for another page does, once `state.pagePath` names it. */
let regenerate: () => void = () => {};

export function onPageChanged(handler: () => void): void {
  regenerate = handler;
}

/** The page on screen, as Back or Forward would return to it. */
function currentVisit(): PageVisit {
  return { path: state.pagePath, scrollTop: shownPagePath === state.pagePath ? pageScrollTop : 0 };
}

/** Ask for the page `path` of the Docs target, which the page view then shows. */
function showDocsPage(path: string): void {
  if (path === state.pagePath) return;
  state.pagesBack.push(currentVisit());
  state.pagesForward = [];
  state.pagePath = path;
  nextScrollTop = 0;
  regenerate();
}

/** Go to the last page of `from`, keeping the page on screen in `to`. */
function step(from: PageVisit[], to: PageVisit[]): void {
  const visit = from.pop();
  if (!visit) return;
  to.push(currentVisit());
  state.pagePath = visit.path;
  nextScrollTop = visit.scrollTop;
  regenerate();
}

function navButton(label: string, icon: string, click: () => void): HTMLButtonElement {
  const btn = document.createElement("button");
  btn.className = "page-nav-btn";
  btn.title = label;
  btn.setAttribute("aria-label", label);
  btn.innerHTML = `<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icon}</svg>`;
  btn.addEventListener("click", click);
  return btn;
}

// The Home, Back and Forward buttons, in the Output bar next to its title.
const $pageNav = document.createElement("span");
$pageNav.className = "page-nav";
const $pageHome = navButton("Back to the index", '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h5v-6h4v6h5V9.5"/>', () =>
  showDocsPage(INDEX_PAGE),
);
const $pageBack = navButton("Back", '<path d="M19 12H5"/><path d="m12 19-7-7 7-7"/>', () =>
  step(state.pagesBack, state.pagesForward),
);
const $pageForward = navButton("Forward", '<path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>', () =>
  step(state.pagesForward, state.pagesBack),
);
$pageNav.append($pageHome, $pageBack, $pageForward);

/** Show the page `path` of the Docs target, with the Markdown `text` and the HTML `html`. `html` is
 * null if the documentation has no such page. */
export function showPage(path: string, text: string, html: string | null): void {
  activate(pageView);
  showsCode(false);
  showButtons($pageNav);
  $pageHome.disabled = path === INDEX_PAGE;
  $pageBack.disabled = state.pagesBack.length === 0;
  $pageForward.disabled = state.pagesForward.length === 0;

  // The same page regenerated, as while typing, keeps its place. Another page starts at the top,
  // or where it was left when Back or Forward returns to it.
  if (path !== shownPagePath) {
    pageScrollTop = nextScrollTop;
    nextScrollTop = 0;
  }
  shownPagePath = path;
  pageSource = text;
  if (html === null) {
    $pageView.replaceChildren(errorNotice("This documentation has no such page", path));
  } else {
    // The HTML is safe to show as it is (see markdown.ts).
    $pageView.innerHTML = html;
  }
  $outputEditorHost.hidden = true;
  $pageView.hidden = false;
  // A hidden element loses where it was scrolled to, and a new page starts at the top.
  $pageView.scrollTop = pageScrollTop;
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
