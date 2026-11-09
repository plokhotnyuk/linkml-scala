// Downloading a document into the input pane.
import { scheduleGenerate } from "../generation.js";
import { inputDoc, inputKey, type OhiRef } from "./documents.js";
import { setLinkParams } from "./links.js";
import { setInput } from "./pane.js";

/** Turns a link to a file's web page into a link to the file itself. Copying what is in the
 * address bar is the obvious thing to do, and on GitHub or GitLab that address serves HTML. */
function rawFileUrl(u: URL): URL {
  const parts = u.pathname.split("/").filter(Boolean);
  if (u.hostname === "github.com" && parts[2] === "blob" && parts.length > 3) {
    // /owner/repo/blob/ref/path -> raw.githubusercontent.com/owner/repo/ref/path
    return new URL(`https://raw.githubusercontent.com/${parts[0]}/${parts[1]}/${parts.slice(3).join("/")}`);
  }
  // Matched on the path rather than the host, so that self-hosted GitLab instances work too.
  if (u.pathname.includes("/-/blob/")) {
    const raw = new URL(u.href);
    raw.pathname = u.pathname.replace("/-/blob/", "/-/raw/");
    raw.search = "";
    return raw;
  }
  return u;
}

export type LoadResult = { ok: true } | { ok: false; error: string };
/** What a download returns when something newer got there first: nothing landed, and there is
 * nothing to report either. */
export const SUPERSEDED = { ok: false, error: null } as const;
export type DownloadResult = LoadResult | typeof SUPERSEDED;

/** Counts downloads, so that one finishing late can tell a newer one has started. */
let downloads = 0;

/** Note what a download is about to replace, before it starts. The editor stays usable while it
 * runs, so by the time it lands the user may have started another, switched to another pane or
 * typed something - and any of those beats a file they may have forgotten they asked for. */
export function startDownload(): () => boolean {
  const id = ++downloads;
  const key = inputKey();
  const text = inputDoc().text;
  return () => id === downloads && inputKey() === key && inputDoc().text === text;
}

/** Downloads a schema and puts it in the input pane. The link, as pasted, goes into the address
 * bar rather than the schema itself: it stays short enough to paste anywhere.
 *
 * `current` is for callers with lookups of their own to do first, which count as part of the
 * download. */
export async function loadFromUrl(
  link: string,
  ohi: OhiRef | null = null,
  current: () => boolean = startDownload(),
): Promise<DownloadResult> {
  let target: URL;
  try {
    target = rawFileUrl(new URL(link));
  } catch {
    return { ok: false, error: "That is not a URL. It has to start with https://" };
  }
  if (target.protocol !== "https:" && target.protocol !== "http:") {
    return { ok: false, error: "Only http and https links can be loaded." };
  }
  // The deployed playground is https, and a browser refuses to fetch http from an https page
  // (mixed content). That refusal looks exactly like a CORS block, so name the real reason.
  if (target.protocol === "http:" && location.protocol === "https:") {
    return { ok: false, error: "This page is served over HTTPS, so the browser will not load an http:// link. Try https:// instead." };
  }

  let text: string;
  try {
    const res = await fetch(target.href);
    if (!res.ok) return { ok: false, error: `The server answered ${res.status} ${res.statusText}.` };
    text = await res.text();
  } catch {
    // A cross-origin block and being offline both surface as the same detail-free TypeError.
    return {
      ok: false,
      error: "Could not fetch that link. The server may not allow being read from other sites (CORS), or you may be offline.",
    };
  }
  if (/^\s*<(!doctype|html)/i.test(text)) {
    return { ok: false, error: "That link returned a web page, not a schema. Link straight to the raw file." };
  }
  if (!current()) return SUPERSEDED;

  // Set before the change lands, so the listener sees an unedited document either way.
  const doc = inputDoc();
  doc.remote = text;
  doc.link = link;
  doc.ohi = ohi;
  setInput(text);
  setLinkParams(doc);
  scheduleGenerate(0);
  return { ok: true };
}
