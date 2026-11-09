// The generators the playground can run, which turn a LinkML schema into something else, shared by
// the UI and the worker. The importers, which go the other way, are in importers.ts.
//
// The UI thread uses everything here *except* `call` - labels, option widgets and the output
// language. `call` runs only in the worker, which is the sole owner of the LinkML API and of the
// `SchemaView` handles it hands out (those are live Scala.js objects and cannot cross a
// postMessage boundary). Keeping both halves in one file means ids and option keys have a
// single definition that both sides are type-checked against.
import type { Target } from "./types.js";
import { converterOptions, TREE_ROOT } from "./options.js";

/** The generator the playground opens with. */
export const DEFAULT_TARGET_ID = "docs";

/** Sorted by label. */
export const TARGETS: Target[] = [
  {
    id: "ossie",
    label: "Apache Ossie",
    docs: "generators/ossie/",
    lang: (o) => (o.format === "json" ? "json" : "yaml"),
    options: [
      // Defaults to `skip` for the same reason as Frictionless: a root schema may only import its
      // classes, and an ontology with no concepts at all is not valid Ossie.
      { key: "pruning_mode", type: "select", label: "Pruning", choices: ["tree_root", "schema", "skip"], default: "skip" },
      TREE_ROOT,
      { key: "format", type: "select", label: "Format", choices: ["yaml", "json"], default: "yaml" },
    ],
    call: (_, v, o) => v.ossie(converterOptions(o)),
  },
  {
    id: "linkml",
    label: "Derived LinkML",
    docs: "generators/linkml/",
    lang: (o) => (o.format === "json" ? "json" : "yaml"),
    options: [
      { key: "pruning_mode", type: "select", label: "Pruning", choices: ["tree_root", "schema", "skip"], default: "tree_root" },
      { key: "skip_class_derivation", type: "checkbox", label: "Skip derivation" },
      TREE_ROOT,
      { key: "full_uris", type: "checkbox", label: "Full URIs", title: "Write URIs in full, instead of as CURIEs" },
      { key: "format", type: "select", label: "Format", choices: ["yaml", "json"], default: "yaml" },
    ],
    call: (_, v, o) => v.linkml(converterOptions(o)),
  },
  {
    id: "docs",
    label: "Documentation",
    docs: "generators/docs/",
    lang: "text",
    view: "page",
    options: [
      // Defaults to `schema`, like the ER diagram: documentation is for the whole model.
      { key: "pruning_mode", type: "select", label: "Pruning", choices: ["tree_root", "schema", "skip"], default: "schema" },
      TREE_ROOT,
      { key: "metadata_language", type: "text", label: "Language", placeholder: "en", title: "Language of titles and descriptions given in more than one language" },
    ],
    // One page at a time, the one the page view shows: all pages of a large schema at once take
    // seconds to write and far longer for the browser to show.
    call: (_, v, o, page) => v.docs({ ...converterOptions(o), only_file: page }),
  },
  {
    id: "erDiagram",
    label: "ER diagram",
    docs: "generators/er-diagram/",
    lang: "text",
    view: "diagram",
    options: [
      // Defaults to `schema` rather than `tree_root`: a diagram is for looking at the whole model,
      // and pruning to the tree root hides every class it cannot reach.
      { key: "pruning_mode", type: "select", label: "Pruning", choices: ["tree_root", "schema", "skip"], default: "schema" },
      TREE_ROOT,
      {
        key: "optional_marker",
        type: "checkbox",
        label: "Optional ?",
        title: "Mark optional attributes with a trailing '?' (needs Mermaid 11.16+)",
        default: true,
      },
    ],
    call: (_, v, o) => v.erDiagram(converterOptions(o)),
  },
  {
    id: "frictionless",
    label: "Frictionless",
    docs: "generators/frictionless/",
    lang: "json",
    options: [
      // Defaults to `skip`: narrower modes can leave the package empty, because a root schema may
      // only import its classes rather than define any.
      { key: "pruning_mode", type: "select", label: "Pruning", choices: ["tree_root", "schema", "skip"], default: "skip" },
      TREE_ROOT,
      {
        key: "skip_classes_without_identifier",
        type: "checkbox",
        label: "Identified only",
        title: "Skip classes that have no identifier slot",
      },
    ],
    call: (_, v, o) => v.frictionless(converterOptions(o)),
  },
  {
    id: "graphql",
    label: "GraphQL",
    docs: "generators/graphql/",
    lang: "graphql",
    options: [
      { key: "pruning_mode", type: "select", label: "Pruning", choices: ["tree_root", "schema", "skip"], default: "tree_root" },
      TREE_ROOT,
    ],
    call: (_, v, o) => v.graphql(converterOptions(o)),
  },
  {
    id: "jsonSchema",
    label: "JSON Schema",
    docs: "generators/json-schema/",
    lang: "json",
    options: [
      { key: "open", type: "checkbox", label: "Open", title: "Allow additionalProperties" },
      { key: "tree_root", type: "text", label: "Tree root", placeholder: "Class name (optional)" },
    ],
    call: (_, v, o) => v.jsonSchema(converterOptions(o)),
  },
  {
    id: "translation",
    label: "Key translations",
    docs: "generators/translation/",
    lang: "json",
    options: [
      { key: "target", "type": "select", label: "Target name form", choices: ["base", "uri", "scala", "graphql", "frictionless", "ossie", "erdiagram", "json", "typescript", "pydantic", "java", "docs"], default: "base" },
      {
        key: "derived_attributes",
        type: "checkbox",
        label: "Derived attributes",
        title: "Also list inherited slots, mixin slots and slots from the class's slots list",
      },
    ],
    call: (_, v, o) => v.translation(converterOptions(o)),
  },
  {
    id: "lint",
    label: "Lint",
    docs: "validation/",
    lang: "json",
    view: "report",
    options: [
      { key: "inferMessages", type: "checkbox", label: "Messages", default: true },
    ],
    call: (api, v, o) => api.lint(v, !!o.inferMessages),
  },
  {
    id: "stats",
    label: "Statistics",
    docs: "generators/stats/",
    lang: "json",
    view: "stats",
    options: [
      { key: "pruning_mode", type: "select", label: "Pruning", choices: ["tree_root", "schema", "skip"], default: "schema" },
      TREE_ROOT,
    ],
    call: (_, v, o) => v.stats(converterOptions(o)),
  },
  {
    id: "owl",
    label: "OWL 2",
    docs: "generators/owl/",
    lang: "turtle",
    options: [
      { key: "only_root_schema", type: "checkbox", label: "Root schema only" },
      { key: "metadata_profile", type: "select", label: "Descriptions", choices: ["rdfs", "linkml"], default: "rdfs" },
      { key: "permissible_values", type: "select", label: "Permissible values", choices: ["individual", "class"], default: "individual" },
      { key: "format", type: "select", label: "Format", choices: ["ttl", "nt"], default: "ttl" },
    ],
    call: (_, v, o) => v.owl(converterOptions(o)),
  },
  {
    id: "pydantic",
    label: "Pydantic",
    docs: "generators/pydantic/",
    lang: "python",
    options: [
      { key: "pruning_mode", type: "select", label: "Pruning", choices: ["tree_root", "schema", "skip"], default: "skip" },
      TREE_ROOT,
      { key: "include_null", type: "checkbox", label: "Nulls", title: "Keep nulls when dumping" },
      { key: "open", type: "checkbox", label: "Open", title: "Allow additional properties" },
    ],
    call: (_, v, o) => v.pydantic(converterOptions(o)),
  },
  {
    id: "java",
    label: "Java",
    docs: "generators/java/",
    lang: "java",
    options: [
      { key: "package", type: "text", label: "Package", title: "Without it, the schema's name" },
      { key: "pruning_mode", type: "select", label: "Pruning", choices: ["tree_root", "schema", "skip"], default: "skip" },
      TREE_ROOT,
      { key: "open", type: "checkbox", label: "Open", title: "Allow additional properties" },
      { key: "strict", type: "checkbox", label: "Strict", title: "Check the JSON types and the constraints of the schema while loading" },
    ],
    call: (_, v, o) => v.java(converterOptions(o)),
  },
  {
    id: "rdfs",
    label: "RDFS",
    docs: "generators/rdfs/",
    lang: "turtle",
    options: [
      { key: "only_classes_from_root_schema", type: "checkbox", label: "Root schema only" },
      { key: "format", type: "select", label: "Format", choices: ["ttl", "nt"], default: "ttl" },
    ],
    call: (_, v, o) => v.rdfs(converterOptions(o)),
  },
  {
    id: "scala",
    label: "Scala code",
    docs: "generators/scala/",
    lang: "scala",
    options: [
      { key: "package", type: "text", label: "Package", default: "eu.neverblink.linkml.metamodel" },
      {
        key: "error_handling",
        type: "select",
        label: "Function errors",
        title: "How the functions of the schema report their errors",
        choices: ["annotation", "either"],
        default: "annotation",
      },
    ],
    call: (_, v, o) => v.scala(converterOptions(o)),
  },
  {
    id: "shacl",
    label: "SHACL",
    docs: "generators/shacl/",
    // N-Triples is a subset of Turtle, so one mode highlights both formats.
    lang: "turtle",
    options: [
      { key: "open", type: "checkbox", label: "Open", title: "sh:closed false" },
      { key: "only_classes_from_root_schema", type: "checkbox", label: "Root schema only" },
      { key: "format", type: "select", label: "Format", choices: ["ttl", "nt"], default: "ttl" },
    ],
    call: (_, v, o) => v.shacl(converterOptions(o)),
  },
  {
    id: "typescript",
    label: "TypeScript",
    docs: "generators/typescript/",
    lang: "typescript",
    options: [
      { key: "pruning_mode", type: "select", label: "Pruning", choices: ["tree_root", "schema", "skip"], default: "skip" },
      TREE_ROOT,
      { key: "include_null", type: "checkbox", label: "Nulls", title: "Allow null for optional slots" },
      { key: "open", type: "checkbox", label: "Open", title: "Allow additional properties" },
      {
        key: "optional_defaults",
        type: "checkbox",
        label: "Optional defaults",
        title: "Let slots with an ifabsent be left out",
      },
      {
        key: "error_handling",
        type: "select",
        label: "Function errors",
        title: "How the functions of the schema report their errors",
        choices: ["exception", "result"],
        default: "exception",
      },
    ],
    call: (_, v, o) => v.typescript(converterOptions(o)),
  },
];

export function targetById(id: string): Target | undefined {
  return TARGETS.find((t) => t.id === id);
}
