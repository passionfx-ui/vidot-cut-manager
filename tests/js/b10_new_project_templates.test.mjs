// B10: New Project dialog uses Image/Video templates; template picker is an overlay dropdown
// (ref b66a28b, 18fe766).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import { newProjectRequest } from "../../web/gg_new_project_core.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const GONGGAN_JS = readFileSync(path.join(root, "web/gonggan.js"), "utf8");
const GONGGAN_CSS = readFileSync(path.join(root, "web/gonggan.css"), "utf8");
const DEFAULT_TEMPLATES = { image_template: "builtin:image", video_template: "builtin:video-ltx" };

describe("B10 New Project Image / Video templates", () => {
  it("create body stores Image / Video templates and never a Default template_ref", () => {
    assert.deepEqual(newProjectRequest({ name: " A ", location: " D:\\F " }), {
      body: { name: "A", location: "D:\\F", settings: DEFAULT_TEMPLATES },
    });
    const picked = newProjectRequest({
      name: "A",
      location: "D:\\F",
      template: "t.json",
      imageTemplate: " my/img.json ",
      videoTemplate: "builtin:video-ltx-t2v",
    }).body;
    assert.deepEqual(picked, {
      name: "A",
      location: "D:\\F",
      settings: { image_template: "my/img.json", video_template: "builtin:video-ltx-t2v" },
    });
    assert.equal(Object.hasOwn(picked, "template_ref"), false);
  });

  it("New Project dialog markup is Image and Video templates only", () => {
    const start = GONGGAN_JS.indexOf("function openNewProjectModal(");
    const end = GONGGAN_JS.indexOf("\nconst TEMPLATE_FIELDS = {", start);
    assert.ok(end > start);
    const body = GONGGAN_JS.slice(start, end);
    assert.doesNotMatch(body, /templateFieldHtml\(\)/);
    assert.doesNotMatch(body, /data-tpl="default"/);
    assert.doesNotMatch(body, /saveLastTemplate\(localStorage, template\)/);
    assert.match(body, /templateFieldHtml\("image"\)/);
    assert.match(body, /templateFieldHtml\("video"\)/);
    assert.match(body, /imageTemplate: kindTemplates\.image/);
    assert.match(body, /videoTemplate: kindTemplates\.video/);
  });
});

describe("B10 template picker overlay", () => {
  it("template list opens as a fixed overlay and closes on an outside click", () => {
    const s = GONGGAN_JS.slice(GONGGAN_JS.indexOf("function wireProjectTemplateField("));
    const body = s.slice(0, s.indexOf("\nlet folderPickerEl"));
    assert.match(body, /syncListOverlay\(\)/);
    assert.match(body, /list\.style\.position = "fixed"/);
    assert.match(body, /list\.style\.zIndex = "10100"/);
    assert.match(body, /list\.style\.maxHeight = "200px"/);
    assert.match(body, /document\.addEventListener\("mousedown", outside, true\)/);
  });

  it("visible template list is taken out of the dialog flow", () => {
    assert.match(
      GONGGAN_CSS,
      /\.gg-tpl-field \.gg-tpl-list:not\(\[hidden\]\) \{[^}]*position:\s*fixed;[^}]*z-index:\s*10100;/,
    );
  });
});
