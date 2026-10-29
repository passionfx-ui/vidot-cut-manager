import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  rowContentKind,
  cutRowShellHtml,
  captionRowContentHtml,
  groupedListHtml,
  shotsSections,
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

describe("shotsSections (one Ungrouped section at the bottom)", () => {
  const ids = (secs) => secs.map((s) => `${s.type === "group" ? s.group.id : "U"}:${s.cuts.map((c) => c.id).join("")}`);
  const cuts = ["x", "a", "y", "b", "c", "z"].map((id) => ({ id }));
  const groups = [{ id: "g2", cut_ids: ["c"] }, { id: "g1", cut_ids: ["b", "a"] }];

  it("gathers cuts in no scene into one last section, whatever their position", () => {
    assert.deepEqual(ids(shotsSections(cuts, groups)), ["g1:ab", "g2:c", "U:xyz"]);
  });
  it("no Ungrouped section when every cut is in a scene; only Ungrouped when there are no scenes", () => {
    assert.deepEqual(ids(shotsSections(cuts.slice(1, 2).concat(cuts.slice(3, 5)), groups)), ["g1:ab", "g2:c"]);
    assert.deepEqual(ids(shotsSections(cuts, [])), ["U:xaybcz"]);
  });
  it("drops empty scenes, unknown ids and duplicate membership", () => {
    const secs = shotsSections(cuts, [{ id: "g0", cut_ids: ["nope"] }, { id: "g1", cut_ids: ["a", "a"] }, { id: "g2", cut_ids: ["a", "b"] }]);
    assert.deepEqual(ids(secs), ["g1:a", "g2:b", "U:xycz"]);
  });
  it("the Ungrouped header is plain: no scene id, rename, delete, fold or drag handle", () => {
    const html = groupedListHtml(shotsSections(cuts, groups), { cutHtml: (c) => `<li data-cut-id="${c.id}"></li>` });
    const loose = html.slice(html.indexOf("gg-grp-loose"));
    assert.equal(html.lastIndexOf("<section"), html.indexOf('<section class="gg-grp-sec gg-grp-loose"'));
    assert.match(loose, /<span class="gg-grp-title">Ungrouped<\/span><span class="gg-grp-meta">3<\/span>/);
    assert.doesNotMatch(loose, /data-group-id|gg-grp-ren|gg-grp-del|gg-grp-fold|Scene ·/);
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
  it("is the caption field, read-only until edit on native projects", () => {
    const html = captionRowContentHtml({ text: "Hi <there>", placeholder: "Caption", title: "tip", native: true });
    assert.match(html, /<textarea class="gg-caption-text"[^>]* readonly[^>]*>Hi &lt;there&gt;<\/textarea>$/);
    assert.doesNotMatch(html, /gg-cut-header|gg-cut-status/);
  });
  it("puts the Info thumbnail in the same thumb column, before the caption field", () => {
    const thumb = '<div class="gg-cut-thumb"><img class="gg-thumb gg-thumb-img"></div>';
    const html = captionRowContentHtml({ thumb, text: "x", placeholder: "", title: "", native: true });
    assert.ok(html.startsWith(`<div class="gg-cut-thumb-col">${thumb}</div><textarea class="gg-caption-text"`));
    assert.equal(count(html, "gg-cut-thumb-col"), 1);
  });
  it("keeps the thumb column when there is no thumbnail", () => {
    assert.ok(captionRowContentHtml({ text: "", placeholder: "", title: "", native: true }).startsWith('<div class="gg-cut-thumb-col"></div><textarea'));
  });
  it("is disabled on imported projects", () => {
    assert.match(captionRowContentHtml({ text: "", placeholder: "", title: "", native: false }), / disabled /);
  });
});
