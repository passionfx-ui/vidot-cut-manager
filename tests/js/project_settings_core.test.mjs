import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  RESOLUTION_PRESETS,
  DEFAULT_PROJECT_SETTINGS,
  presetKey,
  parsePresetKey,
  normalizeProjectSettings,
  presetKeyForSettings,
  readSettingsFromFormValues,
  clampCutSeconds,
  clampFps,
} from "../../web/gg_project_settings_core.js";

describe("gg_project_settings_core", () => {
  it("lists resolution presets", () => {
    assert.equal(RESOLUTION_PRESETS.length, 5);
    assert.ok(RESOLUTION_PRESETS.some((p) => p.width === 1920));
  });

  it("normalizes defaults for empty input", () => {
    const s = normalizeProjectSettings(null);
    assert.deepEqual(s, DEFAULT_PROJECT_SETTINGS);
  });

  it("maps legacy default_sec", () => {
    const s = normalizeProjectSettings({ default_sec: 5, fps: 25 });
    assert.equal(s.cut_seconds, 5);
    assert.equal(s.fps, 25);
  });

  it("clamps fps and cut length", () => {
    assert.equal(clampFps(99), 24);
    assert.equal(clampCutSeconds(0.5), 1);
    assert.equal(clampCutSeconds(120), 60);
  });

  it("round-trips preset keys", () => {
    const p = RESOLUTION_PRESETS[1];
    const key = presetKey(p);
    const parsed = parsePresetKey(key);
    assert.equal(parsed.width, p.width);
    assert.equal(parsed.height, p.height);
    assert.equal(presetKeyForSettings({ aspect: p.aspect, width: p.width, height: p.height, fps: 24, cut_seconds: 3 }), key);
  });

  it("reads form values", () => {
    const s = readSettingsFromFormValues(presetKey(RESOLUTION_PRESETS[2]), "30", "4.2", null);
    assert.equal(s.fps, 30);
    assert.equal(s.cut_seconds, 4.2);
    assert.equal(s.width, 720);
  });
});
