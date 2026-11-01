import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { savedShotWorkflowToastDetail } from "../../web/gg_autosave_core.js";
import {
  defaultProjectLocationPlaceholder,
  defaultProjectStorageHint,
  userVisiblePathTooltip,
} from "../../web/gg_new_project_core.js";

const UUID = "01a19099-085a-4f2a-9c1d-abcdef012345";
const BAD_PATH = `C:\\dev\\comfyui-gonggan-cut\\projects`;
const FORBIDDEN = /gonggan|native/i;
const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

function assertCleanUserText(text) {
  const s = String(text ?? "");
  assert.ok(!UUID_RE.test(s), `must not contain a UUID: ${s}`);
  assert.ok(!FORBIDDEN.test(s), `must not contain forbidden words: ${s}`);
}

describe("saved workflow toast detail (UI path)", () => {
  it("uses cut label and name, not the cut-id workflow filename", () => {
    const detail = savedShotWorkflowToastDetail(
      { path: `workflows/gonggan/p/${UUID}.json`, filename: `${UUID}.json` },
      { cutLabel: "1-2", cutName: "Girl Looks Up" },
    );
    assert.equal(detail, "1-2 Girl Looks Up");
    assertCleanUserText(detail);
  });

  it("never falls back to a raw id filename when cut metadata is missing", () => {
    const detail = savedShotWorkflowToastDetail(
      { path: `workflows/gonggan/p/${UUID}.json`, filename: `${UUID}.json` },
      {},
    );
    assertCleanUserText(detail);
    assert.notEqual(detail, `${UUID}.json`);
  });
});

describe("New Project default location hint (UI path)", () => {
  it("hint and placeholder hide plugin folder names in visible text", () => {
    const hint = defaultProjectStorageHint(BAD_PATH);
    const ph = defaultProjectLocationPlaceholder(BAD_PATH);
    assertCleanUserText(hint);
    assertCleanUserText(ph);
    assert.match(hint, /ComfyUI output folder/i);
    assert.match(ph, /ComfyUI output folder/i);
  });

  it("omits title tooltip when the path contains forbidden words", () => {
    assert.equal(userVisiblePathTooltip(BAD_PATH), "");
    assert.equal(userVisiblePathTooltip("D:\\Films\\My Film"), "D:\\Films\\My Film");
  });
});
