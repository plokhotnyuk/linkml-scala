// The statistics of the schema, as tables, with the JSON they were made from on the Code half.
import type { SchemaStats } from "../catalog/types.js";
import { $, el } from "../lib/dom.js";
import { $outputEditorHost } from "./output-editor.js";
import { activate, type OutputView } from "./panel.js";
import { TwinTabs } from "./view-tabs.js";

const $statsView = $("statsView");

// The statistics on screen. Non-null exactly while the statistics view is up.
let statsSource: SchemaStats | null = null;

const tabs = new TwinTabs("Stats", $statsView, () => showHalf(0));

const statsView: OutputView = {
  hide() {
    $statsView.hidden = true;
    $statsView.innerHTML = "";
    statsSource = null;
    tabs.clear();
    $outputEditorHost.hidden = false;
  },
  copyText: () => (statsSource === null ? null : JSON.stringify(statsSource, null, 2)),
};

/** Show the statistics as tables, behind a Stats/Code tab pair sharing the file tab bar. */
export function showStats(stats: SchemaStats): void {
  // Regenerating while typing keeps the place, as for the page view.
  const scrollTop = statsSource !== null && !$statsView.hidden ? $statsView.scrollTop : 0;
  activate(statsView);
  statsSource = stats;
  tabs.setCode(JSON.stringify(stats, null, 2), "json");
  tabs.showTabs();
  showHalf(scrollTop);
}

/** Show the half that the tabs say, with the tables scrolled to `scrollTop`. */
function showHalf(scrollTop: number): void {
  if (!tabs.showHalf() || statsSource === null) return;
  $statsView.replaceChildren(...renderStats(statsSource));
  $statsView.scrollTop = scrollTop;
}

type ElementKind = keyof SchemaStats["elements"];
type KindStats = SchemaStats["elements"][ElementKind];

const STATS_KINDS: [ElementKind, string][] = [
  ["classes", "Classes"],
  ["slots", "Slots"],
  ["attributes", "Attributes"],
  ["enums", "Enums"],
  ["permissible_values", "Permissible values"],
  ["types", "Types"],
  ["subsets", "Subsets"],
  ["functions", "Functions"],
];

const MAPPING_KINDS = ["exact", "close", "broad", "narrow", "related", "generic"] as const;

function percent(n: number, total: number): number {
  return total === 0 ? 0 : Math.round((n / total) * 100);
}

/** A count out of a total, with a bar showing the share, or `n` relative to `full` if given. */
function share(n: number, total: number, full = total): HTMLElement {
  const cell = el("td", "stats-share");
  if (total === 0) {
    cell.append(el("span", "stats-none", "–"));
    return cell;
  }
  cell.title = `${n} of ${total} (${percent(n, total)}%)`;
  const bar = el("span", "stats-bar");
  const fill = el("span", "stats-bar-fill");
  fill.style.width = `${percent(n, full)}%`;
  bar.append(fill);
  cell.append(el("span", "stats-num", String(n)), bar);
  return cell;
}

function plainCell(n: number | undefined, total: number): HTMLElement {
  return el("td", "stats-num", total === 0 || n === undefined ? "–" : String(n));
}

/** A column heading and what the column holds. */
type Column = readonly [label: string, title: string];

function table(head: Column[], rows: HTMLElement[]): HTMLElement {
  const t = el("table", "stats-table");
  const tr = el("tr");
  tr.append(el("th"));
  for (const [label, title] of head) {
    const abbr = el("abbr", undefined, label);
    abbr.title = title;
    const th = el("th", "stats-num");
    th.append(abbr);
    tr.append(th);
  }
  t.append(el("thead"), el("tbody"));
  t.tHead!.append(tr);
  t.tBodies[0]!.append(...rows);
  const scroll = el("div", "stats-table-scroll");
  scroll.append(t);
  return scroll;
}

function section(title: string, ...body: HTMLElement[]): HTMLElement {
  const s = el("section", "stats-section");
  s.append(el("h4", undefined, title), ...body);
  return s;
}

function renderStats(stats: SchemaStats): HTMLElement[] {
  const head = el("header", "stats-head");
  head.append(
    el("h3", undefined, stats.schema_name),
    el("div", "stats-muted", stats.schema_id),
  );

  const metadata = el("div", "stats-chips");
  const m = stats.metadata;
  for (const [set, label] of [
    [m.has_title, "Title"],
    [m.has_description, "Description"],
    [m.has_license, "License"],
    [m.has_version, "Version"],
  ] as const) {
    const chip = el("span", `stats-chip stats-chip--${set ? "yes" : "no"}`, `${set ? "✓" : "✗"} ${label}`);
    chip.title = set ? `The schema has a ${label.toLowerCase()}` : `The schema has no ${label.toLowerCase()}`;
    metadata.append(chip);
  }
  const imports = el(
    "div",
    "stats-muted",
    `Imports ${stats.imports.direct} schema${stats.imports.direct === 1 ? "" : "s"} directly, ` +
      `${stats.imports.transitive} in total.`,
  );

  const elementRows = STATS_KINDS.map(([key, label]) => {
    const k: KindStats = stats.elements[key];
    const row = el("tr", k.count === 0 ? "stats-empty" : undefined);
    row.append(
      el("td", undefined, label),
      el("td", "stats-num stats-count", String(k.count)),
      share(k.with_title, k.count),
      share(k.with_description, k.count),
      share(k.with_mappings, k.count),
      key === "permissible_values" ? share(k.with_meaning ?? 0, k.count) : el("td", "stats-num stats-none", ""),
      plainCell(k.deprecated, k.count),
    );
    return row;
  });

  const mapped = STATS_KINDS.filter(([key]) => stats.elements[key].with_mappings > 0);
  const mappings = mapped.length === 0
    ? el("p", "stats-muted", "No element has mappings to other vocabularies.")
    : table(
      MAPPING_KINDS.map((kind) => [
        kind[0]!.toUpperCase() + kind.slice(1),
        `How many have ${kind === "generic" ? "plain mappings" : `${kind}_mappings`}`,
      ]),
      mapped.map(([key, label]) => {
        const k = stats.elements[key];
        const row = el("tr");
        row.append(el("td", undefined, label), ...MAPPING_KINDS.map((kind) => share(k.mappings[kind], k.count)));
        return row;
      }),
    );

  const languages = Object.entries(stats.languages).map(([tag, value]) => [
    tag,
    typeof value === "number" ? value : value.count,
  ] as const);
  const strings = languages.reduce((sum, [, n]) => sum + n, 0);
  const most = Math.max(0, ...languages.map(([, n]) => n));
  const languageRows = [...languages].sort((a, b) => b[1] - a[1]).map(([tag, n]) => {
    const row = el("tr");
    const name = tag === "" ? el("td", "stats-muted", "no language tag") : el("td", "stats-code", tag);
    row.append(name, share(n, strings, most));
    return row;
  });

  return [
    head,
    section("Schema", metadata, imports),
    section(
      "Elements",
      table([
        ["Count", "How many elements of this kind are counted"],
        ["Title", "How many have a title"],
        ["Description", "How many have a description"],
        ["Mapped", "How many have a mapping of any kind to another vocabulary"],
        ["Meaning", "How many permissible values have a meaning"],
        ["Deprecated", "How many are deprecated"],
      ], elementRows),
    ),
    section("Mappings", mappings),
    section(
      `Languages · ${strings} string${strings === 1 ? "" : "s"}`,
      languageRows.length === 0
        ? el("p", "stats-muted", "No titles, descriptions or other text.")
        : table([[
          "Strings",
          "How many titles, descriptions, comments and other strings are in this language. " +
          "The bars are relative to the most common language.",
        ]], languageRows),
    ),
  ];
}
