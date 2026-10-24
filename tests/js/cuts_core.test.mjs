import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  formatCutNumber,
  computeEffectiveSec,
  lengthWarning,
  moveCut,
  moveCuts,
  shotsDropTarget,
  finalCutList,
  filterCuts,
  fileBaseName,
  sanitizeNamePart,
  projectCompletion,
  formatDueDisplay,
  formatMinSecDot,
  versionIndexFromList,
} from "../../web/gg_cuts_core.js";

describe("formatCutNumber", () => {
  it("pads to three digits", () => {
    assert.equal(formatCutNumber(1), "001");
    assert.equal(formatCutNumber(42), "042");
  });
});

describe("computeEffectiveSec + lengthWarning", () => {
  it("uses planned_sec when set", () => {
    assert.equal(computeEffectiveSec({ sec: 3, planned_sec: 2 }), 2);
  });

  it("end_card exempt from warning", () => {
    assert.equal(lengthWarning({ sec: 10, end_card: true }), null);
  });

  it("exactly 3.0 not warned, 3.01 warned", () => {
    assert.equal(lengthWarning({ sec: 3 }), null);
    const w = lengthWarning({ sec: 3.01 });
    assert.ok(w);
    assert.equal(w.kind, "over3s");
    assert.equal(w.message, "Over 3 s (short-form rule)");
  });
});

describe("moveCut", () => {
  const groups = [
    { id: "g1", name: "A", cut_ids: ["a", "b"], collapsed: false },
    { id: "g2", name: "B", cut_ids: ["c"], collapsed: false },
  ];
  const order = ["a", "b", "c"];

  it("moves within scene to end", () => {
    const r = moveCut(order, groups, "a", { toIndex: 1, toGroupId: "g1" });
    assert.deepEqual(r.order, ["b", "a", "c"]);
    assert.deepEqual(r.groups[0].cut_ids, ["b", "a"]);
  });

  it("moves to other scene", () => {
    const r = moveCut(order, groups, "a", { toIndex: 2, toGroupId: "g2" });
    assert.deepEqual(r.order, ["b", "c", "a"]);
    assert.deepEqual(r.groups[0].cut_ids, ["b"]);
    assert.deepEqual(r.groups[1].cut_ids, ["c", "a"]);
  });

  it("moves to ungrouped", () => {
    const r = moveCut(order, groups, "b", { toIndex: 3, toGroupId: null });
    assert.deepEqual(r.order, ["a", "c", "b"]);
    assert.deepEqual(r.groups[0].cut_ids, ["a"]);
    assert.ok(!r.groups.some((g) => g.cut_ids.includes("b")));
  });
});

describe("finalCutList", () => {
  const timeline = {
    cuts: [
      { id: "x", number: 1, name: "a", sec: 2, pick: "v1", versions_list: [{ id: "v1", created: 1 }] },
      { id: "y", number: 2, name: "b", sec: 4, pick: null, versions_list: [] },
      { id: "z", number: 3, name: "c", sec: 3.01, pick: "v2", versions_list: [{ id: "v2", created: 2 }] },
    ],
  };

  it("only best picks, totals, missing, warnings", () => {
    const r = finalCutList(timeline);
    assert.equal(r.items.length, 2);
    assert.equal(r.totalSec, 2 + 3.01);
    assert.deepEqual(r.missingBest, ["y"]);
    assert.equal(r.warnings.length, 1);
    assert.equal(r.warnings[0].cutId, "z");
  });

  it("empty when no picks", () => {
    const r = finalCutList({ cuts: [{ id: "a", sec: 1, pick: null }] });
    assert.equal(r.items.length, 0);
    assert.equal(r.totalSec, 0);
  });
});

describe("filterCuts", () => {
  const cuts = [{ id: "1", needs_redo: true }, { id: "2", needs_redo: false }];
  it("needsRedoOnly", () => {
    assert.equal(filterCuts(cuts, { needsRedoOnly: true }).length, 1);
    assert.equal(filterCuts(cuts).length, 2);
  });
});

describe("fileBaseName + sanitizeNamePart", () => {
  it("S01_003_v02 pattern", () => {
    assert.equal(fileBaseName({ number: 3, scene_index: 1 }, null, 2), "S01_003_v02");
    assert.equal(fileBaseName({ number: 3, scene_index: 0 }, null, 1), "S00_003_v01");
  });

  it("sanitizeNamePart", () => {
    assert.equal(sanitizeNamePart("  hello world!  "), "hello_world");
  });
});

describe("projectCompletion", () => {
  const timeline = {
    project: { due_date: "2026-10-30" },
    cuts: [
      { id: "a", pick: "v", versions_list: [{ id: "v", kind: "image" }] },
      { id: "b", pick: null, versions_list: [] },
    ],
  };

  it("done/total/percent and due", () => {
    const r = projectCompletion(timeline, new Date("2026-10-24T12:00:00Z"));
    assert.equal(r.done, 1);
    assert.equal(r.total, 2);
    assert.equal(r.percent, 50);
    assert.equal(r.dueDate, "2026-10-30");
    assert.equal(r.daysLeft, 6);
    assert.equal(r.overdue, false);
  });

  it("overdue", () => {
    const r = projectCompletion(timeline, new Date("2026-11-01T12:00:00Z"));
    assert.equal(r.overdue, true);
    assert.ok(r.daysLeft < 0);
  });
});

describe("moveCuts", () => {
  const groups = [
    { id: "g1", name: "A", cut_ids: ["a", "b"], collapsed: false },
    { id: "g2", name: "B", cut_ids: ["c"], collapsed: false },
  ];
  const order = ["a", "b", "c"];

  it("moves multi-selection together", () => {
    const r = moveCuts(order, groups, ["a", "b"], { toIndex: 1, toGroupId: "g2" });
    assert.deepEqual(r.order, ["c", "a", "b"]);
    assert.deepEqual(r.groups[1].cut_ids, ["c", "a", "b"]);
  });
});

describe("shotsDropTarget", () => {
  it("inserts before row when above midpoint", () => {
    const order = ["a", "b"];
    const rows = [
      { id: "a", top: 0, bottom: 20, groupId: "g1" },
      { id: "b", top: 20, bottom: 40, groupId: "g1" },
    ];
    const t = shotsDropTarget(order, rows, 5);
    assert.equal(t.toIndex, 0);
    assert.equal(t.toGroupId, "g1");
  });
});

describe("formatDueDisplay + formatMinSecDot", () => {
  it("due label with days left", () => {
    const c = projectCompletion(
      { project: { due_date: "2026-10-30" }, cuts: [] },
      new Date("2026-10-24T12:00:00Z"),
    );
    const d = formatDueDisplay(c);
    assert.match(d.text, /Due Oct 30/);
    assert.match(d.text, /6 days left/);
  });

  it("duration m:ss.s", () => {
    assert.equal(formatMinSecDot(65.5), "1:05.5");
  });
});

describe("versionIndexFromList", () => {
  it("creation order index", () => {
    const list = [{ id: "a", created: 2 }, { id: "b", created: 1 }];
    assert.equal(versionIndexFromList(list, "b"), 1);
    assert.equal(versionIndexFromList(list, "a"), 2);
  });
});
