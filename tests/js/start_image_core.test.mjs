import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { syncSavedVideoStartImage, wireCutStartImage } from "../../web/gg_start_image_core.js";

function savedVideo(positional, named) {
  return {
    nodes: [
      {
        id: 78,
        type: "LoadImage",
        title: "Start Image",
        widgets_values: [positional, "image"],
        widgets_values_named: { image: named, upload: "image" },
      },
      { id: 95, type: "LTXVImgToVideo", widgets_values: [768, 512, 97, 1, 1] },
    ],
    links: [],
  };
}

describe("saved video start image", () => {
  it("copies the cut image into widgets_values_named so queue does not keep the old file", () => {
    const wf = savedVideo("gonggan/start_cut.png", "fox.jpg");
    assert.equal(syncSavedVideoStartImage(wf), "78");
    assert.equal(wf.nodes[0].widgets_values[0], "gonggan/start_cut.png");
    assert.equal(wf.nodes[0].widgets_values_named.image, "gonggan/start_cut.png");
    assert.equal(wf.nodes[0].widgets_values_named.upload, "image");
  });

  it("does not rewrite an image workflow", () => {
    const wf = {
      nodes: [
        {
          id: 1,
          type: "LoadImage",
          title: "Start Image",
          widgets_values: ["a.png"],
          widgets_values_named: { image: "b.png" },
        },
        { id: 2, type: "SaveImage" },
      ],
    };
    assert.equal(syncSavedVideoStartImage(wf), null);
    assert.equal(wf.nodes[0].widgets_values_named.image, "b.png");
  });

  it("wires the cut image onto the first LoadImage and an API prompt", () => {
    const ui = {
      nodes: [
        { id: 9, type: "LoadImage", widgets_values: ["old.png"], widgets_values_named: { image: "old.png" } },
        { id: 3, type: "LoadImage", widgets_values: ["keep.png"], widgets_values_named: { image: "keep.png" } },
        { id: 1, type: "LTXVImgToVideo" },
      ],
    };
    assert.equal(wireCutStartImage(ui, "gonggan/start_v.png"), "3");
    assert.equal(ui.nodes[1].widgets_values[0], "gonggan/start_v.png");
    assert.equal(ui.nodes[1].widgets_values_named.image, "gonggan/start_v.png");
    assert.equal(ui.nodes[0].widgets_values_named.image, "old.png");

    const api = {
      5: { class_type: "LoadImage", inputs: { image: "fox.jpg" }, _meta: { title: "Start Image" } },
      6: { class_type: "LTXVImgToVideo", inputs: {} },
    };
    assert.equal(wireCutStartImage(api, "gonggan/start_v.png"), "5");
    assert.equal(api["5"].inputs.image, "gonggan/start_v.png");
  });

  it("a node titled Start Image wins over another LoadImage", () => {
    const wf = {
      nodes: [
        { id: 1, type: "LoadImage", widgets_values: ["a.png"], widgets_values_named: { image: "a.png" } },
        {
          id: 2,
          type: "LoadImage",
          title: "Start Image",
          widgets_values: ["b.png"],
          widgets_values_named: { image: "b.png" },
        },
        { id: 3, type: "SaveAnimatedWEBP" },
      ],
    };
    wireCutStartImage(wf, "gonggan/start_v.png");
    assert.equal(wf.nodes[0].widgets_values_named.image, "a.png");
    assert.equal(wf.nodes[1].widgets_values[0], "gonggan/start_v.png");
    assert.equal(wf.nodes[1].widgets_values_named.image, "gonggan/start_v.png");
  });
});
