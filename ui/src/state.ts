// What the playground is set to, which several of its parts read: the direction, the generator and
// the importer picked in each, their option values, and the page of the Docs target.
import { IMPORTERS, importerById } from "./catalog/importers.js";
import { optionDefault } from "./catalog/options.js";
import { DEFAULT_TARGET_ID, TARGETS, targetById } from "./catalog/targets.js";
import type { Direction, OptionValues, Step } from "./catalog/types.js";
import type { OutputLang } from "./lib/editor.js";

export const DIRECTIONS = ["fromLinkml", "toLinkml"] as const;

/** The page of the Docs target that the page view starts at. */
export const INDEX_PAGE = "index.md";

export const state = {
  /** Which way the conversion runs: `fromLinkml` picks a generator, `toLinkml` an importer. */
  direction: "fromLinkml" as Direction,
  targetId: DEFAULT_TARGET_ID,
  importerId: IMPORTERS[0]!.id,
  /** The page of the Docs target to show, such as `index.md` or `classes/person.md`. Kept while the
   * schema is edited, and back to the index when another schema is put in the input. */
  pagePath: INDEX_PAGE,
};

export function steps(dir: Direction): Step[] {
  return dir === "fromLinkml" ? TARGETS : IMPORTERS;
}

/** Generators and importers each have their own ids and the two sets overlap - "ossie" is both - so
 * anything stored per step is keyed by the direction as well. */
export function stepKey(dir: Direction, id: string): string {
  return `${dir}:${id}`;
}

export function activeStep(): Step {
  return state.direction === "fromLinkml"
    ? TARGETS.find((t) => t.id === state.targetId)!
    : IMPORTERS.find((i) => i.id === state.importerId)!;
}

export function activeKey(): string {
  return stepKey(state.direction, activeStep().id);
}

export function stepById(dir: Direction, id: string): Step | undefined {
  return dir === "fromLinkml" ? targetById(id) : importerById(id);
}

/** The option values of every generator and importer, by [[stepKey]]. */
export const optionValues: Record<string, OptionValues> = Object.fromEntries(
  DIRECTIONS.flatMap((dir) =>
    steps(dir).map((s) => [
      stepKey(dir, s.id),
      Object.fromEntries(s.options.map((o) => [o.key, optionDefault(o)])),
    ]),
  ),
);

/** The language of what `step` writes, with its options as they are now. */
export function stepLang(step: Step, dir: Direction = state.direction): OutputLang {
  return typeof step.lang === "function" ? step.lang(optionValues[stepKey(dir, step.id)]!) : step.lang;
}
