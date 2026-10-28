import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import { GG_VERSION } from "../../web/gg_version.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const INIT_PY = path.resolve(__dirname, "../../__init__.py");

describe("GG_VERSION", () => {
  it("matches __init__.py __version__", () => {
    const text = fs.readFileSync(INIT_PY, "utf8");
    const m = /^__version__\s*=\s*["']([^"']+)["']/m.exec(text);
    assert.ok(m, "__version__ not found in __init__.py");
    assert.equal(GG_VERSION, m[1]);
  });
});
