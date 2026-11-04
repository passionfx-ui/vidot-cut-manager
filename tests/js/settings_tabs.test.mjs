// H5: Project Settings splits into Global (app-wide) and This Project (saved on the project).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import {
  SETTINGS_TAB_GLOBAL,
  SETTINGS_TAB_PROJECT,
  SETTINGS_TAB_LABELS,
  SETTINGS_PANE_MARKERS,
  settingsControlTab,
  settingsTabPanes,
  newProjectDialogControlAllowed,
} from "../../web/gg_settings_tabs_core.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const GONGGAN_JS = readFileSync(path.join(root, "web/gonggan.js"), "utf8");

function fnBody(name, until) {
  const start = GONGGAN_JS.indexOf(`function ${name}(`);
  assert.ok(start >= 0, name);
  const src = GONGGAN_JS.slice(start);
  const end = src.indexOf(until || "\n}\n");
  assert.ok(end > 0, name);
  return src.slice(0, end);
}

function paneSource(body, id) {
  const marker = `data-settings-pane="${id}"`;
  const start = body.indexOf(marker);
  assert.ok(start > 0, marker);
  const nextPane = body.indexOf('data-settings-pane="', start + marker.length);
  const actions = body.indexOf('<div class="gg-modal-actions">', start);
  assert.ok(actions > start, "actions");
  const end = nextPane > start ? Math.min(nextPane, actions) : actions;
  return body.slice(start, end);
}

describe("H5 settings tab assignment", () => {
  it("names the two tabs Global and This Project", () => {
    assert.equal(SETTINGS_TAB_LABELS[SETTINGS_TAB_GLOBAL], "Global");
    assert.equal(SETTINGS_TAB_LABELS[SETTINGS_TAB_PROJECT], "This Project");
    assert.deepEqual(settingsTabPanes(SETTINGS_TAB_PROJECT), { project: true, global: false });
    assert.deepEqual(settingsTabPanes(SETTINGS_TAB_GLOBAL), { project: false, global: true });
    assert.deepEqual(settingsTabPanes("other"), { project: true, global: false });
  });

  it("puts app-wide controls on Global and per-project controls on This Project", () => {
    for (const id of ["use_ai", "ai_model", "ai_model_folders"]) {
      assert.equal(settingsControlTab(id), SETTINGS_TAB_GLOBAL, id);
    }
    for (const id of ["gen_aspect", "resolution", "custom_size", "random_seed", "template", "project_folder"]) {
      assert.equal(settingsControlTab(id), SETTINGS_TAB_PROJECT, id);
    }
    assert.equal(settingsControlTab("unknown"), null);
  });

  it("New Project allows only project-level fields", () => {
    for (const id of ["name", "location", "template", "gen_aspect", "resolution", "custom_size", "random_seed"]) {
      assert.equal(newProjectDialogControlAllowed(id), true, id);
    }
    for (const id of ["use_ai", "ai_model", "ai_model_folders"]) {
      assert.equal(newProjectDialogControlAllowed(id), false, id);
    }
  });
});

describe("H5 Project Settings dialog", () => {
  const body = fnBody("openProjectSettingsModal");
  const projectPane = paneSource(body, "project");
  const globalPane = paneSource(body, "global");

  it("opens on This Project and lists both tabs", () => {
    assert.match(body, /settingsTabPanes\(SETTINGS_TAB_PROJECT\)/);
    assert.match(body, /role="tablist"/);
    assert.match(body, /SETTINGS_TAB_LABELS\.project/);
    assert.match(body, /SETTINGS_TAB_LABELS\.global/);
    assert.equal(body.match(/type="button"[^>]*data-settings-tab="/g)?.length, 2);
    assert.ok(body.indexOf('data-settings-pane="project"') < body.indexOf('data-settings-pane="global"'));
    assert.ok(body.indexOf('data-settings-pane="global"') < body.indexOf('<div class="gg-modal-actions">'));
  });

  it("keeps project controls in This Project and app-wide controls in Global", () => {
    for (const marker of SETTINGS_PANE_MARKERS.project) assert.match(projectPane, new RegExp(marker));
    for (const marker of SETTINGS_PANE_MARKERS.global) assert.match(globalPane, new RegExp(marker));
    for (const marker of SETTINGS_PANE_MARKERS.global) assert.doesNotMatch(projectPane, new RegExp(marker));
    for (const marker of SETTINGS_PANE_MARKERS.project) assert.doesNotMatch(globalPane, new RegExp(marker));
    assert.match(projectPane, />Output folder/);
    assert.match(projectPane, /genSettingsModalHtml\(curSettings\)/);
    assert.match(projectPane, /templateFieldHtml\("image"\)/);
    assert.match(projectPane, /templateFieldHtml\("video"\)/);
    assert.match(globalPane, /\$\{nat && AI_CUT_SPLIT_VISIBLE \? `<div class="gg-ai-features-panel"[\s\S]*?<label class="gg-modal-field gg-use-ai-field">/);
    assert.match(globalPane, /gg-ai-model-dirs/);
  });

  it("still saves the same project keys and the same global AI route", () => {
    const submit = body.slice(body.indexOf('form.addEventListener("submit"'));
    assert.match(submit, /projectSettingsModalPatch\(curSettings, folderIn\.value/);
    assert.match(submit, /image_template: kindTemplates\.image/);
    assert.match(submit, /video_template: kindTemplates\.video/);
    assert.match(submit, /genFormFromResolutionChoice\(/);
    assert.match(submit, /cutSplitSettingsPatch\(\{/);
    assert.match(submit, /postJson\("\/gonggan\/cut-split\/model", aiPatch\)/);
    assert.match(submit, /fields: \{ settings: patch \}/);
    assert.match(body, /postJson\("\/gonggan\/folder\/check", \{ path: patch\.project_folder \}\)/);
  });
});

describe("H5 New Project dialog", () => {
  const body = fnBody("openNewProjectModal", "\nconst TEMPLATE_FIELDS = {");

  it("shows project-level settings only", () => {
    assert.match(body, />Location/);
    assert.match(body, /templateFieldHtml\("image"\)/);
    assert.match(body, /templateFieldHtml\("video"\)/);
    assert.match(body, /genSettingsModalHtml\(DEFAULT_PROJECT_SETTINGS\)/);
    assert.doesNotMatch(body, /data-settings-pane/);
    assert.doesNotMatch(body, /gg-settings-tab/);
    assert.doesNotMatch(body, /gg-modal-use-ai/);
    assert.doesNotMatch(body, /gg-modal-cut-split-model/);
    assert.doesNotMatch(body, /gg-ai-model-dirs/);
    assert.doesNotMatch(body, />Output folder/);
  });
});
