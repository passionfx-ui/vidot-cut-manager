import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  cutHeaderParts,
  displayWorkflowFilename,
  formatShotTabLabel,
  formatShotTabTitle,
  normalizeTabDescriptor,
  planTabLabels,
  sceneLabelOrDefault,
  shotTabCutParts,
} from "../../web/gg_tab_label_core.js";
import { computeCutLabels } from "../../web/gg_cuts_core.js";

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
    assert.equal(label("놀이터에서", cuts[3], t), "1-4 scene1 / 놀이터에서");
  });

  it("ungrouped cut uses Scene", () => {
    const cuts = [{ id: "a", group_id: "g1" }, { id: "b", group_id: "" }];
    const t = tl(cuts, [{ id: "g1", name: "S" }]);
    assert.equal(label("P", cuts[1], t), "2-1 Scene / P");
  });

  it("empty scene name uses Scene", () => {
    const cuts = [{ id: "a", group_id: "g1" }];
    assert.equal(label("놀이터에서", cuts[0], tl(cuts, [{ id: "g1", name: "" }])), "1-1 Scene / 놀이터에서");
  });

  it("falls back to cut.group_name when groups list lacks the id", () => {
    const cuts = [{ id: "a", group_id: "g9", group_name: "Legacy" }];
    assert.equal(label("P", cuts[0], tl(cuts)), "1-1 Legacy / P");
  });

  it("reorder changes the label", () => {
    const a = { id: "a", group_id: "g1" };
    const b = { id: "b", group_id: "g1" };
    const groups = [{ id: "g1", name: "S" }];
    assert.equal(label("P", b, tl([a, b], groups)), "1-2 S / P");
    assert.equal(label("P", b, tl([b, a], groups)), "1-1 S / P");
  });

  it("group / ungroup / move scene changes the label", () => {
    const groups = [{ id: "g1", name: "S1" }, { id: "g2", name: "S2" }];
    const a = { id: "a", group_id: "g1" };
    const b = { id: "b", group_id: "" };
    assert.equal(label("P", b, tl([a, b], groups)), "2-1 Scene / P");
    b.group_id = "g1";
    assert.equal(label("P", b, tl([a, b], groups)), "1-2 S1 / P");
    b.group_id = "g2";
    assert.equal(label("P", b, tl([a, b], groups)), "2-1 S2 / P");
  });

  it("scene rename and project rename change the label", () => {
    const a = { id: "a", group_id: "g1" };
    assert.equal(label("P", a, tl([a], [{ id: "g1", name: "Old" }])), "1-1 Old / P");
    assert.equal(label("P", a, tl([a], [{ id: "g1", name: "New" }])), "1-1 New / P");
    assert.equal(label("Q", a, tl([a], [{ id: "g1", name: "New" }])), "1-1 New / Q");
  });

  it("cut rename changes only the tooltip", () => {
    const a = { id: "a", group_id: "", name: "그네" };
    const t = tl([a]);
    const title = (cut) => formatShotTabTitle({ projectName: "P", ...shotTabCutParts(cut, t), cutName: cut.name });
    assert.equal(title(a), "P/1-1 · 그네");
    a.name = "미끄럼틀";
    assert.equal(title(a), "P/1-1 · 미끄럼틀");
    assert.equal(label("P", a, t), "1-1 Scene / P");
  });

  it("reference uses its name", () => {
    assert.deepEqual(shotTabCutParts({ id: "r", kind: "reference", name: "Hero" }, tl([])), {
      sceneName: "",
      cutLabel: "Hero",
    });
  });
});

describe("cutHeaderParts (cut card header <cutLabel> <CutName>, no scene name)", () => {
  const groups = [{ id: "g1", name: "Scene1" }, { id: "g2", name: "  " }];
  const cuts = [
    { id: "a", group_id: "g1", name: "A" },
    { id: "b", group_id: "g1", name: "B" },
    { id: "c", group_id: "g1", name: "C" },
    { id: "d", group_id: "g1", name: "  New   cut " },
    { id: "e", group_id: "", name: "Solo" },
    { id: "f", group_id: "g2", name: "" },
  ];
  const t = { cuts, groups };
  it("<cutLabel> <CutName>, scene name left out", () => {
    assert.deepEqual(cutHeaderParts(cuts[3], t), { cutLabel: "1-4", name: "New cut" });
    // Ungrouped cuts are numbered after every scene (the Ungrouped section is listed last).
    assert.deepEqual(cutHeaderParts(cuts[4], t), { cutLabel: "3-1", name: "Solo" });
  });
  it("empty cut name -> (untitled)", () => {
    assert.deepEqual(cutHeaderParts(cuts[5], t), { cutLabel: "2-1", name: "(untitled)" });
  });
  it("reference: its name is the label, no repeat", () => {
    assert.deepEqual(cutHeaderParts({ id: "r", kind: "reference", name: "Hero" }, t), { cutLabel: "Hero", name: "" });
  });
  it("sceneLabelOrDefault (tab label scene word)", () => {
    assert.equal(sceneLabelOrDefault(""), "Scene");
    assert.equal(sceneLabelOrDefault("  Intro  "), "Intro");
  });
  it("precomputed labels give the same result", () => {
    assert.deepEqual(cutHeaderParts(cuts[1], t, computeCutLabels(t)), cutHeaderParts(cuts[1], t));
  });
});

describe("formatShotTabLabel", () => {
  it("cutLabel scene / project", () => {
    assert.equal(
      formatShotTabLabel({ projectName: "놀이터에서", sceneName: "Scene1", cutLabel: "1-4" }),
      "1-4 Scene1 / 놀이터에서"
    );
  });

  it("cutLabel Scene / project when not in a scene", () => {
    assert.equal(formatShotTabLabel({ projectName: "놀이터에서", sceneName: "", cutLabel: "4" }), "4 Scene / 놀이터에서");
    assert.equal(formatShotTabLabel({ projectName: "My Film", cutLabel: "1-1" }), "1-1 Scene / My Film");
  });

  it("null when project empty", () => {
    assert.equal(formatShotTabLabel({ projectName: "", cutLabel: "1-1" }), null);
    assert.equal(formatShotTabLabel({ projectName: "   ", cutLabel: "1-1" }), null);
  });

  it("trim and collapse whitespace", () => {
    assert.equal(
      formatShotTabLabel({ projectName: "  A   B  ", sceneName: "  s   1 ", cutLabel: " 1-2 " }),
      "1-2 s 1 / A B"
    );
    assert.equal(formatShotTabLabel({ projectName: "P", sceneName: "   ", cutLabel: "1-1" }), "1-1 Scene / P");
  });

  it("missing cut label falls back", () => {
    assert.equal(formatShotTabLabel({ projectName: "P", cutLabel: "" }), "Untitled cut Scene / P");
  });

  it("edited marker at the end", () => {
    assert.equal(
      formatShotTabLabel({ projectName: "P", sceneName: "Intro", cutLabel: "1-2", edited: true }),
      "1-2 Intro / P *"
    );
    assert.equal(formatShotTabLabel({ projectName: "P", cutLabel: "3-1", edited: true }), "3-1 Scene / P *");
  });

  it("allows slash in names", () => {
    assert.equal(formatShotTabLabel({ projectName: "A/B", sceneName: "C/D", cutLabel: "1-1" }), "1-1 C/D / A/B");
  });

  it("truncates long project first", () => {
    const label = formatShotTabLabel({
      projectName: "My very long project name here",
      sceneName: "scene1",
      cutLabel: "1-4",
    });
    assert.equal(label, "1-4 scene1 / My very long p…");
    assert.equal(label.length, 28);
  });

  it("truncated project keeps the edited marker", () => {
    const label = formatShotTabLabel({
      projectName: "My very long project name here",
      sceneName: "scene1",
      cutLabel: "1-4",
      edited: true,
    });
    assert.equal(label, "1-4 scene1 / My very long… *");
  });

  it("then truncates scene, keeping cut label and marker whole", () => {
    const label = formatShotTabLabel({
      projectName: "Extremely long project title here",
      sceneName: "A very long scene name that keeps going",
      cutLabel: "12-34",
      edited: true,
    });
    assert.equal(label, "12-34 A very lo… / Extrem… *");
  });

  it("long project without scene keeps cut label", () => {
    const label = formatShotTabLabel({ projectName: "x".repeat(60), cutLabel: "10-12" });
    assert.ok(label.length <= 28);
    assert.ok(label.startsWith("10-12 Scene / x"));
    assert.ok(label.endsWith("…"));
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
