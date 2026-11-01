import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { normalizeListMode, loadListMode, saveListMode } from "../../web/gg_story_core.js";
import { rowContentKind, promptRowContentHtml } from "../../web/gg_group_list_core.js";
import { formatCutListLength } from "../../web/gg_cuts_core.js";

describe("list view modes (Info | Prompt | Caption)", () => {
  it("normalizeListMode accepts prompt", () => {
    assert.equal(normalizeListMode("prompt"), "prompt");
    assert.equal(normalizeListMode("info"), "info");
  });

  it("rowContentKind maps modes to row kinds", () => {
    assert.equal(rowContentKind("info"), "info");
    assert.equal(rowContentKind("prompt"), "prompt");
    assert.equal(rowContentKind("caption"), "caption");
  });

  it("prompt row HTML uses gg-prompt-text", () => {
    const html = promptRowContentHtml({ thumb: "<x/>", text: "Fox", placeholder: "P", title: "T", native: true });
    assert.match(html, /gg-prompt-text/);
    assert.match(html, />Fox</);
    assert.match(html, /gg-prompt-expand/);
  });

  it("formatCutListLength shows timeline sec in orange drift state", () => {
    const d = formatCutListLength({ sec: 2, planned_sec: 3, tl_sec: 3 });
    assert.equal(d.drift, true);
    assert.equal(d.text, "2.0s");
    assert.match(d.title, /Timeline/);
    const ok = formatCutListLength({ sec: 3, planned_sec: 3 });
    assert.equal(ok.drift, false);
  });
});

describe("loadListMode prompt round-trip", () => {
  it("persists prompt mode", () => {
    const m = new Map();
    const storage = { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v) };
    saveListMode(storage, "prompt");
    assert.equal(loadListMode(storage), "prompt");
  });
});
