import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  dimensionsFromGenSettings,
  normalizeGenSettings,
  genSettingsModalPatch,
  randomSeedFromProjectSettings,
} from "../../web/gg_gen_settings_core.js";

describe("gg_gen_settings_core", () => {
  it("computes 16:9 720 as 1280x720", () => {
    const d = dimensionsFromGenSettings("16:9", 720);
    assert.equal(d.width, 1280);
    assert.equal(d.height, 720);
  });

  it("computes 9:16 512 as 512x904", () => {
    const d = dimensionsFromGenSettings("9:16", 512);
    assert.equal(d.width, 512);
    assert.equal(d.height, 904);
  });

  it("supports 3:4 and 21:9", () => {
    const p = dimensionsFromGenSettings("3:4", 720);
    assert.equal(p.width, 720);
    assert.equal(p.height % 8, 0);
    const u = dimensionsFromGenSettings("21:9", 512);
    assert.equal(u.height, 512);
    assert.equal(u.width % 8, 0);
  });

  it("genSettingsModalPatch only changed keys", () => {
    const cur = normalizeGenSettings({ gen_aspect: "16:9", resolution_short: 720, random_seed: true });
    const p = genSettingsModalPatch(cur, { gen_aspect: "9:16", resolution_short: 512, random_seed: false });
    assert.equal(p.gen_aspect, "9:16");
    assert.equal(p.resolution_short, 512);
    assert.equal(p.random_seed, false);
    assert.equal(p.width, 512);
    assert.equal(p.height, 904);
  });

  it("randomSeedFromProjectSettings prefers project", () => {
    const ls = { getItem: () => "1" };
    assert.equal(randomSeedFromProjectSettings({ random_seed: false }, ls), false);
    assert.equal(randomSeedFromProjectSettings({}, ls), true);
    const lsOff = { getItem: () => "0" };
    assert.equal(randomSeedFromProjectSettings({}, lsOff), false);
  });
});
