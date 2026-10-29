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

const rowStart = js.indexOf("function iconRowHtml()");
const rowHtml = js.slice(rowStart, js.indexOf("\n}\n", rowStart));

describe("Shots icon row replaces the selection bar", () => {
  it("selection bar is hidden by a flag, its code kept", () => {
    assert.match(js, /^const SHOW_SEL_BAR = false;$/m);
    assert.match(js, /\$\{SHOW_SEL_BAR \? `<div class="gg-selbar">[\s\S]*gg-sel-group[\s\S]*gg-sel-ungroup[\s\S]*` : ""\}\s*\$\{iconRowHtml\(\)\}/);
  });

  it("icon row: New scene, New cut, Delete buttons with English tooltips, then the version", () => {
    assert.ok(rowStart >= 0);
    assert.match(rowHtml, /<div class="gg-iconrow">/);
    const order = ["gg-ir-scene", "gg-ir-cut", "gg-ir-del", "gg-version"].map((c) => rowHtml.indexOf(c));
    assert.ok(order.every((i, n) => i > 0 && (n === 0 || i > order[n - 1])), String(order));
    assert.match(rowHtml, /"gg-ir-scene", "New scene", ICON_FOLDER/);
    assert.match(rowHtml, /"gg-ir-cut", "New cut", ICON_NEW_PAGE/);
    assert.match(rowHtml, /"gg-ir-del", "Delete", ICON_TRASH/);
  });

  it("buttons reuse the existing actions; Delete goes through the in-app confirm", () => {
    assert.match(js, /\.gg-ir-scene"\)\?\.addEventListener\("click", \(\) => createSceneGroup\(cutSelIds\(\)\)\)/);
    assert.match(js, /\.gg-ir-cut"\)\?\.addEventListener\("click", \(\) => addLocalCut\(\)\)/);
    assert.match(js, /\.gg-ir-del"\)\?\.addEventListener\("click", \(\) => void confirmDeleteSelectedCuts\(\)\)/);
    const s = js.indexOf("async function confirmDeleteSelectedCuts()");
    const body = js.slice(s, js.indexOf("\n}\n", s));
    assert.match(body, /askConfirm\(\{ message: deleteCutsConfirmMessage\(n\), danger: true \}\)/);
    assert.ok(body.indexOf("askConfirm") < body.indexOf("deleteSelectedCuts()"));
  });

  it("icon row has a fixed px height, does not shrink and is never hidden", () => {
    const row = ruleFor(".gg-shots .gg-iconrow");
    assert.match(prop(row, "height") || "", /^\d+px$/);
    assert.equal(prop(row, "flex"), "0 0 auto");
    assert.equal(prop(row, "overflow"), "hidden");
    assert.ok(!rules.some((r) => /\.gg-iconrow/.test(r.sel) && /display\s*:\s*none/.test(r.body)));
  });

  it("clicking the icon row does not clear the selection first", () => {
    const s = js.indexOf("const onShotsEmptyClick");
    assert.match(js.slice(s, s + 400), /closest\("\.gg-iconrow"\)/);
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
