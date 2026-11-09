// Share links: the playground's state packed into the address, and the dialog that offers one.
import { optionDefault } from "../catalog/options.js";
import type { OptionValues, Step } from "../catalog/types.js";
import { scheduleGenerate } from "../generation.js";
import { $, flashDone, wireDialog } from "../lib/dom.js";
import { activeKey, activeStep, optionValues, state } from "../state.js";
import { inputDoc } from "./documents.js";
import { linkParams, readable } from "./links.js";
import { inputText } from "./pane.js";

// The playground's state, deflated and base64url-encoded, behind this in the fragment. A fragment
// rather than a query parameter: the browser never sends it, so the schema still never leaves the
// device, and it is not subject to the URL length a server or CDN is willing to accept.
const SHARE_PREFIX = "s=";
// Bump only when making BREAKING changes
const SHARE_VERSION = 1;
/** Past this a link still works in a browser, but chat clients and mail wrap or truncate it. */
const SHARE_LONG = 8_000;
/** Past this it approaches what Safari accepts at all (~80 000) and is unusable most other places. */
const SHARE_HUGE = 32_000;
/** Cap on what a link is allowed to decompress to. Nothing anyone would open in a playground comes
 * near it, and without one a hand-made fragment could inflate a thousandfold and wedge the tab. */
const SHARE_MAX_CHARS = 2_000_000;
/** Marks the one failure [[unpack]] raises deliberately, to tell it from a corrupt payload. */
const TOO_LARGE = "share-payload-too-large";
/** Baseline since May 2023, so this is about old browsers rather than exotic ones. */
const CAN_SHARE = typeof CompressionStream !== "undefined" && typeof DecompressionStream !== "undefined";

/** What a share link carries. Short keys mostly for legibility in a hand-decoded payload - deflate
 * makes their length nearly free. */
export interface SharedState {
  v: number;
  /** The input text, when the editor holds something no link would serve. */
  s?: string;
  /** The link it came from instead, when the editor still holds exactly what that link serves. */
  u?: string;
  /** Active generator id. Present exactly when the link was made in the "from LinkML" direction. */
  t?: string;
  /** Active importer id. Present exactly when the link was made in the "to LinkML" direction. */
  i?: string;
  /** Only the options that differ from their default. */
  o?: OptionValues;
}

// deflate-raw rather than gzip: the same compression without the header and checksum. It runs at
// about 3.5-4x on schema-sized YAML, so a 100 KB schema comes out as a ~28 000 character link.
async function pack(text: string): Promise<string> {
  const stream = new Blob([new TextEncoder().encode(text)])
    .stream()
    .pipeThrough(new CompressionStream("deflate-raw"));
  const bytes = new Uint8Array(await new Response(stream).arrayBuffer());
  // A byte at a time rather than `String.fromCharCode(...bytes)`, which blows the argument limit
  // somewhere around a 100 KB schema.
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function unpack(encoded: string): Promise<string> {
  // `atob` is specified as forgiving-base64, so the stripped padding does not need putting back.
  const binary = atob(encoded.replace(/-/g, "+").replace(/_/g, "/"));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  // Read it chunk by chunk rather than with `Response.text()`, so [[SHARE_MAX_CHARS]] can stop an
  // oversized payload part way instead of after the whole thing is already in memory.
  const reader = (stream as ReadableStream<Uint8Array>).getReader();
  const decoder = new TextDecoder();
  let text = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    text += decoder.decode(value, { stream: true });
    if (text.length > SHARE_MAX_CHARS) {
      await reader.cancel();
      throw new Error(TOO_LARGE);
    }
  }
  return text + decoder.decode();
}

function changedOptions(): OptionValues | undefined {
  const values = optionValues[activeKey()]!;
  const changed = Object.fromEntries(
    activeStep().options.filter((o) => values[o.key] !== optionDefault(o)).map((o) => [o.key, values[o.key]!]),
  );
  return Object.keys(changed).length ? changed : undefined;
}

/** Filter options that arrived in a link down to ones this build can honour: an unknown key, or a
 * select value that is not on offer, would leave the widget showing nothing while still being what
 * the generator is handed. */
export function knownOptions(step: Step, shared: OptionValues | undefined): OptionValues {
  const kept: OptionValues = {};
  for (const opt of step.options) {
    const value = shared?.[opt.key];
    if (value === undefined) continue;
    if (opt.type === "select" && !opt.choices?.includes(String(value))) continue;
    kept[opt.key] = value;
  }
  return kept;
}

function currentState(): SharedState {
  const step = activeStep();
  const text = inputText();
  const doc = inputDoc();
  const shared: SharedState = { v: SHARE_VERSION };
  // A link is far shorter than the schema, and stays current if the file behind it changes - but
  // only while the editor still holds exactly what it serves.
  if (doc.link !== null && text === doc.remote) shared.u = doc.link;
  else shared.s = text;
  if (state.direction === "toLinkml") shared.i = step.id;
  else shared.t = step.id;
  const options = changedOptions();
  if (options) shared.o = options;
  return shared;
}

/** A share link, plus whether it is the readable `?url=` kind - which the hint text has to match. */
async function shareUrl(): Promise<{ href: string; plain: boolean }> {
  const shared = currentState();
  const here = new URL(location.href);
  here.search = "";
  here.hash = "";
  // With nothing but a link and a step to pass on, the query parameters say the same thing in about
  // the same space and a recipient can see where it points, so there is no reason to bury it in an
  // opaque fragment.
  if (shared.u !== undefined && shared.o === undefined) {
    for (const [k, v] of linkParams(inputDoc())) here.searchParams.set(k, v);
    return { href: readable(here), plain: true };
  }
  here.hash = SHARE_PREFIX + (await pack(JSON.stringify(shared)));
  return { href: here.href, plain: false };
}

export function shareFragment(): string | null {
  const hash = location.hash.slice(1);
  return hash.startsWith(SHARE_PREFIX) ? hash.slice(SHARE_PREFIX.length) : null;
}

const $share = $<HTMLButtonElement>("share");
const $shareDialog = $<HTMLDialogElement>("shareDialog");
const $shareTitle = $("shareTitle");
const $shareBody = $("shareBody");
const $shareLink = $<HTMLInputElement>("shareLink");
const $shareSize = $("shareSize");
const $shareHint = $("shareHint");
const $shareError = $("shareError");
const $shareCopy = $<HTMLButtonElement>("shareCopy");

// Nothing here works without Compression Streams, so do not offer it. The read path still explains
// itself, because a link can arrive from someone whose browser could make one.
$share.hidden = !CAN_SHARE;

/** The dialog doubles as the place a broken incoming link is reported, where there is no link to
 * offer and nothing to copy - so everything but the error line comes off, heading included. */
function showShareBody(visible: boolean): void {
  $shareBody.hidden = !visible;
  $shareCopy.hidden = !visible;
  $shareTitle.textContent = visible ? "Share this playground" : "This share link did not work";
}

function showShareError(message: string): void {
  $shareError.textContent = message;
  $shareError.hidden = false;
}

function showShareSize(length: number): void {
  const count = `${length.toLocaleString("en-US")} characters`;
  $shareSize.classList.toggle("share-size--warn", length > SHARE_LONG);
  if (length <= SHARE_LONG) {
    $shareSize.textContent = `${count}.`;
  } else if (length <= SHARE_HUGE) {
    $shareSize.textContent = `${count} – long. Some chat apps and mail clients cut links this long.`;
  } else {
    $shareSize.textContent =
      `${count} – very long. Most places will cut a link this size. Consider putting the schema ` +
      "online, loading it from that URL and sharing again.";
  }
}

$share.addEventListener("click", async () => {
  $shareError.hidden = true;
  showShareBody(true);
  $shareLink.value = "";
  $shareSize.textContent = "";
  $shareSize.classList.remove("share-size--warn");
  $shareDialog.showModal();
  try {
    const { href, plain } = await shareUrl();
    $shareLink.value = href;
    showShareSize(href.length);
    $shareHint.textContent = "Your data is not sent to the server nor stored anywhere.";
    $shareLink.select();
  } catch {
    showShareError("Could not build a share link for this schema.");
  }
});

$shareCopy.addEventListener("click", async () => {
  if (!$shareLink.value) return;
  try {
    await navigator.clipboard.writeText($shareLink.value);
    flashDone($shareCopy, "Copied!");
  } catch {
    // Clipboard permission denied - the link is already selected, so leave it to be copied by hand.
    $shareLink.select();
  }
});

wireDialog($shareDialog, ".share-done");

/** The state that a share link carries, or why it cannot be read. */
async function readShareLink(encoded: string): Promise<{ ok: true; state: SharedState } | { ok: false; error: string }> {
  if (!CAN_SHARE) {
    return { ok: false, error: "This browser cannot read share links: it has no Compression Streams support." };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(await unpack(encoded));
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error && err.message === TOO_LARGE
        ? "This share link unpacks to far more text than the playground will open."
        : "This share link is damaged. It may have been cut short on the way here.",
    };
  }
  // Anything at all can come out of a fragment, including `null`, which would throw on the version
  // check rather than be reported.
  if (typeof parsed !== "object" || parsed === null || (parsed as SharedState).v !== SHARE_VERSION) {
    return { ok: false, error: "This link was made by a different version of the playground and cannot be read." };
  }
  return { ok: true, state: parsed as SharedState };
}

/** Put the state of an incoming share link on screen with `apply`, and on failure say so in the
 * dialog it came from. */
export async function openShareLink(encoded: string, apply: (shared: SharedState) => void): Promise<void> {
  const res = await readShareLink(encoded);
  if (res.ok) {
    apply(res.state);
    return;
  }
  // Nothing else on screen would explain why the link did not bring anything with it.
  showShareError(res.error);
  showShareBody(false);
  $shareDialog.showModal();
  scheduleGenerate(0);
}
