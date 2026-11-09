// What the generators and importers have in common about their options.
import type { Option, OptionValues } from "./types.js";

/** The tree root override, for the generators that only reach it through the pruning mode.
 *
 * Outside the `tree_root` mode the field does nothing, so it is not offered. JSON Schema is the
 * exception: it has no pruning mode and applies its override unconditionally, so it declares a
 * field of its own.
 */
export const TREE_ROOT: Option = {
  key: "tree_root",
  type: "text",
  label: "Tree root",
  placeholder: "Class name (optional)",
  showIf: (o) => o.pruning_mode === "tree_root",
};

/** The value of `opt` until the user changes it. */
export function optionDefault(opt: Option): string | number | boolean {
  return opt.default ?? (opt.type === "checkbox" ? false : "");
}

/** The option values of a generator or importer as its options object, the keys being the names
 * in model/converter. Blank text fields are left out, so they take their defaults. */
export function converterOptions<T>(o: OptionValues): Partial<T> {
  return Object.fromEntries(
    Object.entries(o).filter(([, v]) => !(typeof v === "string" && v.trim() === "")),
  ) as Partial<T>;
}
