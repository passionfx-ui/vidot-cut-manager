// H4: New Project dialog reuses generation settings and stores them on the new project.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import { DEFAULT_PROJECT_SETTINGS } from "../../web/gg_project_settings_core.js";
import { genFormFromResolutionChoice } from "../../web/gg_gen_settings_core.js";
import { newProjectGenerationSettings, newProjectRequest } from "../../web/gg_new_project_core.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const GONGGAN_JS = readFileSync(path.join(root, "web/gonggan.js"), "utf8");

const GEN_KEYS = ["gen_aspect", "aspect", "resolution_short", "random_seed", "width", "height"];

describe("H4 New Project generation settings", () => {
  it("defaults match project settings defaults", () => {
    const gen = newProjectGenerationSettings({});
    for (const key of GEN_KEYS) {
      assert.equal(gen[key], DEFAULT_PROJECT_SETTINGS[key], key);
    }
    const body = newProjectRequest({ name: "A", location: "D:\\F", gen: {} }).body;
    assert.equal(body.name, "A");
    assert.equal(body.location, "D:\\F");
    assert.equal(body.settings.image_template, "builtin:image");
    assert.equal(body.settings.video_template, "builtin:video-ltx");
    for (const key of GEN_KEYS) assert.equal(body.settings[key], DEFAULT_PROJECT_SETTINGS[key], key);
  });

  it("saves a chosen aspect, short-side preset, and seed", () => {
    const body = newProjectRequest({
      name: "Portrait",
      gen: genFormFromResolutionChoice({
        gen_aspect: "9:16",
        resolution: "512",
        random_seed: false,
      }),
    }).body;
    assert.equal(body.settings.gen_aspect, "9:16");
    assert.equal(body.settings.aspect, "9:16");
    assert.equal(body.settings.resolution_short, 512);
    assert.equal(body.settings.random_seed, false);
    assert.equal(body.settings.width, 512);
    assert.equal(body.settings.height, 904);
    assert.equal(body.location, undefined);
  });

  it("saves custom width and height snapped to multiples of 8", () => {
    const body = newProjectRequest({
      name: "Custom",
      imageTemplate: " my/img.json ",
      videoTemplate: "builtin:video-ltx-t2v",
      gen: genFormFromResolutionChoice({
        gen_aspect: "16:9",
        resolution: "custom",
        width: 641,
        height: 481,
        random_seed: true,
      }),
    }).body;
    assert.equal(body.settings.image_template, "my/img.json");
    assert.equal(body.settings.video_template, "builtin:video-ltx-t2v");
    assert.equal(body.settings.resolution_short, "custom");
    assert.equal(body.settings.gen_aspect, "16:9");
    assert.equal(body.settings.width, 640);
    assert.equal(body.settings.height, 480);
    assert.equal(body.settings.random_seed, true);
  });

  it("New Project dialog reuses the generation settings section and submits those fields", () => {
    const start = GONGGAN_JS.indexOf("function openNewProjectModal(");
    const end = GONGGAN_JS.indexOf("\nconst TEMPLATE_FIELDS = {", start);
    assert.ok(end > start);
    const body = GONGGAN_JS.slice(start, end);
    assert.match(body, /genSettingsModalHtml\(DEFAULT_PROJECT_SETTINGS\)/);
    assert.match(body, /syncGenResolutionFields\(wrap\)/);
    assert.match(body, /gen:\s*genFormFromResolutionChoice\(/);
    assert.match(body, /\.gg-modal-gen-aspect/);
    assert.match(body, /\.gg-modal-gen-res/);
    assert.match(body, /\.gg-modal-gen-width/);
    assert.match(body, /\.gg-modal-gen-height/);
    assert.match(body, /\.gg-modal-random-seed/);
  });
});
