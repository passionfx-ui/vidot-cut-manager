import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  findMissingLoadImages,
  missingLoadImageReport,
  formatMissingImageToast,
  formatQueueBlockedToast,
  parseImageWidgetValue,
  isLoadImageCandidate,
  isNodeSkipped,
} from "../../web/gg_loadimage_core.js";

function loadNode(overrides) {
  return {
    id: 1,
    type: "LoadImage",
    mode: 0,
    title: "My Loader",
    widgets: [{ name: "image", type: "combo", value: "a.png", options: { values: ["a.png", "b.png"] } }],
    ...overrides,
  };
}

describe("isNodeSkipped", () => {
  it("skips mode 2 and 4", () => {
    assert.equal(isNodeSkipped({ mode: 2 }), true);
    assert.equal(isNodeSkipped({ mode: 4 }), true);
    assert.equal(isNodeSkipped({ mode: 0 }), false);
  });
});

describe("findMissingLoadImages", () => {
  it("present file in combo is not missing", () => {
    const g = { nodes: [loadNode({})] };
    const missing = findMissingLoadImages(g, () => false);
    assert.equal(missing.length, 0);
  });

  it("missing file not in combo", () => {
    const g = {
      nodes: [
        loadNode({
          widgets: [{ name: "image", value: "gone.png", options: { values: ["a.png", "b.png"] } }],
        }),
      ],
    };
    const missing = findMissingLoadImages(g, () => true);
    assert.equal(missing.length, 1);
    assert.equal(missing[0].ref.filename, "gone.png");
  });

  it("empty value ignored", () => {
    const g = { nodes: [loadNode({ widgets: [{ name: "image", value: "", options: { values: ["a.png"] } }] })] };
    assert.equal(findMissingLoadImages(g, () => false).length, 0);
  });

  it("subfolder path in value", () => {
    const g = {
      nodes: [
        loadNode({
          widgets: [
            {
              name: "image",
              value: "nested/shot.png",
              options: { values: ["nested/shot.png [input]", "a.png [input]"] },
            },
          ],
        }),
      ],
    };
    assert.equal(findMissingLoadImages(g, () => false).length, 0);
    g.nodes[0].widgets[0].value = "nested/missing.png";
    assert.equal(findMissingLoadImages(g, () => false).length, 1);
  });

  it("annotated [input] combo values", () => {
    const g = {
      nodes: [
        loadNode({
          widgets: [{ name: "image", value: "a.png", options: { values: ["a.png [input]"] } }],
        }),
      ],
    };
    assert.equal(findMissingLoadImages(g, () => false).length, 0);
  });

  it("muted/bypassed nodes skipped", () => {
    const g = {
      nodes: [
        loadNode({ mode: 2, widgets: [{ name: "image", value: "gone.png", options: { values: ["a.png"] } }] }),
        loadNode({ id: 2, mode: 4, widgets: [{ name: "image", value: "gone2.png", options: { values: ["a.png"] } }] }),
      ],
    };
    assert.equal(findMissingLoadImages(g, () => false).length, 0);
  });

  it("multiple missing reports first and count", () => {
    const g = {
      nodes: [
        loadNode({ id: 1, title: "A", widgets: [{ name: "image", value: "x.png", options: { values: [] } }] }),
        loadNode({ id: 2, title: "B", widgets: [{ name: "image", value: "y.png", options: { values: [] } }] }),
      ],
    };
    const missing = findMissingLoadImages(g, () => false);
    assert.equal(missing.length, 2);
    const report = missingLoadImageReport(missing);
    assert.equal(report.count, 2);
    assert.equal(report.first.nodeLabel, "A");
    assert.ok(formatQueueBlockedToast(report).includes("+1 more"));
  });

  it("non-LoadImage nodes ignored", () => {
    const g = {
      nodes: [
        {
          id: 9,
          type: "KSampler",
          mode: 0,
          widgets: [{ name: "image", value: "nope.png", options: { values: [] } }],
        },
      ],
    };
    assert.equal(findMissingLoadImages(g, () => false).length, 0);
    assert.equal(isLoadImageCandidate(g.nodes[0]), false);
  });

  it("exists fallback when combo unknown", () => {
    const g = { nodes: [loadNode({ widgets: [{ name: "image", value: "z.png", options: { values: [] } }] })] };
    assert.equal(findMissingLoadImages(g, () => true).length, 0);
    assert.equal(findMissingLoadImages(g, () => false).length, 1);
  });
});

describe("message formatting", () => {
  it("toast includes file and node", () => {
    const msg = formatMissingImageToast({
      filename: "a.png",
      subfolder: "",
      nodeLabel: "Load",
    });
    assert.equal(msg, "Missing image: a.png (node Load)");
  });

  it("parseImageWidgetValue strips annotation", () => {
    const p = parseImageWidgetValue("foo.png [input]");
    assert.equal(p.filename, "foo.png");
    assert.equal(p.empty, false);
  });
});
