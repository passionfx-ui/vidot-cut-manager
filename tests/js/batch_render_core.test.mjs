import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  selectedInDisplayOrder,
  batchRenderPlan,
  batchRenderConfirmMessage,
  batchRenderSummary,
  renderButtonState,
  RENDER_EMPTY_TIP,
  RENDER_NATIVE_TIP,
  RENDER_BUSY_TIP,
} from "../../web/gg_batch_render_core.js";
import { splitConfirmMessage } from "../../web/gg_confirm_core.js";

describe("selectedInDisplayOrder", () => {
  it("follows the Shots display order, not the selection order", () => {
    assert.deepEqual(selectedInDisplayOrder(["c", "a", "b"], ["a", "b", "c"], ["a", "c"]), ["c", "a"]);
  });
  it("selected cuts missing from the display follow in timeline order", () => {
    assert.deepEqual(selectedInDisplayOrder(["b"], ["a", "b", "c"], new Set(["c", "a", "b"])), ["b", "a", "c"]);
  });
  it("drops unknown ids and duplicates; tolerates missing input", () => {
    assert.deepEqual(selectedInDisplayOrder(["a", "a"], ["a"], ["a", "zz"]), ["a"]);
    assert.deepEqual(selectedInDisplayOrder(null, undefined, null), []);
  });
});

describe("batchRenderPlan", () => {
  const info = {
    v: { versionCount: 2, nodeCount: 0 },
    n: { versionCount: 0, nodeCount: 5 },
    e: { versionCount: 0, nodeCount: 0 },
    u: { versionCount: 0, nodeCount: null },
  };
  it("skips only known-empty cuts (no versions, zero-node graph) and keeps order", () => {
    assert.deepEqual(batchRenderPlan(["e", "v", "u", "n"], (id) => info[id]), { queue: ["v", "u", "n"], skipped: ["e"] });
  });
  it("unknown info counts as a candidate", () => {
    assert.deepEqual(batchRenderPlan(["x"], () => null), { queue: ["x"], skipped: [] });
    assert.deepEqual(batchRenderPlan(null, null), { queue: [], skipped: [] });
  });
});

describe("renderButtonState", () => {
  it("disabled with nothing selected, imported project, or busy (in that order)", () => {
    assert.deepEqual(renderButtonState({ count: 0, native: true }), { disabled: true, title: RENDER_EMPTY_TIP });
    assert.deepEqual(renderButtonState({ count: 2, native: false, busy: true }), { disabled: true, title: RENDER_NATIVE_TIP });
    assert.deepEqual(renderButtonState({ count: 2, native: true, busy: true }), { disabled: true, title: RENDER_BUSY_TIP });
    assert.equal(renderButtonState().disabled, true);
  });
  it("enabled for 1+ cuts in a native project", () => {
    assert.deepEqual(renderButtonState({ count: 1, native: true }), { disabled: false, title: "Queue 1 cut to ComfyUI" });
    assert.equal(renderButtonState({ count: 3, native: true }).title, "Queue 3 cuts to ComfyUI");
  });
});

describe("batchRenderConfirmMessage", () => {
  it("title is the question, body lists the cuts and the skipped count", () => {
    const { title, body } = splitConfirmMessage(batchRenderConfirmMessage(["1. A", "3. C"], 1));
    assert.equal(title, "Queue 2 cuts?");
    assert.equal(body, "1. A\n3. C\n\n1 skipped: no workflow");
  });
  it("singular, and long lists are cut short", () => {
    assert.equal(splitConfirmMessage(batchRenderConfirmMessage(["1. A"])).title, "Queue 1 cut?");
    const labels = Array.from({ length: 11 }, (_, i) => `${i + 1}. x`);
    const { body } = splitConfirmMessage(batchRenderConfirmMessage(labels));
    assert.equal(body.split("\n").length, 9);
    assert.match(body, /\u2026 and 3 more$/);
  });
});

describe("batchRenderSummary", () => {
  it("all queued: ok, no detail", () => {
    assert.deepEqual(batchRenderSummary({ queued: 3 }), { summary: "Queued 3 cuts", detail: "", kind: "ok" });
    assert.equal(batchRenderSummary({ queued: 1 }).summary, "Queued 1 cut");
  });
  it("skipped empty cuts stay ok and are listed", () => {
    assert.deepEqual(batchRenderSummary({ queued: 2, skipped: 1 }), {
      summary: "Queued 2 cuts",
      detail: "(1 skipped: no workflow)",
      kind: "ok",
    });
  });
  it("failures, a stop, or nothing queued warn", () => {
    assert.deepEqual(batchRenderSummary({ queued: 1, failed: 2, stopped: true }), {
      summary: "Queued 1 cut",
      detail: "(2 not queued, stopped: another cut was opened)",
      kind: "warn",
    });
    assert.deepEqual(batchRenderSummary({ skipped: 2 }), { summary: "Nothing queued", detail: "(2 skipped: no workflow)", kind: "warn" });
  });
});
