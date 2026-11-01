/** F1: Use AI is "Use AI (Beta)" and off until turned on. Related AI features share that default and the Beta label. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { AI_MAKE_CUT_LABEL } from "../../web/gg_cut_list_core.js";
import { AI_MAKE_CUT_MENU_LABEL, aiMakeCutMenuItem } from "../../web/gg_ctx_menu_core.js";
import {
  USE_AI_LABEL,
  USE_AI_OFF_TIP,
  AI_TEXT_LABEL,
  USE_AI_FEATURES_HINT,
  cutSplitUseAi,
} from "../../web/gg_cut_split_model_core.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const gonggan = readFileSync(join(root, "web/gonggan.js"), "utf8");
const defaults = JSON.parse(readFileSync(join(root, "gonggan_settings.default.json"), "utf8"));

describe("F1 Use AI (Beta), default off", () => {
  it("labels Use AI, AI Make Cut, and AI text as Beta", () => {
    assert.equal(USE_AI_LABEL, "Use AI (Beta)");
    assert.equal(AI_MAKE_CUT_LABEL, "AI Make Cut (Beta)");
    assert.equal(AI_TEXT_LABEL, "AI text (Beta)");
    assert.equal(AI_MAKE_CUT_MENU_LABEL, "AI Make Cut (Beta)…");
    assert.equal(USE_AI_OFF_TIP, "Turn on Use AI (Beta) in Project Settings");
    assert.match(USE_AI_FEATURES_HINT, /AI Make Cut \(Beta\)/);
    assert.match(USE_AI_FEATURES_HINT, /AI text \(Beta\)/);
  });

  it("Use AI is off unless the server says true", () => {
    assert.equal(cutSplitUseAi({}), false);
    assert.equal(cutSplitUseAi(null), false);
    assert.equal(cutSplitUseAi(undefined), false);
    assert.equal(cutSplitUseAi({ use_ai: false }), false);
    assert.equal(cutSplitUseAi({ use_ai: true }), true);
  });

  it("the settings switch and the shipped default start off", () => {
    assert.match(gonggan, /\$\{esc\(USE_AI_LABEL\)\}/);
    assert.match(gonggan, /\$\{esc\(USE_AI_FEATURES_HINT\)\}/);
    assert.match(gonggan, /class="gg-switch gg-modal-use-ai" role="switch" disabled/);
    assert.doesNotMatch(gonggan, /gg-modal-use-ai" role="switch" checked/);
    assert.match(gonggan, /let cutSplitUseAiOn = false/);
    assert.match(gonggan, /catch \(_\) \{\s*cutSplitUseAiOn = false;/);
    assert.equal(defaults.cut_split_enabled, false);
  });

  it("AI Make Cut stays off when Use AI was never set", () => {
    const item = aiMakeCutMenuItem(undefined);
    assert.equal(item.label, "AI Make Cut (Beta)…");
    assert.equal(item.disabled, true);
    assert.equal(item.title, USE_AI_OFF_TIP);
  });
});
