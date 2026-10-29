import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DEFAULT_PROJECT_SETTINGS,
  normalizeProjectSettings,
  mergeProjectSettings,
  readSettingsFromFormValues,
  clampProjectFolder,
  projectSettingsModalPatch,
  folderCheckErrorText,
} from "../../web/gg_project_settings_core.js";

describe("project folder setting (0.9.33)", () => {
  it("defaults to empty and is not on any drive", () => {
    assert.equal(DEFAULT_PROJECT_SETTINGS.project_folder, "");
    assert.equal(normalizeProjectSettings(null).project_folder, "");
  });
  it("trims, strips control chars and caps length", () => {
    assert.equal(clampProjectFolder("  N:\\Films\\A\u0001  "), "N:\\Films\\A");
    assert.equal(clampProjectFolder("x".repeat(400)).length, 260);
    assert.equal(clampProjectFolder(null), "");
  });
  it("merge keeps the folder unless patched", () => {
    const a = normalizeProjectSettings({ project_folder: "N:\\A" });
    assert.equal(mergeProjectSettings(a, { fps: 25 }).project_folder, "N:\\A");
    assert.equal(mergeProjectSettings(a, { project_folder: "" }).project_folder, "");
  });
  it("form read passes the folder; omitted keeps base", () => {
    const base = normalizeProjectSettings({ project_folder: "N:\\Keep" });
    assert.equal(readSettingsFromFormValues("16:9@1280x720", "24", "3", "English", base).project_folder, "N:\\Keep");
    assert.equal(readSettingsFromFormValues("16:9@1280x720", "24", "3", "English", base, " N:\\New ").project_folder, "N:\\New");
  });
});

describe("Project Settings modal: Output folder (0.9.82)", () => {
  const cur = { aspect: "9:16", width: 720, height: 1280, fps: 30, cut_seconds: 5, caption_lang: "Korean", project_folder: "N:\\A" };
  it("patch carries only the folder, so other stored settings are untouched", () => {
    assert.deepEqual(projectSettingsModalPatch(cur, " D:\\Films\\B "), { project_folder: "D:\\Films\\B" });
    assert.deepEqual(projectSettingsModalPatch(cur, ""), { project_folder: "" });
    const merged = mergeProjectSettings(cur, projectSettingsModalPatch(cur, "D:\\B"));
    assert.deepEqual({ ...merged, project_folder: "N:\\A" }, normalizeProjectSettings(cur));
  });
  it("unchanged folder means nothing to save", () => {
    assert.equal(projectSettingsModalPatch(cur, "  N:\\A "), null);
    assert.equal(projectSettingsModalPatch(null, "  "), null);
  });
  it("folder check errors: missing route asks for a restart, else the server message", () => {
    assert.match(folderCheckErrorText({ status: 404 }), /Restart ComfyUI/);
    assert.match(folderCheckErrorText({ status: 405 }), /Restart ComfyUI/);
    assert.equal(folderCheckErrorText({ status: 400, message: "Drive not found" }), "Drive not found");
    assert.equal(folderCheckErrorText(null), "Folder check failed");
  });
});