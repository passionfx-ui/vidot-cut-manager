import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  formatCutNumber,
  computeCutLabels,
  cutDisplayLabel,
  computeEffectiveSec,
  lengthWarning,
  moveCut,
  moveCuts,
  shotsDropTarget,
  clientYToWrapY,
  autoScrollDelta,
  finalCutList,
  filterCuts,
  fileBaseName,
  sanitizeNamePart,
  projectCompletion,
  formatDueDisplay,
  formatMinSecDot,
  versionIndexFromList,
  formatCutHeaderLengths,
  cutBaseSec,
  cutOriginalSec,
  cutTimelineSec,
  formatCutVersionStatus,
  formatPickedVersionInfo,
  versionRepState,
  plannedLenInputPlaceholder,
  addCutTarget,
} from "../../web/gg_cuts_core.js";

describe("versionRepState (Best is manual only)", () => {
  const vl = [{ id: "v2" }, { id: "v1" }];
  it("no pick: newest media is implicit, others plain", () => {
    const c = { pick: null, media: { id: "v2" }, versions_list: vl };
    assert.equal(versionRepState(c, "v2"), "implicit");
    assert.equal(versionRepState(c, "v1"), "");
  });
  it("manual pick marks only the pick", () => {
    const c = { pick: "v1", media: { id: "v1" }, versions_list: vl };
    assert.equal(versionRepState(c, "v1"), "manual");
    assert.equal(versionRepState(c, "v2"), "");
  });
  it("empty inputs", () => {
    assert.equal(versionRepState(null, "v1"), "");
    assert.equal(versionRepState({ pick: null, media: null }, "v1"), "");
    assert.equal(versionRepState({ pick: null, media: { id: "v1" } }, ""), "");
  });
});

describe("formatCutNumber", () => {
  it("pads to three digits", () => {
    assert.equal(formatCutNumber(1), "001");
    assert.equal(formatCutNumber(42), "042");
  });
});

describe("computeCutLabels", () => {
  it("empty timeline", () => {
    assert.equal(computeCutLabels(null).size, 0);
    assert.equal(computeCutLabels({ cuts: [] }).size, 0);
  });

  it("single scene group", () => {
    const tl = {
      cuts: [
        { id: "a", group_id: "g1" },
        { id: "b", group_id: "g1" },
        { id: "c", group_id: "g1" },
      ],
    };
    const m = computeCutLabels(tl);
    assert.deepEqual(m.get("a"), { scene: 1, cut: 1, label: "1-1" });
    assert.deepEqual(m.get("b"), { scene: 1, cut: 2, label: "1-2" });
    assert.deepEqual(m.get("c"), { scene: 1, cut: 3, label: "1-3" });
  });

  it("ungrouped consecutive run is one implicit scene", () => {
    const tl = {
      cuts: [{ id: "a", group_id: "" }, { id: "b", group_id: "" }],
    };
    const m = computeCutLabels(tl);
    assert.equal(m.get("a")?.label, "1-1");
    assert.equal(m.get("b")?.label, "1-2");
  });

  it("mixed grouped and ungrouped blocks in order", () => {
    const tl = {
      cuts: [
        { id: "a", group_id: "g1" },
        { id: "b", group_id: "g1" },
        { id: "c", group_id: "" },
        { id: "d", group_id: "" },
        { id: "e", group_id: "g2" },
      ],
    };
    const m = computeCutLabels(tl);
    assert.equal(m.get("a")?.label, "1-1");
    assert.equal(m.get("b")?.label, "1-2");
    assert.equal(m.get("c")?.label, "2-1");
    assert.equal(m.get("d")?.label, "2-2");
    assert.equal(m.get("e")?.label, "3-1");
  });

  it("reorder changes labels within scene", () => {
    const tl = {
      cuts: [
        { id: "b", group_id: "g1" },
        { id: "a", group_id: "g1" },
      ],
    };
    const m = computeCutLabels(tl);
    assert.equal(m.get("b")?.label, "1-1");
    assert.equal(m.get("a")?.label, "1-2");
  });

  it("cutDisplayLabel falls back to global number", () => {
    assert.equal(cutDisplayLabel({ id: "x", number: 5 }, new Map()), "005");
    const m = computeCutLabels({ cuts: [{ id: "x", group_id: "g" }] });
    assert.equal(cutDisplayLabel({ id: "x" }, m), "1-1");
  });
});

describe("cut header lengths", () => {
  it("shows only the original length, never the timeline trim", () => {
    const r = formatCutHeaderLengths({ tl_sec: 4, sec: 3.2 });
    assert.equal(r.text, "4.0s");
    assert.equal(r.title, "Original length 4.0s");
    assert.equal(formatCutHeaderLengths({ sec: 2.3 }).text, "2.3s");
  });
  it("video: original is the media length, not the trimmed clip", () => {
    const c = { tl_sec: 3, sec: 1.5, media: { id: "v1", kind: "video", seconds: 5.04 } };
    assert.equal(cutOriginalSec(c), 5.04);
    assert.equal(formatCutHeaderLengths(c).text, "5.0s");
    assert.equal(cutOriginalSec({ planned_sec: 2, sec: 1, media: { id: "i", kind: "image", seconds: 9 } }), 2);
    assert.equal(cutOriginalSec({ tl_sec: 3, media: { id: "v", kind: "video", seconds: 0 } }), 3);
  });
  it("version status: Best vN with a pick, Latest vN without", () => {
    const vl = [{ id: "a", created: 1 }, { id: "b", created: 2 }, { id: "c", created: 3 }];
    const best = formatCutVersionStatus({ pick: "b", media: { id: "b", kind: "image", width: 1024, height: 576 }, versions_list: vl });
    assert.equal(best.text, "Best v02");
    assert.equal(best.detail, "image · 1024x576");
    const latest = formatCutVersionStatus({ pick: null, media: { id: "c", kind: "video" }, versions_list: vl });
    assert.equal(latest.text, "Latest v03");
    assert.equal(latest.detail, "video");
    assert.deepEqual(formatCutVersionStatus({ media: null }), { text: "", detail: "", title: "No versions yet" });
  });
  it("uses planned_sec as base", () => {
    assert.equal(cutBaseSec({ planned_sec: 5, tl_sec: 4, sec: 3 }), 5);
    assert.equal(cutTimelineSec({ sec: 3.1 }), 3.1);
  });
  it("version info from media", () => {
    const r = formatPickedVersionInfo({
      pick: "v1",
      media: { id: "v1", kind: "video", width: 720, height: 1280 },
      versions_list: [{ id: "v1", created: 1 }],
    });
    assert.match(r.text, /v01/);
    assert.match(r.text, /720x1280/);
  });
});

describe("computeEffectiveSec + lengthWarning", () => {
  it("uses planned_sec when set", () => {
    assert.equal(computeEffectiveSec({ sec: 3, planned_sec: 2 }), 2);
  });

  it("plannedLenInputPlaceholder matches effective sec or 3", () => {
    assert.equal(plannedLenInputPlaceholder({ sec: 3 }), "3");
    assert.equal(plannedLenInputPlaceholder({ sec: 2.5 }), "2.5");
    assert.equal(plannedLenInputPlaceholder({}), "3");
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

describe("clientYToWrapY", () => {
  it("converts viewport Y with offset and scroll", () => {
    assert.equal(clientYToWrapY(215, 260, 50), 5);
    assert.equal(clientYToWrapY(260, 260, 0), 0);
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

  it("last cut onto first row with wrap offset and scroll", () => {
    const order = ["a", "b", "c"];
    const rows = [
      { id: "a", top: 0, bottom: 20, groupId: "scene1" },
      { id: "b", top: 20, bottom: 40, groupId: "scene1" },
      { id: "c", top: 40, bottom: 60, groupId: null },
    ];
    const wrapTop = 260;
    const scrollTop = 50;
    const wrapY = clientYToWrapY(215, wrapTop, scrollTop);
    const t = shotsDropTarget(order, rows, wrapY);
    assert.equal(t.toIndex, 0);
    assert.equal(t.toGroupId, "scene1");
    assert.equal(t.lineY, 0);
  });
});

describe("autoScrollDelta", () => {
  it("scrolls up when pointer is above the wrap", () => {
    assert.ok(autoScrollDelta(100, 200, 600, 48, 16) < 0);
  });
  it("scrolls down when pointer is below the wrap", () => {
    assert.ok(autoScrollDelta(700, 200, 600, 48, 16) > 0);
  });
  it("returns zero in the middle band", () => {
    assert.equal(autoScrollDelta(400, 200, 600, 48, 16), 0);
  });
  it("is stronger nearer the top edge", () => {
    const near = Math.abs(autoScrollDelta(210, 200, 600, 48, 16));
    const far = Math.abs(autoScrollDelta(230, 200, 600, 48, 16));
    assert.ok(near > far);
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

describe("addCutTarget", () => {
  const cuts = [
    { id: "a", group_id: "g1" },
    { id: "b", group_id: "g1" },
    { id: "c", group_id: "" },
  ];

  it("uses active cut scene and after", () => {
    assert.deepEqual(addCutTarget({ timelineCuts: cuts, activeCutId: "a" }), {
      after: "a",
      group: "g1",
    });
  });

  it("last cut when nothing selected", () => {
    assert.deepEqual(addCutTarget({ timelineCuts: cuts, activeCutId: null }), {
      after: "c",
      group: null,
    });
  });

  it("inherits Scene 1 for fresh project tail", () => {
    const fresh = [{ id: "cut1", group_id: "scene1" }];
    assert.deepEqual(addCutTarget({ timelineCuts: fresh, activeCutId: null }), {
      after: "cut1",
      group: "scene1",
    });
  });
});
