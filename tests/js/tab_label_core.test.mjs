import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatShotTabLabel, planTabLabels } from "../../web/gg_tab_label_core.js";

describe("formatShotTabLabel", () => {
  it("formats project and cut", () => {
    assert.equal(formatShotTabLabel({ projectName: "My Film", cutName: "Intro", cutNumber: 1 }), "My Film / Intro");
  });

  it("null when project empty", () => {
    assert.equal(formatShotTabLabel({ projectName: "", cutName: "A" }), null);
    assert.equal(formatShotTabLabel({ projectName: "   ", cutName: "A" }), null);
  });

  it("trim and collapse whitespace", () => {
    assert.equal(
      formatShotTabLabel({ projectName: "  A   B  ", cutName: "  x   y ", cutNumber: 2 }),
      "A B / x y"
    );
  });

  it("untitled cut and cut number fallback", () => {
    assert.equal(formatShotTabLabel({ projectName: "P", cutName: "", cutNumber: 3 }), "P / Cut 3");
    assert.equal(formatShotTabLabel({ projectName: "P", cutName: "" }), "P / Untitled cut");
  });

  it("allows slash in names", () => {
    assert.equal(formatShotTabLabel({ projectName: "A/B", cutName: "C/D" }), "A/B / C/D");
  });

  it("unicode names", () => {
    assert.equal(formatShotTabLabel({ projectName: "박", cutName: "제비" }), "박 / 제비");
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
    assert.deepEqual(plan[0], { index: 0, action: "restore", text: "cut.json" });
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

  it("length mismatch uses unique filename only", () => {
    const plan = planTabLabels({
      tabs: [{ text: "solo.json", orig: "" }, { text: "extra.json", orig: "" }],
      workflows: [{ filename: "solo.json", label: "P / S" }],
    });
    assert.equal(plan[0].action, "set");
    assert.equal(plan[1].action, "none");
  });
});
