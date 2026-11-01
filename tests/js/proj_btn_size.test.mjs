import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";

const __dirname = dirname(fileURLToPath(import.meta.url));
const css = readFileSync(join(__dirname, "../../web/gonggan.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

const rules = [...css.matchAll(/([^{}]+)\{([^}]*)\}/g)].map((m) => ({
  sel: m[1].replace(/\s+/g, " ").trim(),
  body: m[2],
}));
const ruleFor = (sel) => rules.find((r) => r.sel === sel);
const prop = (rule, name) => rule?.body.match(new RegExp(`(?:^|;)\\s*${name}\\s*:\\s*([^;]+)`))?.[1].trim();

const SHARED = ".gg-shots .gg-proj-row > .gg-new-project-head, .gg-shots .gg-proj-row > .gg-proj-settings";
const HEAD = ".gg-shots .gg-proj-row > .gg-new-project-head";

describe("New Project and settings buttons share one square size", () => {
  it("uses one 28px square rule for both project-row controls", () => {
    const shared = ruleFor(SHARED);
    assert.ok(shared, "shared size rule is missing");
    assert.equal(prop(shared, "width"), "28px");
    assert.equal(prop(shared, "height"), "28px");
    assert.equal(prop(shared, "min-width"), "28px");
    assert.equal(prop(shared, "max-width"), "28px");
    assert.equal(prop(shared, "padding"), "0");
    assert.equal(prop(shared, "font-size"), "16px");
    assert.equal(prop(shared, "line-height"), "1");
    assert.equal(prop(shared, "display"), "inline-flex");
    assert.equal(prop(shared, "align-items"), "center");
    assert.equal(prop(shared, "justify-content"), "center");
    assert.equal(prop(shared, "box-sizing"), "border-box");
    assert.equal(prop(shared, "flex-shrink"), "0");
  });

  it("keeps the plus weight on the New Project button only", () => {
    assert.equal(prop(ruleFor(HEAD), "font-weight"), "600");
  });

  it("drops the old unequal padding rules", () => {
    assert.equal(ruleFor(".gg-shots .gg-new-project-head"), undefined);
    assert.equal(ruleFor(".gg-shots .gg-proj-settings"), undefined);
    assert.ok(ruleFor(".gg-shots .gg-proj-settings:disabled"));
  });
});
