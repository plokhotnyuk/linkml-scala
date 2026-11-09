// The documents of the input pane: the LinkML schema that every generator reads, and one of its own
// for each importer, each kept in localStorage.
import type { Format as OhiFormat } from "@neverblink/ohi";
import { EXAMPLE_SCHEMA } from "../catalog/examples.js";
import type { Importer, OhiChoice } from "../catalog/types.js";
import { activeStep, state, stepKey } from "../state.js";

// The LinkML schema lives here; each importer's own input document gets this plus a suffix.
const INPUT_STORAGE_KEY = "linkml-ui-input";

/** One document per input format: the LinkML schema every generator reads, plus one of its own per
 * importer. */
export interface InputDoc {
  text: string;
  /** The link it was loaded from, and exactly what that link served, while it still holds it. The
   * change listener compares the two to tell "this is what the link gives you" apart from "the user
   * has edited it since". */
  link: string | null;
  remote: string | null;
  /** Set alongside `link` when that link is a file on ohi.dev, which the address bar then names
   * by package instead. */
  ohi: OhiRef | null;
}

/** A file on ohi.dev, by package rather than by address. */
export interface OhiRef {
  /** `namespace/name`. */
  pkg: string;
  version: string;
  format: OhiFormat;
}

const LINKML_INPUT = "linkml";

export function inputKey(): string {
  return state.direction === "fromLinkml" ? LINKML_INPUT : stepKey(state.direction, state.importerId);
}

export function storageKey(key: string): string {
  return key === LINKML_INPUT ? INPUT_STORAGE_KEY : `${INPUT_STORAGE_KEY}:${key}`;
}

/** What the load dialog's example puts in the pane, and what a first-time visitor starts with. */
export function exampleInput(): string {
  return state.direction === "fromLinkml" ? EXAMPLE_SCHEMA : (activeStep() as Importer).example;
}

const inputDocs: Record<string, InputDoc> = {};

export function inputDoc(): InputDoc {
  const key = inputKey();
  return (inputDocs[key] ??= {
    text: localStorage.getItem(storageKey(key)) ?? exampleInput(),
    link: null,
    remote: null,
    ohi: null,
  });
}

const LINKML_OHI: OhiChoice[] = [{ format: "linkml-yaml", label: "LinkML", name: "LinkML" }];

/** The files on ohi.dev that the input pane can read. */
export function ohiChoices(): OhiChoice[] {
  return state.direction === "fromLinkml" ? LINKML_OHI : (activeStep() as Importer).ohiFormats;
}
