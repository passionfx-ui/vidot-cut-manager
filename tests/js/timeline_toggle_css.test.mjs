import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";

const __dirname = dirname(fileURLToPath(import.meta.url));
const css = readFileSync(join(__dirname, "../../web/gonggan.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

const rules = [...css.matchAll(/([^{}]+)\{([^}]*)\}/g)].map((m, order) => ({
  sel: m[1].trim(),
  body: m[2],
  order,
}));
const ruleFor = (sel) => rules.find((r) => r.sel === sel);
const prop = (rule, name) => rule?.body.match(new RegExp(`(?:^|;)\\s*${name}\\s*:\\s*([^;]+)`))?.[1].trim();
const classCount = (sel) => (sel.match(/\.[\w-]+/g) || []).length;
const accent = prop(ruleFor(".gg-root"), "--gg-acc");

function luminance(hex) {
  const n = hex.replace("#", "");
  const ch = [0, 2, 4].map((i) => parseInt(n.slice(i, i + 2), 16) / 255);
  const lin = ch.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
}
const contrast = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

describe("Timeline toggle bar open state", () => {
  const onRule = rules.find((r) => /\.gg-timeline-toggle\.gg-on$/.test(r.sel));
  const genericOn = ruleFor(".gg-root .gg-btn.gg-on");

  it("sets dark text on the accent background", () => {
    assert.ok(onRule, "open-state rule exists");
    assert.equal(prop(onRule, "background"), "var(--gg-acc)");
    assert.equal(prop(onRule, "color"), "#1a1a1a");
  });

  it("wins over the generic yellow .gg-btn.gg-on text", () => {
    assert.ok(genericOn);
    const a = classCount(onRule.sel);
    const b = classCount(genericOn.sel);
    assert.ok(a > b || (a === b && onRule.order > genericOn.order), `${onRule.sel} must beat ${genericOn.sel}`);
  });

  it("text is readable (WCAG AA) open and closed", () => {
    assert.ok(contrast(prop(onRule, "color"), accent) >= 4.5);
    const root = ruleFor(".gg-root");
    assert.ok(contrast(prop(root, "--gg-fg"), prop(root, "--gg-panel")) >= 4.5);
  });
});
