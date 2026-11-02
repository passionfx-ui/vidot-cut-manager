import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { versionInfoFields, versionInfoPanelRows, versionDisplayType } from "../../web/gg_version_info_core.js";

describe("version_info_core", () => {
  const cut = { media: { id: "v1", seconds: 2 }, versions_list: [{ id: "v1", kind: "video", seconds: 2 }] };

  it("types image vs video (animated counts as video)", () => {
    assert.equal(versionDisplayType({ kind: "image" }), "image");
    assert.equal(versionDisplayType({ kind: "video" }), "video");
    assert.equal(versionDisplayType({ kind: "image", animated: true }), "video");
    assert.equal(versionDisplayType(null), "-");
    assert.equal(versionDisplayType({ kind: "image", missing: true }), "-");
  });

  it("keeps duration/fps rows for images as a dash and omits file name and creation time", () => {
    const img = versionInfoFields(
      { id: "a", kind: "image", width: 100, height: 50, seed: 7, model: "Z-Image", filename: "a.png", created: 1 },
      cut,
      new Map(),
      24,
    );
    const rows = versionInfoPanelRows(img);
    assert.deepEqual(rows.map((r) => r.label), ["Type", "Resolution", "Duration", "FPS", "Seed", "Workflow"]);
    assert.deepEqual(rows.map((r) => r.value), ["image", "100×50", "-", "-", "7", "Z-Image"]);
    assert.ok(!rows.some((r) => /filename|created|a\.png/i.test(r.label) || r.value === "a.png"));
  });

  it("shows duration and fps for video, unknown values as dash", () => {
    const vid = versionInfoFields({ id: "v1", kind: "video", seconds: 2, width: 1920, height: 1080 }, cut, new Map(), 24);
    const rows = versionInfoPanelRows(vid);
    assert.ok(rows.some((r) => r.label === "Duration" && r.value === "0:02"));
    assert.ok(rows.some((r) => r.label === "FPS" && r.value === "24"));
    const unk = versionInfoFields({ id: "v1", kind: "video" }, { versions_list: [] }, new Map(), 0);
    const urows = versionInfoPanelRows(unk);
    for (const label of ["Resolution", "Duration", "Seed", "Workflow"]) {
      assert.equal(urows.find((r) => r.label === label).value, "-", label);
    }
    assert.equal(urows.find((r) => r.label === "FPS").value, "-");
  });

  it("prefers the version fps and workflow name when there is no model", () => {
    const vid = versionInfoFields(
      { id: "v1", kind: "video", seconds: 2, fps: 12.2, workflow_name: "LTX" },
      cut,
      new Map(),
      24,
    );
    const rows = versionInfoPanelRows(vid);
    assert.equal(rows.find((r) => r.label === "FPS").value, "12");
    assert.equal(rows.find((r) => r.label === "Workflow").value, "LTX");
  });
});
