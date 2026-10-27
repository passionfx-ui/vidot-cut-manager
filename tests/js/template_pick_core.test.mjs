import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  LAST_TEMPLATE_KEY,
  loadLastTemplate,
  saveLastTemplate,
  filterTemplatePaths,
  isInternalWorkflowPath,
  pickInitialTemplate,
  shortTemplateName,
  userTemplatePaths,
} from "../../web/gg_template_pick_core.js";

function mockStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
  };
}

describe("loadLastTemplate / saveLastTemplate", () => {
  it("round-trips non-empty ref", () => {
    const s = mockStorage();
    saveLastTemplate(s, "foo/bar.json");
    assert.equal(loadLastTemplate(s), "foo/bar.json");
    assert.equal(s.getItem(LAST_TEMPLATE_KEY), "foo/bar.json");
  });

  it("empty ref does not clear prior last", () => {
    const s = mockStorage();
    saveLastTemplate(s, "keep.json");
    saveLastTemplate(s, "");
    saveLastTemplate(s, "   ");
    assert.equal(loadLastTemplate(s), "keep.json");
  });
});

describe("pickInitialTemplate", () => {
  it("returns last when in list", () => {
    assert.equal(pickInitialTemplate(["a.json", "b.json"], "b.json"), "b.json");
  });

  it("returns empty when last missing", () => {
    assert.equal(pickInitialTemplate(["a.json"], "z.json"), "");
    assert.equal(pickInitialTemplate([], "a.json"), "");
  });
});

describe("isInternalWorkflowPath", () => {
  it("matches gonggan prefix case-insensitively", () => {
    assert.equal(isInternalWorkflowPath("gonggan/cut/foo.json"), true);
    assert.equal(isInternalWorkflowPath("Gonggan/bar.json"), true);
    assert.equal(isInternalWorkflowPath("GONGGAN\\x.json"), true);
  });

  it("does not match other folders", () => {
    assert.equal(isInternalWorkflowPath("xpu_latest/x.json"), false);
    assert.equal(isInternalWorkflowPath("notgonggan/x.json"), false);
  });
});

describe("userTemplatePaths", () => {
  const paths = ["alpha/x.json", "gonggan/internal.json", "xpu_latest/x.json"];

  it("hides internal workflows", () => {
    assert.deepEqual(userTemplatePaths(paths, ""), ["alpha/x.json", "xpu_latest/x.json"]);
  });

  it("keeps selected internal ref", () => {
    assert.deepEqual(userTemplatePaths(paths, "gonggan/internal.json"), paths);
  });
});

describe("filterTemplatePaths", () => {
  const paths = ["alpha/x.json", "beta/y.json", "gamma/z.json"];

  it("filters case-insensitively", () => {
    const out = filterTemplatePaths(paths, "BETA", "");
    assert.deepEqual(out, ["beta/y.json"]);
  });

  it("keeps selected path even when query excludes it", () => {
    const out = filterTemplatePaths(paths, "alpha", "gamma/z.json");
    assert.deepEqual(out, ["alpha/x.json", "gamma/z.json"]);
  });

  it("empty query returns all sorted", () => {
    assert.deepEqual(filterTemplatePaths(paths, "", ""), paths);
  });

  it("excludes internal gonggan paths unless kept", () => {
    const mixed = ["a.json", "gonggan/cut/w.json", "b.json"];
    assert.deepEqual(filterTemplatePaths(mixed, "", ""), ["a.json", "b.json"]);
    assert.deepEqual(filterTemplatePaths(mixed, "", "gonggan/cut/w.json"), mixed.sort((a, b) => a.localeCompare(b)));
  });
});

describe("shortTemplateName", () => {
  it("uses basename when shorter", () => {
    assert.equal(shortTemplateName("workflows/deep/name.json", 40), "name.json");
  });

  it("truncates long basename", () => {
    const long = "abcdefghijklmnop.json";
    const s = shortTemplateName(`dir/${long}`, 12);
    assert.equal(s.length, 12);
    assert.ok(s.endsWith("…"));
  });
});
