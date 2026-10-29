import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  displayWorkflowFilename,
  formatShotTabLabel,
  formatShotTabTitle,
  normalizeTabDescriptor,
  planTabLabels,
  shotTabCutParts,
} from "../../web/gg_tab_label_core.js";

describe("shotTabCutParts", () => {
  const tl = (cuts, groups = []) => ({ cuts, groups });
  const label = (projectName, cut, timeline) => formatShotTabLabel({ projectName, ...shotTabCutParts(cut, timeline) });

  it("scene name from group, per-scene cut label", () => {
    const cuts = [
      { id: "a", group_id: "g1" },
      { id: "b", group_id: "g1" },
      { id: "c", group_id: "g1" },
      { id: "d", group_id: "g1" },
    ];
    const t = tl(cuts, [{ id: "g1", name: "scene1" }]);
    assert.deepEqual(shotTabCutParts(cuts[3], t), { sceneName: "scene1", cutLabel: "1-4" });
    assert.equal(label("놀이터에서", cuts[3], t), "놀이터에서/scene1 1-4");
  });

  it("ungrouped cut has no scene", () => {
    const cuts = [{ id: "a", group_id: "g1" }, { id: "b", group_id: "" }];
    const t = tl(cuts, [{ id: "g1", name: "S" }]);
    assert.equal(label("P", cuts[1], t), "P/2-1");
  });

  it("falls back to cut.group_name when groups list lacks the id", () => {
    const cuts = [{ id: "a", group_id: "g9", group_name: "Legacy" }];
    assert.equal(label("P", cuts[0], tl(cuts)), "P/Legacy 1-1");
  });

  it("reorder changes the label", () => {
    const a = { id: "a", group_id: "g1" };
    const b = { id: "b", group_id: "g1" };
    const groups = [{ id: "g1", name: "S" }];
    assert.equal(label("P", b, tl([a, b], groups)), "P/S 1-2");
    assert.equal(label("P", b, tl([b, a], groups)), "P/S 1-1");
  });

  it("group / ungroup / move scene changes the label", () => {
    const groups = [{ id: "g1", name: "S1" }, { id: "g2", name: "S2" }];
    const a = { id: "a", group_id: "g1" };
    const b = { id: "b", group_id: "" };
    assert.equal(label("P", b, tl([a, b], groups)), "P/2-1");
    b.group_id = "g1";
    assert.equal(label("P", b, tl([a, b], groups)), "P/S1 1-2");
    b.group_id = "g2";
    assert.equal(label("P", b, tl([a, b], groups)), "P/S2 2-1");
  });

  it("scene rename and project rename change the label", () => {
    const a = { id: "a", group_id: "g1" };
    assert.equal(label("P", a, tl([a], [{ id: "g1", name: "Old" }])), "P/Old 1-1");
    assert.equal(label("P", a, tl([a], [{ id: "g1", name: "New" }])), "P/New 1-1");
    assert.equal(label("Q", a, tl([a], [{ id: "g1", name: "New" }])), "Q/New 1-1");
  });

  it("cut rename changes only the tooltip", () => {
    const a = { id: "a", group_id: "", name: "그네" };
    const t = tl([a]);
    const title = (cut) => formatShotTabTitle({ projectName: "P", ...shotTabCutParts(cut, t), cutName: cut.name });
    assert.equal(title(a), "P/1-1 · 그네");
    a.name = "미끄럼틀";
    assert.equal(title(a), "P/1-1 · 미끄럼틀");
    assert.equal(label("P", a, t), "P/1-1");
  });

  it("reference uses its name", () => {
    assert.deepEqual(shotTabCutParts({ id: "r", kind: "reference", name: "Hero" }, tl([])), {
      sceneName: "",
      cutLabel: "Hero",
    });
  });
});

describe("formatShotTabLabel", () => {
  it("project/scene cutLabel", () => {
    assert.equal(
      formatShotTabLabel({ projectName: "놀이터에서", sceneName: "scene1", cutLabel: "1-4" }),
      "놀이터에서/scene1 1-4"
    );
  });

  it("project/cutLabel when not in a scene", () => {
    assert.equal(formatShotTabLabel({ projectName: "놀이터에서", sceneName: "", cutLabel: "2-1" }), "놀이터에서/2-1");
    assert.equal(formatShotTabLabel({ projectName: "My Film", cutLabel: "1-1" }), "My Film/1-1");
  });

  it("null when project empty", () => {
    assert.equal(formatShotTabLabel({ projectName: "", cutLabel: "1-1" }), null);
    assert.equal(formatShotTabLabel({ projectName: "   ", cutLabel: "1-1" }), null);
  });

  it("trim and collapse whitespace", () => {
    assert.equal(
      formatShotTabLabel({ projectName: "  A   B  ", sceneName: "  s   1 ", cutLabel: " 1-2 " }),
      "A B/s 1 1-2"
    );
    assert.equal(formatShotTabLabel({ projectName: "P", sceneName: "   ", cutLabel: "1-1" }), "P/1-1");
  });

  it("missing cut label falls back", () => {
    assert.equal(formatShotTabLabel({ projectName: "P", cutLabel: "" }), "P/Untitled cut");
  });

  it("edited marker after cut label", () => {
    assert.equal(
      formatShotTabLabel({ projectName: "P", sceneName: "Intro", cutLabel: "1-2", edited: true }),
      "P/Intro 1-2 *"
    );
    assert.equal(formatShotTabLabel({ projectName: "P", cutLabel: "3-1", edited: true }), "P/3-1 *");
  });

  it("allows slash in names", () => {
    assert.equal(formatShotTabLabel({ projectName: "A/B", sceneName: "C/D", cutLabel: "1-1" }), "A/B/C/D 1-1");
  });

  it("truncates long project first", () => {
    const label = formatShotTabLabel({
      projectName: "My very long project name here",
      sceneName: "scene1",
      cutLabel: "1-4",
    });
    assert.equal(label, "My very long pro…/scene1 1-4");
    assert.equal(label.length, 28);
  });

  it("then truncates scene, keeping cut label and marker whole", () => {
    const label = formatShotTabLabel({
      projectName: "Extremely long project title here",
      sceneName: "A very long scene name that keeps going",
      cutLabel: "12-34",
      edited: true,
    });
    assert.ok(label.length <= 28);
    assert.ok(label.startsWith("Extrem…/"));
    assert.ok(label.endsWith("… 12-34 *"));
  });

  it("long project without scene keeps cut label", () => {
    const label = formatShotTabLabel({ projectName: "x".repeat(60), cutLabel: "10-12" });
    assert.ok(label.length <= 28);
    assert.ok(label.endsWith("…/10-12"));
  });

  it("formatShotTabTitle is full string with cut name", () => {
    const long = "My very long project name here";
    assert.equal(
      formatShotTabTitle({ projectName: long, sceneName: "scene1", cutLabel: "1-4", cutName: "그네" }),
      `${long}/scene1 1-4 · 그네`
    );
    assert.equal(formatShotTabTitle({ projectName: "P", cutLabel: "1-1", cutName: "  " }), "P/1-1");
    assert.equal(formatShotTabTitle({ projectName: "", cutLabel: "1-1" }), null);
  });
});

function applyPlan(tabs, plan) {
  return tabs.map((t, i) => {
    const p = plan.find((x) => x.index === i);
    if (!p || p.action === "none") return { ...t };
    if (p.action === "set") {
      const orig = t.orig != null && t.orig !== "" ? t.orig : t.text;
      return { text: p.text, orig };
    }
    return { text: p.text, orig: "" };
  });
}

describe("planTabLabels", () => {
  it("index match sets label", () => {
    const plan = planTabLabels({
      tabs: [{ text: "cut-a.json", orig: "" }],
      workflows: [{ filename: "cut-a.json", label: "Proj / Cut A" }],
    });
    assert.deepEqual(plan, [{ index: 0, action: "set", text: "Proj / Cut A" }]);
  });

  it("tolerates .json mismatch on index align", () => {
    const plan = planTabLabels({
      tabs: [{ text: "foo", orig: "" }],
      workflows: [{ filename: "foo.json", label: "P / C" }],
    });
    assert.equal(plan[0].action, "set");
  });

  it("non-owned tab untouched", () => {
    const plan = planTabLabels({
      tabs: [{ text: "other.json", orig: "" }],
      workflows: [{ filename: "other.json", label: null }],
    });
    assert.equal(plan[0].action, "none");
  });

  it("restore when label cleared", () => {
    const plan = planTabLabels({
      tabs: [{ text: "P / X", orig: "cut.json" }],
      workflows: [{ filename: "cut.json", label: null }],
    });
    assert.deepEqual(plan[0], { index: 0, action: "restore", text: "cut" });
  });

  it("restore prefers current workflow filename after rename", () => {
    const plan = planTabLabels({
      tabs: [{ text: "P / X", orig: "old-tab.json" }],
      workflows: [{ filename: "gonggan/proj/renamed-cut.json", label: null }],
    });
    assert.deepEqual(plan[0], { index: 0, action: "restore", text: "renamed-cut" });
  });

  it("idempotent after apply", () => {
    const tabs0 = [{ text: "a.json", orig: "" }];
    const wfs = [{ filename: "a.json", label: "P / A" }];
    const plan1 = planTabLabels({ tabs: tabs0, workflows: wfs });
    const tabs1 = applyPlan(tabs0, plan1);
    const plan2 = planTabLabels({ tabs: tabs1, workflows: wfs });
    assert.ok(plan2.every((p) => p.action === "none"));
  });

  it("filename mismatch falls back to unique text match", () => {
    const plan = planTabLabels({
      tabs: [{ text: "wrong-label", orig: "only.json" }, { text: "b.json", orig: "" }],
      workflows: [
        { filename: "x.json", label: null },
        { filename: "only.json", label: "P / One" },
      ],
    });
    assert.equal(plan[0].action, "set");
    assert.equal(plan[0].text, "P / One");
  });

  it("duplicate filenames fallback to none for ambiguous", () => {
    const plan = planTabLabels({
      tabs: [{ text: "dup.json", orig: "" }],
      workflows: [
        { filename: "dup.json", label: "A" },
        { filename: "dup.json", label: "B" },
      ],
    });
    assert.equal(plan[0].action, "none");
  });

  it("vue overwrite clears stale orig before plan", () => {
    const raw = { text: "renamed-file.json", orig: "old-file.json", set: "Proj / Cut" };
    const tab = normalizeTabDescriptor(raw);
    assert.equal(tab.orig, "");
    const plan = planTabLabels({
      tabs: [tab],
      workflows: [{ filename: "renamed-file.json", label: null }],
    });
    assert.equal(plan[0].action, "none");
  });

  it("length mismatch uses unique filename only", () => {
    const plan = planTabLabels({
      tabs: [{ text: "solo.json", orig: "" }, { text: "extra.json", orig: "" }],
      workflows: [{ filename: "solo.json", label: "P / S" }],
    });
    assert.equal(plan[0].action, "set");
    assert.equal(plan[1].action, "none");
  });
});

describe("normalizeTabDescriptor", () => {
  it("keeps orig when override still shown", () => {
    assert.deepEqual(
      normalizeTabDescriptor({ text: "P / A", orig: "a.json", set: "P / A" }),
      { text: "P / A", orig: "a.json" }
    );
  });

  it("drops orig when Vue changed tab text", () => {
    assert.deepEqual(
      normalizeTabDescriptor({ text: "new.json", orig: "old.json", set: "P / A" }),
      { text: "new.json", orig: "" }
    );
  });
});

describe("displayWorkflowFilename", () => {
  it("strips folders and extension", () => {
    assert.equal(displayWorkflowFilename("gonggan/foo/cut1.json"), "cut1");
  });
});
