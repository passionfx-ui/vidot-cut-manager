import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  selectedInDisplayOrder,
  batchRenderPlan,
  batchRenderConfirmMessage,
  batchRenderSummary,
  queueButtonState,
  queueDeleteBody,
  QUEUE_EMPTY_TIP,
  QUEUE_NATIVE_TIP,
  QUEUE_NO_PROJECT_TIP,
  QUEUE_BUSY_TIP,
  loadRandomSeedOn,
  saveRandomSeedOn,
  RANDOM_SEED_LS_KEY,
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

describe("queueDeleteBody", () => {
  it("ComfyUI /queue delete body: string ids, no duplicates or empties", () => {
    assert.deepEqual(queueDeleteBody(["a", "b", "a", "", null, 7]), { delete: ["a", "b", "7"] });
    assert.deepEqual(queueDeleteBody(null), { delete: [] });
  });
});

describe("queueButtonState", () => {
  it("disabled with nothing selected, imported project, or busy (in that order)", () => {
    assert.deepEqual(queueButtonState({ count: 0, native: true }), { label: "Queue", mode: "queue", disabled: true, title: QUEUE_EMPTY_TIP });
    assert.deepEqual(queueButtonState({ count: 2, native: false, busy: true }), { label: "Queue", mode: "queue", disabled: true, title: QUEUE_NATIVE_TIP });
    assert.deepEqual(queueButtonState({ count: 2, native: true, busy: true }), { label: "Queue", mode: "queue", disabled: true, title: QUEUE_BUSY_TIP });
    assert.equal(queueButtonState().disabled, true);
    assert.equal(QUEUE_EMPTY_TIP, "");
  });
  it("enabled for 1+ cuts in a native project", () => {
    assert.deepEqual(queueButtonState({ count: 1, native: true }), { label: "Queue", mode: "queue", disabled: false, title: "Queue 1 cut to ComfyUI" });
    assert.equal(queueButtonState({ count: 3, native: true }).title, "Queue 3 cuts to ComfyUI");
  });
  it("disabled with no project open", () => {
    assert.deepEqual(queueButtonState({ count: 2, native: true, hasProject: false }), { label: "Queue", mode: "queue", disabled: true, title: QUEUE_NO_PROJECT_TIP });
    assert.equal(QUEUE_NO_PROJECT_TIP, "No project open");
  });
});

describe("loadRandomSeedOn", () => {
  it("defaults on; off only when localStorage is 0", () => {
    const ls = { store: {}, getItem(k) { return this.store[k] ?? null; }, setItem(k, v) { this.store[k] = v; } };
    assert.equal(loadRandomSeedOn(ls), true);
    saveRandomSeedOn(ls, false);
    assert.equal(ls.store[RANDOM_SEED_LS_KEY], "0");
    assert.equal(loadRandomSeedOn(ls), false);
    saveRandomSeedOn(ls, true);
    assert.equal(loadRandomSeedOn(ls), true);
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
