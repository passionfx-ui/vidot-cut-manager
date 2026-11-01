import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  PROJECT_LIST_REFRESH_MIN_MS,
  projectRowButtonsOrderedPlusBeforeGear,
  projectSelectOptionsHtml,
  shouldRefreshProjectList,
} from "../../web/gg_proj_list_refresh_core.js";

describe("shouldRefreshProjectList", () => {
  it("debounces within min interval", () => {
    assert.equal(shouldRefreshProjectList(2000, 0), true);
    assert.equal(shouldRefreshProjectList(2000, 1000, PROJECT_LIST_REFRESH_MIN_MS), false);
    assert.equal(shouldRefreshProjectList(3000, 1000, PROJECT_LIST_REFRESH_MIN_MS), true);
  });
});

describe("projectRowButtonsOrderedPlusBeforeGear", () => {
  it("requires + before gear", () => {
    assert.equal(
      projectRowButtonsOrderedPlusBeforeGear(["gg-btn gg-new-project-head", "gg-btn gg-proj-settings"]),
      true,
    );
    assert.equal(
      projectRowButtonsOrderedPlusBeforeGear(["gg-btn gg-proj-settings", "gg-btn gg-new-project-head"]),
      false,
    );
  });
});

describe("projectSelectOptionsHtml", () => {
  it("marks selected project", () => {
    const esc = (s) => s;
    const label = (p) => p.name;
    const html = projectSelectOptionsHtml([{ id: "a", name: "A" }, { id: "b", name: "B" }], "b", esc, label);
    assert.match(html, /value="b" selected/);
    assert.doesNotMatch(html, /value="a" selected/);
  });
});
