import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  GEN_SHORT_SIDE_OPTIONS,
  GEN_RESOLUTION_CUSTOM,
  dimensionsFromGenSettings,
  normalizeGenSettings,
  genSettingsModalPatch,
  genFormFromResolutionChoice,
  resolutionDropdownItems,
  resolutionChoiceValue,
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

  it("lists short-side presets and a Custom choice", () => {
    assert.deepEqual(
      GEN_SHORT_SIDE_OPTIONS,
      [384, 480, 512, 576, 640, 720, 768, 832, 960, 1024, 1080, 1280, 1440, 2160],
    );
    const items = resolutionDropdownItems();
    assert.equal(items.length, GEN_SHORT_SIDE_OPTIONS.length + 1);
    assert.equal(items.at(-1).value, GEN_RESOLUTION_CUSTOM);
    assert.equal(items.at(-1).label, "Custom");
    assert.equal(resolutionChoiceValue(720), "720");
    assert.equal(resolutionChoiceValue("custom"), "custom");
  });

  it("preset resolution still follows aspect ratio", () => {
    const wide = dimensionsFromGenSettings("16:9", 1080);
    assert.equal(wide.width, 1920);
    assert.equal(wide.height, 1080);
    const cur = normalizeGenSettings({ gen_aspect: "16:9", resolution_short: 720, random_seed: true });
    const p = genSettingsModalPatch(cur, { gen_aspect: "1:1", resolution_short: 720, random_seed: true });
    assert.equal(p.resolution_short, undefined);
    assert.equal(p.gen_aspect, "1:1");
    assert.equal(p.width, 720);
    assert.equal(p.height, 720);
  });

  it("custom width and height snap to multiples of 8 and ignore aspect", () => {
    const n = normalizeGenSettings({
      gen_aspect: "16:9",
      resolution_short: "custom",
      width: 1001,
      height: 503,
      random_seed: false,
    });
    assert.equal(n.resolution_short, "custom");
    assert.equal(n.gen_aspect, "16:9");
    assert.equal(n.width, 1000);
    assert.equal(n.height, 496);
    assert.equal(n.width % 8, 0);
    assert.equal(n.height % 8, 0);
    const again = normalizeGenSettings({ ...n, gen_aspect: "1:1" });
    assert.equal(again.resolution_short, "custom");
    assert.equal(again.width, 1000);
    assert.equal(again.height, 496);
    assert.equal(again.gen_aspect, "1:1");
  });

  it("existing preset projects stay on that preset", () => {
    const kept = normalizeGenSettings({
      gen_aspect: "16:9",
      resolution_short: 720,
      width: 1280,
      height: 720,
    });
    assert.equal(kept.resolution_short, 720);
    assert.equal(kept.width, 1280);
    assert.equal(kept.height, 720);
    const old = normalizeGenSettings({ aspect: "9:16", width: 720, height: 1280 });
    assert.equal(old.resolution_short, 720);
    assert.notEqual(old.resolution_short, "custom");
    assert.equal(old.width, 720);
    assert.equal(old.height, 1280);
  });

  it("genSettingsModalPatch saves custom size and leaves aspect-only edits on custom", () => {
    const cur = normalizeGenSettings({ gen_aspect: "16:9", resolution_short: 720, random_seed: true });
    const form = genFormFromResolutionChoice({
      gen_aspect: "16:9",
      resolution: "custom",
      width: 641,
      height: 481,
      random_seed: true,
    });
    const p = genSettingsModalPatch(cur, form);
    assert.equal(p.resolution_short, "custom");
    assert.equal(p.width, 640);
    assert.equal(p.height, 480);
    const custom = normalizeGenSettings({ ...cur, ...form });
    const aspectOnly = genSettingsModalPatch(custom, genFormFromResolutionChoice({
      gen_aspect: "4:3",
      resolution: "custom",
      width: 640,
      height: 480,
      random_seed: true,
    }));
    assert.equal(aspectOnly.gen_aspect, "4:3");
    assert.equal(aspectOnly.width, undefined);
    assert.equal(aspectOnly.height, undefined);
    assert.equal(aspectOnly.resolution_short, undefined);
  });

  it("randomSeedFromProjectSettings prefers project", () => {
    const ls = { getItem: () => "1" };
    assert.equal(randomSeedFromProjectSettings({ random_seed: false }, ls), false);
    assert.equal(randomSeedFromProjectSettings({}, ls), true);
    const lsOff = { getItem: () => "0" };
    assert.equal(randomSeedFromProjectSettings({}, lsOff), false);
  });
});
