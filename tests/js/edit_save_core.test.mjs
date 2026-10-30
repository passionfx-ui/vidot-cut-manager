import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createEditSaveGate } from "../../web/gg_edit_save_core.js";

const tick = (ms) => new Promise((r) => setTimeout(r, ms));

describe("edit save gate", () => {
  it("runs writes one at a time in call order", async () => {
    const g = createEditSaveGate();
    const log = [];
    const a = g.run(async () => { log.push("a1"); await tick(30); log.push("a2"); return 1; });
    const b = g.run(async () => { log.push("b1"); await tick(1); log.push("b2"); return 2; });
    assert.deepEqual(await Promise.all([a, b]), [1, 2]);
    assert.deepEqual(log, ["a1", "a2", "b1", "b2"]);
  });
  it("a failing write does not block later writes and still rejects to its caller", async () => {
    const g = createEditSaveGate();
    const a = g.run(async () => { throw new Error("x"); });
    const b = g.run(async () => "ok");
    await assert.rejects(a, /x/);
    assert.equal(await b, "ok");
  });
  it("a response is current only when no local edit happened since the request", () => {
    const g = createEditSaveGate();
    const mark = g.seq;
    assert.equal(g.isCurrent(mark), true);
    g.bump();
    assert.equal(g.isCurrent(mark), false);
    assert.equal(g.isCurrent(g.seq), true);
  });
  it("overlapping saves: only the response of the newest local state is adopted", async () => {
    const g = createEditSaveGate();
    let local = "v1";
    const adopted = [];
    const save = () => g.run(async () => {
      const mark = g.seq;
      const sent = local;
      await tick(10);
      if (g.isCurrent(mark)) adopted.push(sent);
    });
    g.bump();
    const s1 = save();
    await tick(3); // s1 is now in flight with "v1"
    local = "v2";
    g.bump(); // user edits again while v1 is in flight
    const s2 = save();
    await Promise.all([s1, s2]);
    assert.deepEqual(adopted, ["v2"]);
  });
});

const settles = (p, ms = 80) => Promise.race([p.then(() => "settled", () => "settled"), tick(ms).then(() => "stuck")]);

describe("edit save gate: waiting timeline save before a cut list write (0.9.83)", () => {
  it("run() from inside a job never settles and blocks later writes (the 0.9.78 scene drag hang)", async () => {
    const g = createEditSaveGate();
    const job = g.run(async () => { await g.run(async () => "save"); return "reorder"; });
    assert.equal(await settles(job), "stuck");
    assert.equal(await settles(g.run(async () => "next drag")), "stuck");
  });
  it("runAfterPending writes the waiting save first, inside the same job, then the write", async () => {
    const g = createEditSaveGate();
    const log = [];
    let pending = true;
    const take = () => {
      if (!pending) return null;
      pending = false;
      return async () => { log.push("save"); await tick(5); };
    };
    const job = g.runAfterPending(take, async () => { log.push("reorder"); return "ok"; });
    assert.equal(await settles(job), "settled");
    assert.equal(await job, "ok");
    assert.deepEqual(log, ["save", "reorder"]);
    assert.equal(await g.runAfterPending(take, async () => "again"), "again");
    assert.deepEqual(log, ["save", "reorder"]);
  });
  it("the waiting save is read when the job starts, after earlier writes", async () => {
    const g = createEditSaveGate();
    const log = [];
    let pending = false;
    const take = () => (pending ? ((pending = false), async () => log.push("save")) : null);
    const first = g.run(async () => { await tick(10); log.push("first"); });
    const second = g.runAfterPending(take, async () => log.push("reorder"));
    pending = true; // a trim made while the first write is still out
    await Promise.all([first, second]);
    assert.deepEqual(log, ["first", "save", "reorder"]);
    assert.equal(await settles(g.run(async () => "next")), "settled");
  });
});