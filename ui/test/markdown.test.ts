// Tests for markdown.ts. Run with `npm test` (see run.mjs).
import { test } from "node:test";
import assert from "node:assert/strict";
import { addWordBreaks, isPageLink, renderMarkdown, resolvePageLink } from "../src/lib/markdown.js";

test("the first cell of each table row is a name that can go onto more lines", () => {
  const html = renderMarkdown(
    "| Class | Description |\n| --- | --- |\n| [RegisteredShare](#registeredshare) | A share_class |\n",
  );
  assert.ok(html.includes("<th>Class</th>"), html);
  assert.ok(
    html.includes(
      '<td><span class="md-name"><a href="#registeredshare">Registered<wbr>Share</a></span></td>',
    ),
    html,
  );
  // Only the first cell gets word breaks.
  assert.ok(html.includes("<td>A share_class</td>"), html);
});

test("the alignment of a first cell is kept", () => {
  const html = renderMarkdown("| Name |\n| :-: |\n| a_b |\n");
  assert.ok(html.includes('<td align="center"><span class="md-name">a_<wbr>b</span></td>'), html);
});

test("word breaks go between words only", () => {
  assert.equal(addWordBreaks("hasPart2Of"), "has<wbr>Part2<wbr>Of");
  assert.equal(addWordBreaks("has_part_"), "has_<wbr>part_");
  assert.equal(addWordBreaks("ABCShare"), "ABCShare");
});

test("word breaks leave tags and character references as they are", () => {
  assert.equal(
    addWordBreaks('<a href="#aB">fooBar</a> &amp;Copy &ApplyFunction;'),
    '<a href="#aB">foo<wbr>Bar</a> &amp;Copy &ApplyFunction;',
  );
});

test("links within the page and to other pages stay in the page view, and others open in a new tab", () => {
  assert.equal(renderMarkdown("[a](#a)"), '<p><a href="#a">a</a></p>\n');
  assert.equal(renderMarkdown("[b](../slots/b.md)"), '<p><a href="../slots/b.md">b</a></p>\n');
  assert.equal(
    renderMarkdown("[a](https://w3id.org/linkml) [b](https://example.org/spec.md)"),
    '<p><a target="_blank" rel="noopener" href="https://w3id.org/linkml">a</a> ' +
      '<a target="_blank" rel="noopener" href="https://example.org/spec.md">b</a></p>\n',
  );
});

test("a link to another page is a relative path of a Markdown file", () => {
  assert.ok(isPageLink("classes/person.md"));
  assert.ok(isPageLink("../slots/name.md"));
  assert.ok(!isPageLink("https://example.org/spec.md"));
  assert.ok(!isPageLink("/spec.md"));
  assert.ok(!isPageLink("#class-person"));
  assert.ok(!isPageLink("classes/"));
});

test("a link to another page leads to its path from the folder of the index", () => {
  assert.equal(resolvePageLink("index.md", "classes/person.md"), "classes/person.md");
  assert.equal(resolvePageLink("classes/person.md", "agent.md"), "classes/agent.md");
  assert.equal(resolvePageLink("classes/person.md", "../slots/name.md"), "slots/name.md");
  assert.equal(resolvePageLink("classes/person.md", "../index.md"), "index.md");
  assert.equal(resolvePageLink("index.md", "classes/gr%C3%B6%C3%9Fe.md"), "classes/größe.md");
});
