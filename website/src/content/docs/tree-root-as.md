---
title: Whole documents in generators
description: The type that each code generator adds for a whole document, when the tree root has a `tree_root_as` other than `plain`.
---

The [`tree_root_as`](/docs/implementation-differences/#tree-root-extension) extension says what
a whole document holds: one object, an optional object, a list of objects, or a dict of them.
With `plain`, a document is one object of the tree root class, and you load it as that class.
With any other shape, it isn't, so the code generators add a type for the whole document. You
load and dump a document with that type, and the JSON is checked the same way as by the JSON
Schema.

The document type is named after the schema in `PascalCase` plus `Document`, such as
`ZooDocument` for a schema named `zoo`. None of the generators add it for a `linkml:Any` tree
root.

## TypeScript

For a schema named `zoo` with the tree root `Zoo`:

| `tree_root_as`  | Document type                                              |
|-----------------|------------------------------------------------------------|
| `optional`      | `export type ZooDocument = Zoo \| null;`                   |
| `list`          | `export type ZooDocument = Zoo[];`                         |
| `compact_dict`  | `export type ZooDocument = Record<string, KeyOptional<Zoo, "id">>;` |
| `simple_dict`   | `export type ZooDocument = Record<string, V \| KeyOptional<Zoo, "id">>;` |

Here `id` is the key slot of `Zoo`, and `V` is the type of its value slot. With `include_null`,
a `compact_dict` entry can also be `null` when `Zoo` has no required slot other than its key:
`Record<string, KeyOptional<Zoo, "id"> | null>`.

Load such a document with `JSON.parse(text) as ZooDocument`.

If another generated type has the same name, such as a class `ZooDocument`, the generator stops
with an error that names both, so that you can rename one.

## Pydantic

The file has a document class for every shape other than `plain`, and also for a `plain` tree
root with a type designator. For a schema named `zoo`:
`ZooDocument.model_validate_json(text)`. Its value is in `.root`.

## Java

The package has a document class if the tree root is a list or a dict (`tree_root_as` is
`list`, `compact_dict` or `simple_dict`). For a schema named `zoo`:
`mapper.readValue(text, ZooDocument.class)`. Its value is in `getRoot()`.

## Scala

For a schema named `some_schema`:

| `tree_root_as`                 | Document type                                  |
|--------------------------------|------------------------------------------------|
| `optional`                     | `type SomeSchemaDocument = Option[X]`          |
| `list`                         | `type SomeSchemaDocument = Seq[X]`             |
| `compact_dict`, `simple_dict`  | `type SomeSchemaDocument = Map[String, X]`     |

`X` is the class that holds the instances:

- the interface `SomeClass`, if a type designator picks the implementation of each object. The
  values of the designator slot must name classes, so a slot with the range `integer` doesn't
  count.
- otherwise `SomeClassImpl`, if the tree root has an interface
- otherwise the case class `SomeClass`

So an abstract or mixin tree root gets no document type unless it has a type designator that
names classes, because no codec can tell which class to read. If another generated type has the
same name as the document type, the document type gets underscores at the end until its name is
free, such as `SomeSchemaDocument_`.

Read and write a document with one codec. The generated code needs only the runtime module, but
the codec and YAML parser come from the yaml module, which you add as a dependency:

```scala
import eu.neverblink.linkml.yaml.LinkmlYamlCodec
import org.virtuslab.yaml.{NodeOps, parseYaml}

val codec = LinkmlYamlCodec.derived[SomeSchemaDocument]
val document = codec.decode(parseYaml(text).toOption.get)
val text2 = codec.encode(document).asYaml
```

An empty list or dict is written as an empty text, and `parseYaml` fails on an empty text. So
check for that before you decode, for example with `if text.isBlank then Seq.empty` for a
`list` document.

In the dict forms, the codec reads the key of each object from its dict key. Write documents
with `encode` without `skipId`. With `skipId = true`, an object with a key and one other slot
is written as a bare value, which `compact_dict` doesn't accept.
