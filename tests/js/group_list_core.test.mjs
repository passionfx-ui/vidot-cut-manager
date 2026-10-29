import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  rowContentKind,
  cutRowShellHtml,
  captionRowContentHtml,
  groupedListHtml,
} from "../../web/gg_group_list_core.js";

const count = (s, sub) => s.split(sub).length - 1;

const sections = [
  { type: "group", group: { id: "g1", name: "Intro", collapsed: false }, cuts: [{ id: "a" }, { id: "b" }] },
  { type: "group", group: { id: "g2", name: "End", collapsed: true }, cuts: [{ id: "c" }] },
  { type: "ungrouped", group: null, cuts: [{ id: "d" }] },
];

describe("rowContentKind", () => {
  it("maps list modes to row content", () => {
    assert.equal(rowContentKind("info"), "info");
    assert.equal(rowContentKind("caption"), "caption");
    assert.equal(rowContentKind("story"), "caption");
    assert.equal(rowContentKind(undefined), "info");
  });
});

describe("groupedListHtml", () => {
  const render = (kind) =>
    groupedListHtml(sections, {
      cutHtml: (c) => cutRowShellHtml({ id: c.id, kind, selected: c.id === "b", content: `[${kind}:${c.id}]` }),
      groupHue: () => 42,
      groupProgress: (cuts) => `0/${cuts.length}`,
    });

  it("writes each scene header once and every cut once", () => {
    const html = render("info");
    assert.equal(count(html, 'data-group-id="g1"'), 1);
    assert.equal(count(html, 'data-group-id="g2"'), 1);
    assert.equal(count(html, "Scene · Intro"), 1);
    assert.equal(count(html, "gg-grp-loose"), 1);
    assert.equal(count(html, 'class="gg-grp-head"'), 3);
    for (const id of ["a", "b", "c", "d"]) assert.equal(count(html, `data-cut-id="${id}"`), 1);
  });

  it("keeps collapse state and progress", () => {
    const html = render("info");
    assert.match(html, /data-group-id="g2"[\s\S]*?▸[\s\S]*?<ol class="gg-cutlist" hidden>/);
    assert.match(html, /data-group-id="g1"[\s\S]*?▾[\s\S]*?<ol class="gg-cutlist">/);
    assert.match(html, /gg-grp-prog">0\/2</);
  });

  it("Info and Caption share the same group structure; only row content differs", () => {
    const strip = (s) => s.replace(/\[(info|caption):/g, "[").replace(/ gg-cut-caption/g, "");
    const info = render("info");
    const cap = render("caption");
    assert.notEqual(info, cap);
    assert.equal(strip(info), strip(cap));
    assert.equal(count(cap, 'class="gg-cut gg-cut-caption'), 4);
    assert.equal(count(info, "gg-cut-caption"), 0);
  });

  it("escapes scene names", () => {
    const html = groupedListHtml([{ type: "group", group: { id: "x", name: "<b>&" }, cuts: [{ id: "a" }] }], { cutHtml: () => "" });
    assert.match(html, /Scene · &lt;b&gt;&amp;/);
  });

  it("empty sections render nothing", () => {
    assert.equal(groupedListHtml([], { cutHtml: () => "x" }), "");
  });
});

describe("cutRowShellHtml", () => {
  it("adds selection and caption classes", () => {
    assert.equal(cutRowShellHtml({ id: "a", kind: "info", selected: false, content: "X" }), '<li class="gg-cut" data-cut-id="a">X</li>');
    assert.equal(
      cutRowShellHtml({ id: "a\"", kind: "caption", selected: true, content: "" }),
      '<li class="gg-cut gg-cut-caption gg-sel" data-cut-id="a&quot;"></li>',
    );
  });
});

describe("captionRowContentHtml", () => {
  it("is only the caption field, read-only until edit on native projects", () => {
    const html = captionRowContentHtml({ text: "Hi <there>", placeholder: "Caption", title: "tip", native: true });
    assert.match(html, /^<textarea class="gg-caption-text"[^>]* readonly[^>]*>Hi &lt;there&gt;<\/textarea>$/);
    assert.doesNotMatch(html, /gg-cut-header|gg-thumb|gg-cut-status/);
  });
  it("is disabled on imported projects", () => {
    assert.match(captionRowContentHtml({ text: "", placeholder: "", title: "", native: false }), / disabled /);
  });
});
