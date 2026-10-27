import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  trashButtonLabel,
  normalizeTrashItems,
  formatTrashItem,
} from "../../web/gg_trash_core.js";

describe("trashButtonLabel", () => {
  it("returns empty for zero or invalid", () => {
    assert.equal(trashButtonLabel(0), "");
    assert.equal(trashButtonLabel(-1), "");
    assert.equal(trashButtonLabel("x"), "");
  });
  it("formats count", () => {
    assert.equal(trashButtonLabel(3), "Trash (3)");
  });
});

describe("normalizeTrashItems", () => {
  it("reads items from ok response", () => {
    assert.deepEqual(normalizeTrashItems({ ok: true, items: [{ id: "a" }] }), [{ id: "a" }]);
  });
  it("returns empty on failure", () => {
    assert.deepEqual(normalizeTrashItems({ ok: false }), []);
    assert.deepEqual(normalizeTrashItems(null), []);
  });
});

describe("formatTrashItem", () => {
  const now = Date.parse("2026-10-27T12:00:00.000Z");

  it("includes scene and relative time", () => {
    const r = formatTrashItem(
      { name: "hero", scene_name: "Scene 1", deleted_at: "2026-10-27T11:58:00.000Z" },
      now
    );
    assert.equal(r.title, "hero");
    assert.match(r.sub, /Scene 1/);
    assert.match(r.sub, /deleted 2 min ago/);
  });

  it("uses local time when old", () => {
    const r = formatTrashItem(
      { name: "x", deleted_at: "2026-10-20T10:00:00.000Z" },
      now
    );
    assert.equal(r.title, "x");
    assert.match(r.sub, /deleted/);
    assert.ok(!/min ago/.test(r.sub));
  });
});
