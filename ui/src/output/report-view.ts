// The lint report: the issues that the schema has, most severe first.
import type { IssueLocation, SchemaIssue, SchemaValidationReport } from "../catalog/types.js";
import { $ } from "../lib/dom.js";
import { $outputEditorHost } from "./output-editor.js";
import { activate, type OutputView } from "./panel.js";
import { hideTabs } from "./view-tabs.js";

const $reportView = $("reportView");

// The report is shown as elements rather than in the output editor, so a plain-text rendition of it
// is kept for Copy. Non-null exactly while the report is on screen.
let reportText: string | null = null;

const reportView: OutputView = {
  hide() {
    $reportView.hidden = true;
    $reportView.innerHTML = "";
    reportText = null;
    $outputEditorHost.hidden = false;
  },
  copyText: () => reportText,
};

/** Most severe first, so the report reads top-down in order of urgency. */
const SEVERITY_ORDER = ["FATAL", "ERROR", "WARNING"];

function severityRank(issue: SchemaIssue): number {
  const i = SEVERITY_ORDER.indexOf(String(issue.severity ?? "").toUpperCase());
  return i === -1 ? SEVERITY_ORDER.length : i;
}

/** e.g. "1 error, 2 warnings" - counts per severity, most severe first, only non-zero. */
function severitySummary(issues: SchemaIssue[]): string {
  const parts: string[] = [];
  for (const sev of SEVERITY_ORDER) {
    const n = issues.filter((i) => String(i.severity ?? "").toUpperCase() === sev).length;
    if (n === 0) continue;
    const noun = sev === "FATAL" ? "fatal error" : sev.toLowerCase();
    parts.push(`${n} ${noun}${n === 1 ? "" : "s"}`);
  }
  const unknown = issues.length - parts.reduce((a, p) => a + Number(p.split(" ")[0]), 0);
  if (unknown > 0) parts.push(`${unknown} other`);
  return parts.join(", ");
}

/** Where an issue was found, as a single compact line. */
function locationLabel(location?: IssueLocation): string {
  if (!location) return "";
  const bits: string[] = [];
  if (location.json_pointer) bits.push(location.json_pointer);
  const region = location.code_region;
  if (region?.start_line) {
    bits.push(`line ${region.start_line}${region.start_column ? `:${region.start_column}` : ""}`);
  }
  if (!bits.length && location.schema_id) bits.push(location.schema_id);
  return bits.join(" · ");
}

export function showReport(report: SchemaValidationReport): void {
  activate(reportView);
  hideTabs();
  $outputEditorHost.hidden = true;
  $reportView.hidden = false;
  $reportView.innerHTML = "";

  const issues = [...(report.issues ?? [])].sort((a, b) => severityRank(a) - severityRank(b));

  const summary = document.createElement("div");
  summary.className = "report-summary" +
    (issues.length === 0 ? " report-summary--ok" : ` report-summary--${severityClass(issues[0]!)}`);
  summary.textContent = issues.length === 0
    ? "Schema is valid."
    : severitySummary(issues);
  $reportView.appendChild(summary);

  const textLines: string[] = [summary.textContent];

  for (const issue of issues) {
    const item = document.createElement("article");
    item.className = `report-item report-item--${severityClass(issue)}`;

    const head = document.createElement("div");
    head.className = "report-item-head";

    const badge = document.createElement("span");
    badge.className = "report-badge";
    badge.textContent = String(issue.severity ?? "ISSUE").toUpperCase();
    head.appendChild(badge);

    const message = document.createElement("span");
    message.className = "report-message";
    // With messages turned off there is nothing human-readable, so fall back to the raw slots.
    const messageText = issue.message ?? rawSummary(issue);
    // Issues with a `code_region` quote the offending source line with a `^` under the column after
    // the first line, so that part goes into a monospaced block that keeps its whitespace.
    const newline = issue.location?.code_region ? messageText.indexOf("\n") : -1;
    message.textContent = newline < 0 ? messageText : messageText.slice(0, newline);
    head.appendChild(message);
    item.appendChild(head);
    if (newline >= 0) {
      const snippet = document.createElement("pre");
      snippet.className = "report-snippet";
      snippet.textContent = messageText.slice(newline + 1);
      item.appendChild(snippet);
    }

    const issueLines = [`${badge.textContent} ${messageText}`];

    const where = locationLabel(issue.location);
    if (where) {
      const loc = document.createElement("div");
      loc.className = "report-location";
      loc.textContent = where;
      item.appendChild(loc);
      issueLines.push(`  at ${where}`);
    }

    if (issue.details && !restatesMessage(issue.details, issue.message)) {
      const details = document.createElement("p");
      details.className = "report-details";
      details.textContent = issue.details;
      item.appendChild(details);
      issueLines.push(`  ${issue.details}`);
    }

    $reportView.appendChild(item);
    textLines.push(issueLines.join("\n"));
  }

  reportText = textLines.join("\n\n");
}

function severityClass(issue: SchemaIssue): string {
  const sev = String(issue.severity ?? "").toUpperCase();
  return SEVERITY_ORDER.includes(sev) ? sev.toLowerCase() : "other";
}

/** Whether `details` says nothing beyond `message`: either the same text, or the same text after a
 * lead-in that differs only by naming the source (e.g. "Cannot parse schema 'x.yaml': ..." against
 * "Cannot parse schema: ...").
 */
function restatesMessage(details: string, message: string | undefined): boolean {
  if (message === undefined) return false;
  if (details === message) return true;
  const d = details.indexOf(": ");
  const m = message.indexOf(": ");
  return d >= 0 && m >= 0 && details.slice(d + 2) === message.slice(m + 2);
}

/** Describe an issue that carries no `message`, from whatever structured slots it does have.
 *
 * Multivalued slots arrive as arrays, so join them rather than dropping them. Nested objects (only
 * `location`, which is shown separately) are skipped.
 */
function rawSummary(issue: SchemaIssue): string {
  const slots = Object.entries(issue)
    .filter(([k]) => k !== "severity" && k !== "location")
    .flatMap(([k, v]) => {
      if (Array.isArray(v)) return [`${k}: ${v.map(String).join(", ")}`];
      if (v !== null && typeof v === "object") return [];
      return [`${k}: ${String(v)}`];
    });
  return slots.length ? slots.join(", ") : "(no message)";
}
