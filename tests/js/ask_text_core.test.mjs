import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  normalizeNameInput,
  normalizeSceneCreateDialogInput,
  SCENE_NAME_MAX_LEN,
  PROJECT_NAME_MAX_LEN,
} from "../../web/gg_ask_text_core.js";
import { resolveSceneName } from "../../web/gg_group_list_core.js";

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

describe("normalizeSceneCreateDialogInput (Start New Scene Here / Make Scene)", () => {
  it("allows empty confirm so resolveSceneName can assign the next free Scene N", () => {
    const groups = [{ name: "Scene 1" }, { name: "Scene 2" }];
    for (const raw of ["", "  ", "\t"]) {
      const norm = normalizeSceneCreateDialogInput(raw, SCENE_NAME_MAX_LEN);
      assert.equal(norm.ok, true, raw);
      assert.equal(norm.value, "");
      assert.equal(resolveSceneName(groups, norm.value), "Scene 3");
    }
  });

  it("trims non-empty like normalizeNameInput", () => {
    const r = normalizeSceneCreateDialogInput("  Rooftop  ", SCENE_NAME_MAX_LEN);
    assert.deepEqual(r, { ok: true, value: "Rooftop" });
  });
});
