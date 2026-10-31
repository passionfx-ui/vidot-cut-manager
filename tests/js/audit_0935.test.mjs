// 0.9.135 audit fixes (pure modules).
import { test } from "node:test";
import assert from "node:assert/strict";
import { effectiveImageTemplate } from "../../web/gg_project_settings_core.js";
import { BEST_BUTTON_LABEL, MAKE_VIDEO_LABEL } from "../../web/gg_version_strip_core.js";
import { cutVideoGenerationPromptText } from "../../web/gg_cuts_core.js";
import { DEFAULT_IMAGE_TEMPLATE } from "../../web/gg_template_pick_core.js";

test("strip title buttons carry their symbols", () => {
  assert.equal(BEST_BUTTON_LABEL, "\u2605 Best");
  assert.equal(MAKE_VIDEO_LABEL, "\u25b6 Make Video");
});

test("video prompt quotes the dialogue", () => {
  assert.equal(cutVideoGenerationPromptText({ prompt: "Fox runs", caption: "Hi  there" }), 'Fox runs Dialogue: "Hi there"');
  assert.equal(cutVideoGenerationPromptText({ prompt: "Fox runs" }), "Fox runs");
});

test("Project Settings Image template: explicit wins, an old Default template shows, else the built-in", () => {
  assert.equal(effectiveImageTemplate("mine.json", "old.json"), "mine.json");
  assert.equal(effectiveImageTemplate(DEFAULT_IMAGE_TEMPLATE, "old.json"), "old.json");
  assert.equal(effectiveImageTemplate(DEFAULT_IMAGE_TEMPLATE, ""), DEFAULT_IMAGE_TEMPLATE);
  assert.equal(effectiveImageTemplate("", ""), DEFAULT_IMAGE_TEMPLATE);
});