import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createFieldSlots } from "../../web/gg_field_slots_core.js";

describe("field save slots", () => {
  it("keeps both cuts when two cuts are edited before the timer fires", () => {
    const s = createFieldSlots();
    s.add("c1", "p1", { caption: "one" });
    s.add("c2", "p1", { caption: "two" });
    const out = s.takeAll();
    assert.deepEqual(out.map((x) => [x.cutId, x.fields.caption]), [["c1", "one"], ["c2", "two"]]);
    assert.equal(s.size, 0);
  });
  it("merges fields of the same cut and keeps the newest value", () => {
    const s = createFieldSlots();
    s.add("c1", "p1", { caption: "a" });
    s.add("c1", "p1", { needs_redo: true });
    s.add("c1", "p1", { caption: "ab" });
    assert.deepEqual(s.get("c1").fields, { caption: "ab", needs_redo: true });
  });
  it("remembers the project each edit was typed in", () => {
    const s = createFieldSlots();
    s.add("c1", "p1", { caption: "x" });
    assert.equal(s.get("c1").pid, "p1");
  });
  it("does not carry fields over from another project's slot with the same cut id", () => {
    const s = createFieldSlots();
    s.add("c1", "p1", { caption: "old" });
    s.add("c1", "p2", { planned_sec: 3 });
    assert.deepEqual(s.get("c1").fields, { planned_sec: 3 });
  });
  it("takeAll on an empty set returns nothing", () => {
    assert.deepEqual(createFieldSlots().takeAll(), []);
  });
});