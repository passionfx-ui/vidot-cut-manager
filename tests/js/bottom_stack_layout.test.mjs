import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";

const __dirname = dirname(fileURLToPath(import.meta.url));
const js = readFileSync(join(__dirname, "../../web/gonggan.js"), "utf8");
const css = readFileSync(join(__dirname, "../../web/gonggan.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
const rules = [...css.matchAll(/([^{}]+)\{([^}]*)\}/g)].map((m) => ({ sel: m[1].trim(), body: m[2] }));
const ruleFor = (sel) => rules.find((r) => r.sel === sel);
const prop = (rule, name) => rule?.body.match(new RegExp(`(?:^|;)\\s*${name}\\s*:\\s*([^;]+)`))?.[1].trim();

const shellStart = js.indexOf("function statusPanelShellHtml()");
const shell = js.slice(shellStart, js.indexOf("\n}\n", shellStart));

describe("Shots bottom stack keeps fixed heights", () => {
  it("selection bar has a fixed px height and does not shrink", () => {
    const bar = ruleFor(".gg-shots .gg-selbar");
    assert.match(prop(bar, "height") || "", /^\d+px$/);
    assert.equal(prop(bar, "flex"), "0 0 auto");
    assert.equal(prop(bar, "overflow"), "hidden");
  });

  it("status panel has a fixed px height for 0, 1 and many selected", () => {
    const panel = ruleFor(".gg-shots.gg-cutpanel-status .gg-cutpanel");
    assert.match(prop(panel, "height") || "", /^\d+px$/);
    assert.equal(prop(panel, "max-height"), "none");
    assert.equal(prop(panel, "overflow"), "hidden");
    const info = ruleFor(".gg-shots .gg-cutpanel .gg-sp-info");
    assert.equal(prop(info, "min-height"), "0");
    assert.equal(prop(info, "overflow"), "hidden");
  });

  it("the empty selection never hides or restyles the bar", () => {
    assert.ok(!js.includes("gg-selbar-empty"));
    assert.ok(!css.includes("gg-selbar-empty"));
    assert.ok(!rules.some((r) => /\.gg-selbar/.test(r.sel) && /display\s*:\s*none/.test(r.body)));
  });
});

describe("Queue button in the status panel", () => {
  it("status panel shell has the Queue button, queue status and batch counter", () => {
    assert.ok(shellStart >= 0);
    assert.match(shell, /class="gg-sp-info"/);
    assert.match(shell, /<button[^>]*class="gg-btn gg-primary gg-queue-btn"[^>]*>Queue<\/button>/);
    assert.ok(shell.indexOf("gg-queue-btn") < shell.indexOf("gg-render-global"));
    assert.ok(shell.indexOf("gg-render-global") < shell.indexOf("gg-batch-prog"));
  });

  it("no Render button or Render selected anywhere in the UI code", () => {
    assert.ok(!/>Render</.test(js));
    assert.ok(!js.includes("gg-render-btn"));
    assert.ok(!js.includes("gg-render-row"));
    assert.ok(!css.includes("gg-render-row"));
    assert.ok(!js.includes("Render selected"));
  });
});
