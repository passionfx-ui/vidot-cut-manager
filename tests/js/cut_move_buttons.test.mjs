import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";

const js = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "../../web/gonggan.js"), "utf8");

describe("cut list move triangles removed", () => {
  it("has no move button markup or handlers in gonggan.js", () => {
    assert.equal(js.includes("gg-move-btn"), false);
    assert.equal(js.includes("gg-move-col"), false);
    assert.equal(js.includes("applyCutMoveBtn"), false);
  });
});
