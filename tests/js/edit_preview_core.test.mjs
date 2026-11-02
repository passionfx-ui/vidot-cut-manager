import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  EDIT_MODE_LABEL,
  EDIT_PREVIEW_GAP_PX,
  editPreviewOverlayRect,
  editPreviewStill,
  loadEditPreviewMode,
  saveEditPreviewMode,
} from "../../web/gg_edit_preview_core.js";

function storage() {
  const mem = new Map();
  return { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v) };
}

const graph = { left: 40, top: 36, right: 1280, bottom: 900, width: 1240, height: 864 };

describe("edit preview toggle", () => {
  it("starts off and remembers the Edit toggle", () => {
    const s = storage();
    assert.equal(EDIT_MODE_LABEL, "Edit Mode");
    assert.equal(loadEditPreviewMode(s), false);
    saveEditPreviewMode(s, true);
    assert.equal(loadEditPreviewMode(s), true);
    saveEditPreviewMode(s, false);
    assert.equal(loadEditPreviewMode(s), false);
  });
});

describe("edit preview still", () => {
  it("uses the image file for a still cut and the poster for video", () => {
    assert.deepEqual(editPreviewStill({ id: "img1", kind: "image" }), { id: "img1", kind: "image" });
    assert.deepEqual(editPreviewStill({ id: "vid1", kind: "video" }), { id: "vid1", kind: "poster" });
    assert.deepEqual(
      editPreviewStill({ id: "webp1", kind: "video", animated: true }),
      { id: "webp1", kind: "poster" },
    );
  });

  it("has no still when the cut has no media", () => {
    assert.equal(editPreviewStill(null), null);
    assert.equal(editPreviewStill({}), null);
    assert.equal(editPreviewStill({ id: "", kind: "image" }), null);
  });
});

describe("edit preview overlay rect", () => {
  const open = {
    graphRect: graph,
    toolbarBottom: 72,
    shotsRect: { left: 40, top: 72, right: 260, bottom: 820, width: 220, height: 748 },
    rightPanelLeft: 1100,
    rightDockerLeft: 1240,
    bottomPanelTop: 820,
  };

  it("sits below the toolbar, above the bottom panel, and inside open side panels", () => {
    const box = editPreviewOverlayRect(open);
    const gap = EDIT_PREVIEW_GAP_PX;
    assert.equal(box.top, 72 + gap);
    assert.equal(box.left, 260 + gap);
    assert.equal(box.right, 1100 - gap);
    assert.equal(box.bottom, 820 - gap);
    assert.ok(box.top >= open.toolbarBottom);
    assert.ok(box.right <= open.rightDockerLeft);
    assert.ok(box.right <= open.rightPanelLeft);
    assert.ok(box.bottom <= open.bottomPanelTop);
    assert.equal(box.width, box.right - box.left);
    assert.equal(box.height, box.bottom - box.top);
  });

  it("resizes when the side panels, toolbar, or bottom panel change", () => {
    const base = editPreviewOverlayRect(open);
    const widerShots = editPreviewOverlayRect({
      ...open,
      shotsRect: { ...open.shotsRect, right: 340, width: 300 },
    });
    const narrowerRight = editPreviewOverlayRect({ ...open, rightPanelLeft: 980 });
    const tallerToolbar = editPreviewOverlayRect({ ...open, toolbarBottom: 100 });
    const higherBottom = editPreviewOverlayRect({ ...open, bottomPanelTop: 700 });
    assert.ok(widerShots.left > base.left);
    assert.ok(narrowerRight.right < base.right);
    assert.ok(tallerToolbar.top > base.top);
    assert.ok(higherBottom.bottom < base.bottom);
    assert.equal(widerShots.right, base.right);
    assert.equal(narrowerRight.left, base.left);
  });

  it("uses the full graph width when side panels are closed and still clears the right docker", () => {
    const box = editPreviewOverlayRect({
      graphRect: graph,
      toolbarBottom: 72,
      shotsRect: null,
      rightPanelLeft: null,
      rightDockerLeft: 1240,
      bottomPanelTop: 820,
    });
    assert.equal(box.left, graph.left);
    assert.equal(box.right, 1240 - EDIT_PREVIEW_GAP_PX);
  });

  it("does not invent a box that would cover the toolbar or the right docker", () => {
    assert.equal(editPreviewOverlayRect({ graphRect: null }), null);
    assert.equal(
      editPreviewOverlayRect({
        ...open,
        toolbarBottom: 860,
      }),
      null,
    );
    assert.equal(
      editPreviewOverlayRect({
        ...open,
        rightDockerLeft: 280,
      }),
      null,
    );
  });
});
