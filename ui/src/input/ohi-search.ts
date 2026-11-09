// The ohi.dev side of the load dialog: searching the catalog, and loading a file from it.
import type { CatalogClient, Format as OhiFormat, Publication, SearchHit } from "@neverblink/ohi";
import type { OhiChoice } from "../catalog/types.js";
import { $ } from "../lib/dom.js";
import { inputKey, ohiChoices, type OhiRef } from "./documents.js";
import { loadFromUrl, startDownload, type DownloadResult } from "./download.js";

// The ohi.dev SDK, bundled into dist/ohi.js by build.mjs. Imported the first time the load dialog
// opens, for the same reason as Mermaid.
const OHI_URL = "./ohi.js";

const $ohiSearch = $<HTMLInputElement>("ohiSearch");
const $ohiFormats = $("ohiFormats");
const $ohiStatus = $("ohiStatus");
const $ohiResults = $("ohiResults");
const $ohiError = $("ohiError");

/** How many hits one search fetches. They are then grouped by version, so the actual number of cards
 * will be much smaller. There is no paging: past this, a narrower query is the answer. */
const OHI_PAGE = 100;

let ohiClientPromise: Promise<CatalogClient> | null = null;

function ohiClient(): Promise<CatalogClient> {
  ohiClientPromise ??= import(OHI_URL).then(
    (m: typeof import("@neverblink/ohi")) => new m.CatalogClient(),
    (e: unknown) => {
      // Let the next search try the download again, rather than fail for good.
      ohiClientPromise = null;
      throw e;
    },
  );
  return ohiClientPromise;
}

/** The format picked on the toggle, per input document. Absent means the first one. */
const ohiPicked: Record<string, OhiFormat> = {};

function ohiChoice(): OhiChoice {
  const choices = ohiChoices();
  return choices.find((c) => c.format === ohiPicked[inputKey()]) ?? choices[0]!;
}

/** The last search that came back. A hit lists every format it has, so switching format only
 * redraws these instead of searching again. */
let ohiResult: { query: string; hits: SearchHit[]; total: number } | null = null;
let ohiSearchId = 0;
let ohiTimer: ReturnType<typeof setTimeout> | undefined;
/** Set while a picked ontology downloads, so a second click cannot race it into the editor. */
let ohiLoading = false;

export function openOhi(): void {
  renderOhiFormats();
  // The first time round it lists what is there before anything is typed.
  if (ohiResult) renderOhiResults();
  else void searchOhi();
  $ohiSearch.focus();
}

function renderOhiFormats(): void {
  const choices = ohiChoices();
  const picked = ohiChoice();
  $ohiFormats.hidden = choices.length < 2;
  $ohiFormats.replaceChildren(
    ...choices.map((c) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "dir-btn";
      btn.textContent = c.label;
      btn.dataset.format = c.format;
      btn.classList.toggle("dir-btn--active", c === picked);
      btn.setAttribute("aria-pressed", String(c === picked));
      return btn;
    }),
  );
}

$ohiFormats.addEventListener("click", (e) => {
  const btn = (e.target as HTMLElement).closest<HTMLButtonElement>(".dir-btn");
  if (!btn) return;
  ohiPicked[inputKey()] = btn.dataset.format as OhiFormat;
  renderOhiFormats();
  renderOhiResults();
});

$ohiSearch.addEventListener("input", () => {
  clearTimeout(ohiTimer);
  ohiTimer = setTimeout(() => void searchOhi(), 250);
});

$ohiSearch.addEventListener("keydown", (e) => {
  if (e.key !== "Enter") return;
  e.preventDefault();
  clearTimeout(ohiTimer);
  void searchOhi();
});

async function searchOhi(): Promise<void> {
  const query = $ohiSearch.value.trim();
  const id = ++ohiSearchId;
  $ohiStatus.textContent = "Searching…";
  $ohiError.hidden = true;
  try {
    const client = await ohiClient();
    // `*` lists everything, which is what an empty box should show. Every release, not just each
    // ontology's latest version, so the cards can offer the other versions.
    const page = await client.search({ q: query || "*", per_page: OHI_PAGE, all_releases: true });
    if (id !== ohiSearchId) return;
    ohiResult = { query, hits: page.hits, total: page.total };
    renderOhiResults();
  } catch (e) {
    if (id !== ohiSearchId) return;
    ohiResult = null;
    $ohiResults.replaceChildren();
    $ohiStatus.textContent = "";
    showOhiError(`Could not search ohi.dev. ${ohiErrorText(e)}`);
  }
}

function ohiErrorText(e: unknown): string {
  // The SDK reports a blocked or failed transfer as CONNECTION_ERROR or TIMEOUT, and anything
  // else (a script that would not download, say) is just as likely to mean being offline.
  const code = (e as { error?: { code?: string } }).error?.code;
  if (code === "HTTP_ERROR" || code === "INVALID_RESPONSE") return (e as Error).message;
  return "You may be offline.";
}

export function showOhiError(message: string): void {
  $ohiError.textContent = message;
  $ohiError.hidden = false;
}

function renderOhiResults(): void {
  if (!ohiResult) return;
  const { query, hits, total } = ohiResult;
  const groups = groupHits(hits);
  const count = groups.length;
  const what = query ? (count === 1 ? "match" : "matches") : count === 1 ? "ontology" : "ontologies";
  $ohiStatus.textContent =
    total === 0 ? `Nothing on ohi.dev matches “${query}”.`
    : hits.length < total ? `Showing the first ${count} ${what}. Type to narrow it down.`
    : `${count} ${what}.`;
  const choice = ohiChoice();
  $ohiResults.replaceChildren(...groups.map((group) => ohiGroupItem(group, choice)));
}

/** The releases of one ontology among the hits, latest first. */
interface OhiGroup {
  key: string;
  versions: SearchHit[];
}

/** One group per `namespace/name`, in the order the search ranked them. "Latest" is the highest
 * version label rather than the last one published: older releases can be indexed later. */
function groupHits(hits: SearchHit[]): OhiGroup[] {
  const groups = new Map<string, SearchHit[]>();
  for (const hit of hits) {
    const key = `${hit.namespace}/${hit.name}`;
    const versions = groups.get(key);
    if (versions) versions.push(hit);
    else groups.set(key, [hit]);
  }
  return [...groups].map(([key, versions]) => ({
    key,
    versions: versions.sort((a, b) => b.version.localeCompare(a.version, "en", { numeric: true })),
  }));
}

/** The version picked on each ontology's dropdown, by `namespace/name`. Absent means the latest. */
const ohiVersionPicked: Record<string, string> = {};

const EXTERNAL_LINK_ICON =
  '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" ' +
  'stroke-linejoin="round" aria-hidden="true"><path d="M15 3h6v6"/><path d="M10 14 21 3"/>' +
  '<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/></svg>';

function ohiGroupItem(group: OhiGroup, choice: OhiChoice): HTMLLIElement {
  // The card is described by the latest release, and loads the one picked on the dropdown.
  const latest = group.versions[0]!;
  const hit = group.versions.find((v) => v.version === ohiVersionPicked[group.key]) ?? latest;
  const has = hit.formats.includes(choice.format);
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "ohi-hit";
  const line = (cls: string, text: string): void => {
    const el = document.createElement("span");
    el.className = cls;
    el.textContent = text;
    btn.append(el);
  };
  line("ohi-hit-title", latest.title);
  line("ohi-hit-meta", group.versions.length > 1 ? group.key : `${group.key} · ${latest.version}`);
  if (latest.description) line("ohi-hit-desc", latest.description);
  if (has) {
    btn.addEventListener("click", () => void pickOhi(hit, choice, btn));
  } else {
    // aria-disabled rather than disabled: the button stays focusable, so the note saying why it
    // is greyed out can still be reached and read out.
    btn.setAttribute("aria-disabled", "true");
    btn.classList.add("ohi-hit--missing");
    line("ohi-hit-note", `No ${choice.name} file on ohi.dev for ${hit.version}.`);
  }
  const li = document.createElement("li");
  li.className = "ohi-item";
  li.append(btn);
  // Beside the button rather than in it: a select or a link inside a button is not valid HTML.
  if (group.versions.length > 1) {
    li.classList.add("ohi-item--versions");
    const select = document.createElement("select");
    select.className = "ohi-version";
    select.setAttribute("aria-label", `Version of ${latest.title}`);
    select.append(
      ...group.versions.map((v, i) => new Option(i === 0 ? `${v.version} (latest)` : v.version, v.version)),
    );
    select.value = hit.version;
    select.addEventListener("change", () => {
      ohiVersionPicked[group.key] = select.value;
      const next = ohiGroupItem(group, choice);
      li.replaceWith(next);
      next.querySelector<HTMLSelectElement>(".ohi-version")!.focus();
    });
    li.append(select);
  }
  const view = document.createElement("a");
  view.className = "ohi-view icon-btn";
  view.href = `https://ohi.dev/o/${encodeURIComponent(latest.namespace)}/${encodeURIComponent(latest.name)}`;
  view.target = "_blank";
  view.rel = "noopener";
  view.title = "View on ohi.dev";
  view.setAttribute("aria-label", `View ${latest.title} on ohi.dev (opens in a new tab)`);
  view.innerHTML = EXTERNAL_LINK_ICON;
  li.append(view);
  return li;
}

/** Download one format of an ohi.dev publication into the input pane. */
async function loadOhiFile(
  baseUrl: string,
  ref: OhiRef,
  title: string,
  current: () => boolean = startDownload(),
): Promise<DownloadResult> {
  try {
    return await loadOhiPublication(await (await ohiClient()).inspect(baseUrl), ref, current);
  } catch (e) {
    return { ok: false, error: `Could not load ${title}. ${ohiErrorText(e)}` };
  }
}

/** Download one format of a fetched publication into the input pane. */
async function loadOhiPublication(publication: Publication, ref: OhiRef, current: () => boolean): Promise<DownloadResult> {
  const files = publication.artifacts.filter((a) => a.format === ref.format);
  // Prefer the file as its publisher wrote it over one ohi.dev generated from it.
  const file = files.find((a) => a.origin === "UPSTREAM") ?? files[0];
  const name = ohiChoices().find((c) => c.format === ref.format)?.name ?? ref.format;
  if (!file) return { ok: false, error: `${publication.title} has no ${name} file on ohi.dev.` };
  return loadFromUrl(file.url, ref, current);
}

/** Load a package named in an incoming `?ohi=` link, `namespace/name@version`, or
 * `namespace/name` for its latest version. */
export async function loadOhiPackage(value: string, format: OhiFormat): Promise<DownloadResult> {
  const current = startDownload();
  const invalid = { ok: false, error: `“${value}” does not name an ohi.dev package. It should look like w3c/prov-o@2013.` } as const;
  // inspect would fetch a URL, and the address bar would then name a foreign publication as an
  // ohi.dev package. Links belong in `?url=`.
  if (/^https?:\/\//i.test(value)) return invalid;
  let publication: Publication;
  try {
    publication = await (await ohiClient()).inspect(value);
  } catch (e) {
    const error = (e as { error?: { code?: string; operation?: string; status?: number } }).error;
    if (error?.code === "INVALID_INPUT") return invalid;
    // A 404 of the latest search means a broken catalog, not a missing package.
    if (error?.operation === "INSPECT" && error.status === 404) {
      return { ok: false, error: `There is no ${value} on ohi.dev.` };
    }
    return { ok: false, error: `Could not look up ${value} on ohi.dev. ${ohiErrorText(e)}` };
  }
  // The version comes from the publication, so `?ohi=w3c/dcat` becomes `?ohi=w3c/dcat@3`.
  const ref = { pkg: `${publication.namespace}/${publication.name}`, version: publication.version, format };
  return loadOhiPublication(publication, ref, current);
}

/** Download the picked ontology into the input pane. It goes through [[loadFromUrl]] like a pasted
 * link, so the address bar and Share point at the file on ohi.dev afterwards. */
async function pickOhi(hit: SearchHit, choice: OhiChoice, btn: HTMLButtonElement): Promise<void> {
  if (ohiLoading) return;
  ohiLoading = true;
  $ohiResults.classList.add("ohi-results--busy");
  btn.classList.add("ohi-hit--loading");
  $ohiError.hidden = true;
  $ohiStatus.textContent = `Loading ${hit.title}…`;
  try {
    const ref = { pkg: `${hit.namespace}/${hit.name}`, version: hit.version, format: choice.format };
    const res = await loadOhiFile(hit.base_url, ref, hit.title);
    if (res.ok) $<HTMLDialogElement>("loadDialog").close();
    else if (res.error !== null) showOhiError(res.error);
  } finally {
    ohiLoading = false;
    $ohiResults.classList.remove("ohi-results--busy");
    btn.classList.remove("ohi-hit--loading");
    renderOhiResults();
  }
}

/** Pick the format of the files on ohi.dev that the input pane loads. */
export function pickOhiFormat(format: OhiFormat): void {
  ohiPicked[inputKey()] = format;
}

export function hideOhiError(): void {
  $ohiError.hidden = true;
}
