import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  JOB_HISTORY_DOCK_SETTING_ID,
  JOB_HISTORY_DOCK_SAVED_KEY,
  readHeldDock,
  writeHeldDock,
  planDockOnCutManagerOpen,
  planDockOnCutManagerClose,
  resolveSettingApi,
} from "../../web/gg_job_history_dock_core.js";

function memStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
  };
}

describe("Job History dock setting", () => {
  it("targets ComfyUI Docked job history", () => {
    assert.equal(JOB_HISTORY_DOCK_SETTING_ID, "Comfy.Queue.QPOV2");
  });
});

describe("planDockOnCutManagerOpen", () => {
  it("saves a floating panel and forces docked on", () => {
    assert.deepEqual(planDockOnCutManagerOpen(null, false), { held: false, setTo: true });
  });

  it("saves an already docked panel and does not write again", () => {
    assert.deepEqual(planDockOnCutManagerOpen(null, true), { held: true, setTo: null });
  });

  it("does not overwrite the saved flag when open runs again", () => {
    assert.deepEqual(planDockOnCutManagerOpen(false, true), { held: false, setTo: null });
    assert.deepEqual(planDockOnCutManagerOpen(false, false), { held: false, setTo: true });
    assert.deepEqual(planDockOnCutManagerOpen(true, true), { held: true, setTo: null });
  });

  it("ignores an unknown setting value until it is boolean", () => {
    assert.deepEqual(planDockOnCutManagerOpen(null, undefined), { held: null, setTo: null });
    assert.deepEqual(planDockOnCutManagerOpen(null, "1"), { held: null, setTo: null });
    assert.deepEqual(planDockOnCutManagerOpen(false, undefined), { held: false, setTo: null });
  });
});

describe("planDockOnCutManagerClose", () => {
  it("restores the saved docked flag and releases the hold", () => {
    assert.deepEqual(planDockOnCutManagerClose(false), { held: null, setTo: false });
    assert.deepEqual(planDockOnCutManagerClose(true), { held: null, setTo: true });
  });

  it("does nothing when nothing was saved", () => {
    assert.deepEqual(planDockOnCutManagerClose(null), { held: null, setTo: null });
    assert.deepEqual(planDockOnCutManagerClose(undefined), { held: null, setTo: null });
  });
});

describe("held dock storage", () => {
  it("round-trips the saved flag and clears it", () => {
    const storage = memStorage();
    assert.equal(readHeldDock(storage), null);
    writeHeldDock(storage, false);
    assert.equal(storage.getItem(JOB_HISTORY_DOCK_SAVED_KEY), "0");
    assert.equal(readHeldDock(storage), false);
    writeHeldDock(storage, true);
    assert.equal(readHeldDock(storage), true);
    writeHeldDock(storage, null);
    assert.equal(readHeldDock(storage), null);
    assert.equal(storage.getItem(JOB_HISTORY_DOCK_SAVED_KEY), null);
  });

  it("ignores missing or broken storage", () => {
    assert.equal(readHeldDock(null), null);
    assert.equal(readHeldDock({ getItem() { throw new Error("no"); } }), null);
    assert.doesNotThrow(() => writeHeldDock(null, true));
    assert.doesNotThrow(() => writeHeldDock({
      setItem() { throw new Error("no"); },
      removeItem() { throw new Error("no"); },
    }, false));
  });
});

describe("resolveSettingApi", () => {
  it("accepts a get/set object or a ref wrapping one", () => {
    const api = { get() {}, set() {} };
    assert.equal(resolveSettingApi(api), api);
    assert.equal(resolveSettingApi({ value: api }), api);
    assert.equal(resolveSettingApi(null), null);
    assert.equal(resolveSettingApi({ get() {} }), null);
  });
});
