import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  normalizeNameInput,
  SCENE_NAME_MAX_LEN,
  PROJECT_NAME_MAX_LEN,
} from "../../web/gg_ask_text_core.js";

describe("normalizeNameInput", () => {
  it("trims and accepts non-empty", () => {
    const r = normalizeNameInput("  Scene A  ", SCENE_NAME_MAX_LEN);
    assert.equal(r.ok, true);
    assert.equal(r.value, "Scene A");
  });

  it("rejects empty and whitespace", () => {
    assert.deepEqual(normalizeNameInput("", SCENE_NAME_MAX_LEN), { ok: false, value: "" });
    assert.deepEqual(normalizeNameInput("   \t", SCENE_NAME_MAX_LEN), { ok: false, value: "" });
    assert.deepEqual(normalizeNameInput(null, SCENE_NAME_MAX_LEN), { ok: false, value: "" });
  });

  it("clamps to max length", () => {
    const long = "x".repeat(50);
    const r = normalizeNameInput(long, SCENE_NAME_MAX_LEN);
    assert.equal(r.ok, true);
    assert.equal(r.value.length, SCENE_NAME_MAX_LEN);
    const proj = normalizeNameInput("y".repeat(200), PROJECT_NAME_MAX_LEN);
    assert.equal(proj.value.length, PROJECT_NAME_MAX_LEN);
  });
});
