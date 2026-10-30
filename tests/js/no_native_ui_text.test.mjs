// UI must never show the word "native" (user rule, 0.9.124). Scans string/template literals in web/*.js.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const WEB = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../web");
// Literals that are never shown: module paths, and the old-server reply matched (then replaced) in code.
const ALLOW = [/^\.\/gg_native_regen_core\.js$/, /^Not available for native projects yet$/];
const ALLOW_FILE_LINE = (f, line) => f === "gg_native_regen_core.js" && /OLD_SERVER_MESSAGE =/.test(line);

function literals(src) {
  const out = [];
  const re = /\/\*[\s\S]*?\*\/|\/\/[^\n]*|"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'|`(?:[^`\\]|\\.)*`/g;
  let m;
  while ((m = re.exec(src))) {
    const t = m[0];
    if (t.startsWith("/")) continue;
    const line = src.slice(src.lastIndexOf("\n", m.index) + 1, src.indexOf("\n", m.index));
    out.push({ text: t.slice(1, -1), line, at: src.slice(0, m.index).split("\n").length });
  }
  return out;
}

test("no user-visible string literal in web/*.js contains 'native'", () => {
  const bad = [];
  for (const f of readdirSync(WEB).filter((n) => n.endsWith(".js"))) {
    for (const l of literals(readFileSync(path.join(WEB, f), "utf8"))) {
      // template literals: ignore ${...} code parts
      const text = l.text.replace(/\$\{[^}]*\}/g, "");
      if (!/(?<![A-Za-z0-9_$])native(?![A-Za-z0-9_$])/i.test(text)) continue; // a word, not part of an identifier like isNativeProject
      if (ALLOW.some((r) => r.test(l.text)) || ALLOW_FILE_LINE(f, l.line)) continue;
      bad.push(`${f}:${l.at}: ${l.text.slice(0, 120)}`);
    }
  }
  assert.deepEqual(bad, []);
});
