import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DEFAULT_PROJECT_SETTINGS,
  normalizeProjectSettings,
  mergeProjectSettings,
  readSettingsFromFormValues,
  clampProjectFolder,
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