import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import {
  cutSplitModelOptions,
  cutSplitModelOptionsHtml,
  cutSplitModelChange,
  cutSplitModelLoadErrorText,
  cutSplitUseAi,
  aiCutSplitButtonState,
  cutSplitSettingsPatch,
  cutSplitMissingModel,
  cutSplitMissingModelHtml,
  cutSplitMemoryConfirm,
  cutSplitPrecheckStep,
  formatGb,
  USE_AI_OFF_TIP,
  AI_SPLIT_TIP,
} from "../../web/gg_cut_split_model_core.js";

const DEFAULT = "qwen3vl_4b_int8_convrot.safetensors";
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const GONGGAN_JS = readFileSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../web/gonggan.js"), "utf8");

describe("cutSplitModelOptions", () => {
  it("lists the models and preselects the current setting", () => {
    const opts = cutSplitModelOptions({ models: ["a.safetensors", DEFAULT], current: DEFAULT, default: DEFAULT });
    assert.deepEqual(opts, [
      { value: "a.safetensors", label: "a.safetensors", selected: false },
      { value: DEFAULT, label: DEFAULT, selected: true },
    ]);
  });

  it("falls back to the default when there is no current value", () => {
    for (const current of [undefined, null, "", "  "]) {
      const opts = cutSplitModelOptions({ models: ["a.safetensors", DEFAULT], current, default: DEFAULT });
      assert.deepEqual(opts.filter((o) => o.selected).map((o) => o.value), [DEFAULT]);
    }
  });

  it("adds the current value on top when it is not in the list", () => {
    const opts = cutSplitModelOptions({ models: ["a.safetensors"], current: "gone.safetensors", default: DEFAULT });
    assert.deepEqual(opts, [
      { value: "gone.safetensors", label: "gone.safetensors (not found)", selected: true },
      { value: "a.safetensors", label: "a.safetensors", selected: false },
    ]);
  });

  it("shows the default alone when ComfyUI lists no files", () => {
    assert.deepEqual(cutSplitModelOptions({ models: [], current: "", default: DEFAULT }), [
      { value: DEFAULT, label: `${DEFAULT} (not found)`, selected: true },
    ]);
  });

  it("dedupes and skips empty or non-string entries", () => {
    const opts = cutSplitModelOptions({ models: ["a", " a ", "", null, 3, "b"], current: "b", default: DEFAULT });
    assert.deepEqual(opts.map((o) => o.value), ["a", "b"]);
  });

  it("handles a missing body", () => {
    assert.deepEqual(cutSplitModelOptions(null), []);
    assert.deepEqual(cutSplitModelOptions(undefined), []);
  });
});

describe("cutSplitModelOptionsHtml", () => {
  it("renders escaped options with the selection", () => {
    const html = cutSplitModelOptionsHtml(
      cutSplitModelOptions({ models: ['x"<y>.safetensors', DEFAULT], current: DEFAULT, default: DEFAULT }),
      esc,
    );
    assert.equal(
      html,
      `<option value="x&quot;&lt;y&gt;.safetensors">x&quot;&lt;y&gt;.safetensors</option>`
        + `<option value="${DEFAULT}" selected>${DEFAULT}</option>`,
    );
  });
});

describe("cutSplitModelChange", () => {
  it("returns the new choice only when it changed", () => {
    assert.equal(cutSplitModelChange(DEFAULT, "a.safetensors"), "a.safetensors");
    assert.equal(cutSplitModelChange(DEFAULT, DEFAULT), null);
    assert.equal(cutSplitModelChange(DEFAULT, ` ${DEFAULT} `), null);
  });

  it("returns null when the list never loaded or nothing is chosen", () => {
    assert.equal(cutSplitModelChange("", "a.safetensors"), null);
    assert.equal(cutSplitModelChange(undefined, "a.safetensors"), null);
    assert.equal(cutSplitModelChange(DEFAULT, ""), null);
    assert.equal(cutSplitModelChange(DEFAULT, undefined), null);
  });
});

describe("cutSplitModelLoadErrorText", () => {
  it("asks for a restart when the route is missing", () => {
    assert.equal(cutSplitModelLoadErrorText({ status: 404 }), "Restart ComfyUI to load the model list");
    assert.equal(cutSplitModelLoadErrorText({ status: 405 }), "Restart ComfyUI to load the model list");
  });

  it("shows the error otherwise", () => {
    assert.equal(cutSplitModelLoadErrorText({ status: 500, message: "boom" }), "Could not load the model list: boom");
    assert.equal(cutSplitModelLoadErrorText(null), "Could not load the model list");
  });
});

describe("cutSplitUseAi / aiCutSplitButtonState", () => {
  it("Use AI is on unless the server says false", () => {
    assert.equal(cutSplitUseAi({ use_ai: true }), true);
    assert.equal(cutSplitUseAi({}), true);
    assert.equal(cutSplitUseAi(null), true);
    assert.equal(cutSplitUseAi({ use_ai: false }), false);
  });

  it("button is disabled with the Project Settings tip when off", () => {
    assert.deepEqual(aiCutSplitButtonState(false), { disabled: true, title: "Turn on Use AI in Project Settings" });
    assert.equal(USE_AI_OFF_TIP, "Turn on Use AI in Project Settings");
    assert.deepEqual(aiCutSplitButtonState(true), { disabled: false, title: AI_SPLIT_TIP });
  });
});

describe("cutSplitSettingsPatch", () => {
  it("only changed fields", () => {
    assert.equal(cutSplitSettingsPatch({ modelInitial: DEFAULT, model: DEFAULT, useAiInitial: true, useAi: true }), null);
    assert.deepEqual(cutSplitSettingsPatch({ modelInitial: DEFAULT, model: "a", useAiInitial: true, useAi: true }), { clip_name: "a" });
    assert.deepEqual(cutSplitSettingsPatch({ modelInitial: DEFAULT, model: DEFAULT, useAiInitial: true, useAi: false }), { use_ai: false });
    assert.deepEqual(cutSplitSettingsPatch({ modelInitial: DEFAULT, model: "a", useAiInitial: false, useAi: true }),
      { clip_name: "a", use_ai: true });
  });

  it("nothing is saved for fields that never loaded", () => {
    assert.equal(cutSplitSettingsPatch({ modelInitial: "", model: "a", useAiInitial: null, useAi: false }), null);
    assert.equal(cutSplitSettingsPatch({}), null);
    assert.equal(cutSplitSettingsPatch(), null);
  });
});

describe("missing model notice", () => {
  const URL = "https://huggingface.co/Comfy-Org/Fibo-2.0/resolve/main/text_encoders/qwen3vl_4b_int8_convrot.safetensors";
  const PAGE = "https://huggingface.co/Comfy-Org/Fibo-2.0/blob/main/text_encoders/qwen3vl_4b_int8_convrot.safetensors";

  it("default model: name, folder, download link and page", () => {
    const info = cutSplitMissingModel({ name: DEFAULT, folder: "models/text_encoders", url: URL, page: PAGE });
    assert.deepEqual(info, { name: DEFAULT, folder: "models/text_encoders", url: URL, page: PAGE });
    const html = cutSplitMissingModelHtml(info, esc);
    assert.match(html, /Missing model/);
    assert.match(html, new RegExp(`<code class="gg-mm-name">${DEFAULT.replace(/\./g, "\\.")}</code>`));
    assert.match(html, new RegExp(`href="${URL.replace(/[.?/]/g, "\\$&")}"[^>]*>Download</a>`));
    assert.match(html, />Model page</);
    assert.match(html, /<code class="gg-mm-folder">models\/text_encoders<\/code>/);
    assert.match(html, /target="_blank" rel="noopener noreferrer"/);
  });

  it("other models: folder only, no links", () => {
    const info = cutSplitMissingModel({ name: "x<y>.safetensors", folder: "models/text_encoders", url: "", page: "" });
    const html = cutSplitMissingModelHtml(info, esc);
    assert.ok(!html.includes("<a "));
    assert.match(html, /x&lt;y&gt;\.safetensors/);
    assert.match(html, /models\/text_encoders/);
  });

  it("drops non-https links, defaults the folder, null without a name", () => {
    assert.deepEqual(cutSplitMissingModel({ name: "a", url: "javascript:alert(1)", page: "http://x" }),
      { name: "a", folder: "models/text_encoders", url: "", page: "" });
    assert.equal(cutSplitMissingModel(null), null);
    assert.equal(cutSplitMissingModel({ name: " " }), null);
  });
});

describe("memory warning", () => {
  const GB = 1024 ** 3;

  it("low VRAM: free vs needed, Continue anyway", () => {
    const c = cutSplitMemoryConfirm({ reason: "low_vram", free: 3 * GB, need: 5.6 * GB }, DEFAULT);
    assert.equal(c.okLabel, "Continue anyway");
    assert.match(c.message, /^Not enough free VRAM\n/);
    assert.match(c.message, /about 3\.0 GB/);
    assert.match(c.message, /about 5\.6 GB/);
    assert.match(c.message, /very slow and may crash/);
  });

  it("no GPU", () => {
    const c = cutSplitMemoryConfirm({ reason: "no_gpu", need: 5 * GB });
    assert.match(c.message, /^No GPU found\n/);
    assert.match(c.message, /CPU, which is very slow and may crash/);
    assert.match(cutSplitMemoryConfirm({ reason: "no_gpu" }).message, /^No GPU found\n/);
  });

  it("nothing to warn about", () => {
    assert.equal(cutSplitMemoryConfirm(null), null);
    assert.equal(cutSplitMemoryConfirm({ reason: "other" }), null);
  });

  it("formatGb", () => {
    assert.equal(formatGb(4.6 * GB), "4.6 GB");
    assert.equal(formatGb(0), "");
    assert.equal(formatGb(undefined), "");
  });
});

describe("cutSplitPrecheckStep", () => {
  it("off, missing, confirm, run", () => {
    assert.equal(cutSplitPrecheckStep({ use_ai: false, missing: { name: DEFAULT } }), "off");
    assert.equal(cutSplitPrecheckStep({ use_ai: true, missing: { name: DEFAULT }, memory: { reason: "no_gpu" } }), "missing");
    assert.equal(cutSplitPrecheckStep({ use_ai: true, missing: null, memory: { reason: "low_vram", free: 1, need: 2 } }), "confirm");
    assert.equal(cutSplitPrecheckStep({ use_ai: true, missing: null, memory: null }), "run");
    assert.equal(cutSplitPrecheckStep(null), "run");
  });
});

describe("Project Settings dialog wiring (gonggan.js)", () => {
  const fn = GONGGAN_JS.slice(GONGGAN_JS.indexOf("function openProjectSettingsModal("));
  const body = fn.slice(0, fn.indexOf("\n}\n"));

  it("has exactly one AI Make Cut model dropdown", () => {
    assert.equal(body.match(/AI Make Cut model/g)?.length, 1);
    assert.doesNotMatch(body, /AI Cut Split/);
    assert.equal(body.match(/<select class="gg-modal-cut-split-model"/g)?.length, 1);
    assert.match(body, /<label class="gg-modal-field gg-cut-split-model-field">AI Make Cut model\s*<select class="gg-modal-cut-split-model"/);
    assert.match(body, /AI Make Cut on\/off\. Off: the text model is never loaded\./);
  });

  it("has one Use AI switch above the model dropdown, on by default", () => {
    assert.equal(body.match(/class="gg-switch gg-modal-use-ai"/g)?.length, 1);
    assert.match(body, /Use AI\s*<input type="checkbox" class="gg-switch gg-modal-use-ai" role="switch" checked/);
    assert.ok(body.indexOf("gg-modal-use-ai") < body.indexOf("gg-modal-cut-split-model"));
  });

  it("Use AI off greys out and disables the dropdown", () => {
    assert.match(body, /useAiIn\?\.addEventListener\("change", syncModelField\)/);
    assert.match(body, /modelSel\.disabled = !modelInitial \|\| off/);
    assert.match(body, /classList\.toggle\("gg-off", off\)/);
  });

  it("loads the list from the route and fills it with the core helpers", () => {
    assert.match(body, /getJson\("\/gonggan\/cut-split\/model"\)/);
    assert.match(body, /cutSplitModelOptionsHtml\(opts, esc\)/);
    assert.match(body, /useAiInitial = cutSplitUseAi\(d\)/);
  });

  it("saves changed model / Use AI with the existing Save button and updates the toolbar", () => {
    const submit = body.slice(body.indexOf('form.addEventListener("submit"'));
    assert.match(submit, /cutSplitSettingsPatch\(\{/);
    assert.match(submit, /postJson\("\/gonggan\/cut-split\/model", aiPatch\)/);
    assert.match(submit, /if \(!patch && !aiPatch\)/);
    assert.match(submit, /setCutSplitUseAi\(useAiInitial\)/);
  });
});

describe("AI Make Cut visible again behind the one flag (0.9.125)", () => {
  const fnBody = (name) => {
    const s = GONGGAN_JS.slice(GONGGAN_JS.indexOf(`function ${name}(`));
    return s.slice(0, s.indexOf("\n}\n"));
  };

  it("AI_CUT_SPLIT_VISIBLE is defined once and on", () => {
    assert.equal(GONGGAN_JS.match(/^const AI_CUT_SPLIT_VISIBLE = /gm)?.length, 1);
    assert.match(GONGGAN_JS, /^const AI_CUT_SPLIT_VISIBLE = true;$/m);
  });

  it("the toolbar button is rendered only when the flag is on", () => {
    assert.match(GONGGAN_JS, /\$\{AI_CUT_SPLIT_VISIBLE && tl && isNativeProject\(\) \? `<div class="gg-cutlist-btns">\$\{aiSplitButtonHtml\(\)\}<\/div>` : ""\}/);
    assert.equal(GONGGAN_JS.match(/\$\{aiSplitButtonHtml\(\)\}/g)?.length, 1, "no other place shows the button");
  });

  it("the Project Settings AI section (Use AI, model, pre-check) is rendered only when the flag is on", () => {
    const body = fnBody("openProjectSettingsModal");
    assert.match(body, /\$\{nat && AI_CUT_SPLIT_VISIBLE \? `<label class="gg-modal-field gg-use-ai-field">/);
    const section = body.slice(body.indexOf("AI_CUT_SPLIT_VISIBLE ?"), body.indexOf('<div class="gg-modal-actions">'));
    assert.match(section, /gg-modal-use-ai[\s\S]*gg-modal-cut-split-model/);
    assert.match(body, /if \(modelSel\) void getJson\("\/gonggan\/cut-split\/model"\)/, "no model list request when hidden");
  });

  it("nothing calls the AI routes when the flag is off; the toolbar button and two menu entries open the dialog", () => {
    assert.match(fnBody("refreshCutSplitUseAi"), /if \(!AI_CUT_SPLIT_VISIBLE\) return;/);
    assert.match(fnBody("openAiCutSplitModal"), /if \(!AI_CUT_SPLIT_VISIBLE \|\| !isNativeProject\(\)/);
    assert.equal(GONGGAN_JS.match(/=> openAiCutSplitModal\(\)/g)?.length, 3, "toolbar button, cut card menu, list menu");
    assert.match(GONGGAN_JS, /querySelector\("\.gg-ai-split"\)\?\.addEventListener\("click", \(\) => openAiCutSplitModal\(\)\)/);
    assert.match(GONGGAN_JS, /title: AI_CUT_SPLIT_VISIBLE \? "Workflow for AI Make Cut cuts and Image to Video" : "Workflow for Image to Video"/);
  });

  it("right-click: the cut card menu and the empty list menu list AI Make Cut… (native, flag on, Use AI)", () => {
    const card = fnBody("openCutContextMenu");
    assert.match(card, /aiMakeCut: AI_CUT_SPLIT_VISIBLE,\s*useAi: cutSplitUseAiOn,/);
    assert.match(card, /aiMakeCut: \(\) => openAiCutSplitModal\(\)/);
    const panel = fnBody("openShotsPanelContextMenu");
    assert.match(panel, /if \(nat && AI_CUT_SPLIT_VISIBLE\) \{/);
    assert.match(panel, /aiMakeCutMenuItem\(cutSplitUseAiOn\)/);
    assert.match(panel, /action: \(\) => openAiCutSplitModal\(\)/);
  });
});

describe("AI Make Cut name in the UI (internal names stay)", () => {
  it("no visible 'AI Cut Split' text is left in the web UI", () => {
    for (const f of ["gonggan.js", "gg_cut_split_model_core.js", "gg_ctx_menu_core.js", "gg_cut_list_core.js"]) {
      const src = readFileSync(new URL(`../../web/${f}`, import.meta.url), "utf8");
      const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
      assert.doesNotMatch(code, /AI Cut Split/, f);
    }
  });

  it("toolbar button and dialog use the AI Make Cut label", () => {
    assert.match(GONGGAN_JS, />\$\{esc\(AI_MAKE_CUT_LABEL\)\}<\/button><\/span>`/);
    assert.match(GONGGAN_JS, /<h3 class="gg-modal-title">\$\{esc\(AI_MAKE_CUT_LABEL\)\}<\/h3>/);
    assert.match(GONGGAN_JS, /ggToast\(AI_MAKE_CUT_LABEL, USE_AI_OFF_TIP, "warn"\)/);
    assert.equal(USE_AI_OFF_TIP, "Turn on Use AI in Project Settings");
  });

  it("missing-model notice says AI Make Cut", () => {
    const html = cutSplitMissingModelHtml({ name: DEFAULT, folder: "models/text_encoders", url: "", page: "" }, (s) => s);
    assert.match(html, /AI Make Cut needs this text model/);
  });
});

describe("AI Cut Split wiring (gonggan.js, kept behind the flag)", () => {
  const fnBody = (name) => {
    const s = GONGGAN_JS.slice(GONGGAN_JS.indexOf(`function ${name}(`));
    return s.slice(0, s.indexOf("\n}\n"));
  };

  it("toolbar button follows Use AI", () => {
    assert.match(fnBody("aiSplitButtonHtml"), /aiCutSplitButtonState\(cutSplitUseAiOn\)/);
    assert.match(fnBody("aiSplitButtonHtml"), /\$\{s\.disabled \? " disabled" : ""\}/);
    assert.match(GONGGAN_JS, /<div class="gg-cutlist-btns">\$\{aiSplitButtonHtml\(\)\}<\/div>/);
    assert.match(GONGGAN_JS, /bus\.addEventListener\("cut-split-use-ai", onUseAi\)/);
  });

  it("dialog: Use AI off opens nothing; Split runs the precheck before the run", () => {
    const body = fnBody("openAiCutSplitModal");
    assert.match(body, /if \(!cutSplitUseAiOn\) \{/);
    assert.match(body, /getJson\("\/gonggan\/cut-split\/precheck"\)/);
    const click = body.slice(body.indexOf('runBtn.addEventListener("click"'));
    assert.ok(click.indexOf("precheckOk()") > 0);
    assert.ok(click.indexOf("precheckOk()") < click.indexOf('postJson("/gonggan/ai-cut-split"'));
    assert.match(body, /askConfirm\(\{ message: c\.message, okLabel: c\.okLabel \}\)/);
    assert.match(body, /if \(step === "missing"\) return !showMissing\(pre\.missing\)/);
    assert.match(body, /e\.code === "missing_model" && showMissing\(e\.data\?\.missing\)/);
  });

  it("askConfirm takes a custom OK label", () => {
    const body = fnBody("askConfirm");
    assert.match(body, /const okLabel = opts\?\.okLabel \|\| "OK"/);
    assert.match(body, /\$\{esc\(okLabel\)\}<\/button>/);
  });
});
