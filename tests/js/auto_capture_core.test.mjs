import { test } from "node:test";
import assert from "node:assert/strict";
import { captureRouteMissing, captureToast, createAutoCapture } from "../../web/gg_auto_capture_core.js";

const NATIVE = "01a18b3f-271a-7e85-9787-d2ad00dea53d";
const CUT = "01a18b3f-271d-722b-81f4-e2f056fdca13";
const isNativePid = (pid) => typeof pid === "string" && pid.includes("-");

test("prompt queued from a native cut is captured once on success", () => {
  const ac = createAutoCapture({ isNativePid });
  assert.equal(ac.remember("p1", { cutId: CUT, projectId: NATIVE }), true);
  assert.deepEqual(ac.take("p1"), { cutId: CUT, projectId: NATIVE });
  assert.equal(ac.take("p1"), null);
  assert.equal(ac.pendingCount(), 0);
});

test("legacy project or no cut: nothing to capture", () => {
  const ac = createAutoCapture({ isNativePid });
  assert.equal(ac.remember("p1", { cutId: "c64b54998d8", projectId: "p3b46110d44" }), false);
  assert.equal(ac.remember("p2", null), false);
  assert.equal(ac.take("p1"), null);
  assert.equal(ac.take("p2"), null);
  assert.equal(ac.take("unknown"), null);
});

test("after a page reload the persisted jobs list is the fallback (native only)", () => {
  const ac = createAutoCapture({ isNativePid });
  const jobs = [
    { promptId: "p9", cutId: CUT, projectId: NATIVE },
    { promptId: "p8", cutId: "c1", projectId: "p3b46110d44" },
  ];
  assert.deepEqual(ac.take("p9", jobs), { cutId: CUT, projectId: NATIVE });
  assert.equal(ac.take("p9", jobs), null);
  assert.equal(ac.take("p8", jobs), null);
});

test("error / interrupt: forgotten, a late success adds nothing", () => {
  const ac = createAutoCapture({ isNativePid });
  ac.remember("p1", { cutId: CUT, projectId: NATIVE });
  ac.forget("p1");
  assert.equal(ac.take("p1", [{ promptId: "p1", cutId: CUT, projectId: NATIVE }]), null);
  assert.equal(ac.remember("p1", { cutId: CUT, projectId: NATIVE }), false);
});

test("old server without the route is detected (404/405 without a JSON ok)", () => {
  assert.equal(captureRouteMissing(404, {}), true);
  assert.equal(captureRouteMissing(405, {}), true);
  assert.equal(captureRouteMissing(404, { ok: false, message: "x" }), false);
  assert.equal(captureRouteMissing(400, {}), false);
  assert.equal(captureRouteMissing(200, { ok: true }), false);
});

test("toast text", () => {
  assert.deepEqual(captureToast({ ok: true, output: { name: "z.png" } }, "1-1 opening"), {
    summary: "Added to cut 1-1 opening", detail: "z.png", kind: "ok",
  });
  assert.equal(captureToast({ ok: true, duplicate: true }, "1-1 opening"), null);
  assert.deepEqual(captureToast({ ok: false, message: "failed" }, ""), {
    summary: "Not added to its cut", detail: "failed", kind: "warn",
  });
});
