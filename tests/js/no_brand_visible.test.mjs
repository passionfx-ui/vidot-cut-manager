// 0.9.135: user-visible text in web/*.js must never contain "native" or "gonggan". Plain string literals that read
// like UI text (contain a space) and the visible parts of HTML template literals (text nodes and title / aria-label /
// placeholder / alt / tooltip values) are scanned; ids, keys, class names and URLs are not shown and are skipped.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const WEB = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../web");
const BAD = /(?<![A-Za-z0-9_$-])native(?![A-Za-z0-9_$-])|gonggan|공간/i;
// Never shown: the old-server reply that gg_native_regen_core matches and replaces.
const ALLOW = [/^Not available for native projects yet$/];

function literals(src) {
  const out = [];
  const re = /\/\*[\s\S]*?\*\/|\/\/[^\n]*|"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'|`(?:[^`\\]|\\.)*`/g;
  let m;
  while ((m = re.exec(src))) {
    const t = m[0];
    if (t.startsWith("/")) continue;
    const before = src.slice(Math.max(0, m.index - 12), m.index);
    out.push({ q: t[0], text: t.slice(1, -1), at: src.slice(0, m.index).split("\n").length, before });
  }
  return out;
}

/** Visible parts of a literal, or [] when it is not UI text. */
function stripCode(text) {
  let out = "";
  for (let i = 0; i < text.length; i++) {
    if (text[i] === "$" && text[i + 1] === "{") {
      let depth = 1;
      i += 2;
      while (i < text.length && depth) {
        if (text[i] === "{") depth++;
        else if (text[i] === "}") depth--;
        i++;
      }
      i--;
      out += " ";
    } else out += text[i];
  }
  return out;
}

export function visibleParts(text, { before = "" } = {}) {
  if (/\/\*\*|\*\//.test(text)) return [];  // tokenizer ran across a comment: not a real literal
  // API routes (/gonggan/...) are requested, never shown
  const t = stripCode(text).replace(/\/(?:api\/)?gonggan\/[\w\-\/?=&\[\].]*/gi, " ");
  if (/^\s*(import|from)\b/.test(before.trim().split(/\s+/).pop() || "")) return [];
  if (/<[a-z][^>]*>/i.test(t)) {
    const parts = [];
    for (const m of t.matchAll(/\b(?:title|aria-label|placeholder|alt|data-tip)\s*=\s*"([^"]*)"/gi)) parts.push(m[1]);
    parts.push(t.replace(/<[^>]*>/g, " "));
    return parts;
  }
  if (!/\s/.test(t.trim())) return [];          // a key / id / class / url
  if (/^[\w.\-]+(\s+[\w.\-]+)*$/.test(t.trim()) && /gg-|^\.|^#/.test(t.trim())) return []; // class lists, selectors
  if (/^[.#\[]|^\s*\.gg-|\[data-/.test(t.trim())) return [];   // CSS selectors
  return [t];
}

test("visibleParts unit", () => {
  assert.deepEqual(visibleParts("gg-src-native"), []);
  assert.deepEqual(visibleParts("/gonggan/project"), []);
  assert.ok(!visibleParts("/gonggan/workflow?pid=${a}&cut_id=${b}").some((p) => BAD.test(p)));
  assert.ok(!visibleParts('<b>${x !== "gonggan" ? "SDK" : ""}</b>').some((p) => BAD.test(p)));
  assert.ok(visibleParts("Saved in custom_nodes/comfyui-gonggan-cut/projects").some((p) => BAD.test(p)));
  assert.ok(visibleParts('<span class="gg-ver-src gg-src-native">native</span>').some((p) => BAD.test(p)));
  assert.ok(!visibleParts('<span class="gg-src-native">SDK</span>').some((p) => BAD.test(p)));
  assert.ok(visibleParts('<b title="the gonggan plugin">x</b>').some((p) => BAD.test(p)));
});

test("no user-visible string in web/*.js contains 'native' or 'gonggan'", () => {
  const bad = [];
  for (const f of readdirSync(WEB).filter((n) => n.endsWith(".js"))) {
    for (const l of literals(readFileSync(path.join(WEB, f), "utf8"))) {
      if (ALLOW.some((r) => r.test(l.text))) continue;
      for (const part of visibleParts(l.text, { before: l.before })) {
        if (BAD.test(part)) bad.push(`${f}:${l.at}: ${part.trim().slice(0, 120)}`);
      }
    }
  }
  assert.deepEqual(bad, []);
});

test("source labels never fall back to the raw source id (e.g. 'native')", () => {
  const src = readFileSync(path.join(WEB, "gonggan.js"), "utf8");
  const m = src.match(/const fmtSrc = \(s\) => \(\{[^}]*\}\[s\] \|\| ([^)]*)\);/);
  assert.ok(m, "fmtSrc found");
  assert.equal(m[1].trim(), '""');
});
