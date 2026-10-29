import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { selectionBarView, statusPanelView } from "../../web/gg_status_panel_core.js";

const withMedia = {
  id: "c1",
  name: "New cut",
  sec: 3,
  media: { id: "v2", kind: "image" },
  pick: null,
  versions_list: [{ id: "v1" }, { id: "v2" }],
};

describe("statusPanelView", () => {
  it("empty selection is one muted line", () => {
    assert.deepEqual(statusPanelView({ count: 0, cut: null }), { kind: "empty", text: "No cut selected" });
    assert.deepEqual(statusPanelView({}), { kind: "empty", text: "No cut selected" });
    assert.equal(statusPanelView({ count: 1, cut: null }).kind, "empty");
  });

  it("multi-select shows the count only", () => {
    assert.deepEqual(statusPanelView({ count: 3, cut: withMedia }), { kind: "multi", text: "3 cuts selected" });
  });

  it("single cut: title, Done when idle with an output, length and Latest version", () => {
    const v = statusPanelView({ count: 1, cut: withMedia, cutLabel: "1-4", name: "New cut", render: null });
    assert.equal(v.kind, "cut");
    assert.equal(v.title, "1-4 New cut");
    assert.equal(v.label, "1-4");
    assert.equal(v.name, "New cut");
    assert.equal(v.status.mode, "done");
    assert.equal(v.status.text, "Done");
    assert.equal(v.length.text, "Length 3.0s");
    assert.equal(v.version.text, "Latest v02");
  });

  it("Best version and original video length", () => {
    const cut = { ...withMedia, pick: "v1", media: { id: "v1", kind: "video", seconds: 5.2 } };
    const v = statusPanelView({ count: 1, cut, cutLabel: "2", name: "Hero" });
    assert.equal(v.version.text, "Best v01");
    assert.equal(v.length.text, "Length 5.2s");
  });

  it("no output: Idle and No versions yet", () => {
    const v = statusPanelView({ count: 1, cut: { id: "c2", name: "Empty", sec: 2, media: null }, cutLabel: "3" });
    assert.equal(v.status.mode, "idle");
    assert.equal(v.status.text, "Idle");
    assert.equal(v.version.text, "No versions yet");
    assert.equal(v.title, "3");
  });

  it("render states from the render status view", () => {
    const q = statusPanelView({ count: 1, cut: withMedia, render: { state: "queued", percent: null, count: 1, position: 2 } });
    assert.equal(q.status.mode, "queued");
    assert.equal(q.status.text, "Queued");
    const r = statusPanelView({ count: 1, cut: withMedia, render: { state: "rendering", percent: 42, count: 1, position: null } });
    assert.equal(r.status.mode, "rendering");
    assert.equal(r.status.text, "Rendering 42%");
    const f = statusPanelView({ count: 1, cut: withMedia, render: { state: "failed", percent: null, count: 0, position: null, error: "OOM" } });
    assert.equal(f.status.mode, "failed");
    assert.equal(f.status.text, "Failed");
    assert.match(f.status.title, /OOM/);
  });
});

describe("selectionBarView", () => {
  it("nothing selected: same class as with a selection (never hidden), actions disabled", () => {
    const v = selectionBarView({ count: 0, anyGrouped: false, selSize: 0 });
    assert.equal(v.className, "gg-selbar");
    assert.equal(v.countText, "0");
    assert.deepEqual([v.group.disabled, v.ungroup.disabled, v.clear.disabled], [true, true, true]);
    assert.deepEqual(selectionBarView(), v);
  });

  it("class does not change with the selection count", () => {
    const classes = [0, 1, 2, 7].map((count) => selectionBarView({ count, selSize: count }).className);
    assert.deepEqual(new Set(classes), new Set(["gg-selbar"]));
  });

  it("1+ selected: Group and clear on, Ungroup only when a selected cut is in a scene", () => {
    const one = selectionBarView({ count: 1, anyGrouped: false, selSize: 1 });
    assert.deepEqual([one.countText, one.group.disabled, one.ungroup.disabled, one.clear.disabled], ["1", false, true, false]);
    const grouped = selectionBarView({ count: 3, anyGrouped: true, selSize: 3 });
    assert.deepEqual([grouped.countText, grouped.ungroup.disabled], ["3", false]);
  });

  it("selection of cuts not on the shown timeline: count 0 but clear stays on", () => {
    const v = selectionBarView({ count: 0, selSize: 2 });
    assert.equal(v.group.disabled, true);
    assert.equal(v.clear.disabled, false);
  });
});
