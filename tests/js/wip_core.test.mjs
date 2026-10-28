import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { cutBaseKey, stampWip, shouldRestoreWip } from "../../web/gg_wip_core.js";

describe("cutBaseKey", () => {
  it("uses pick and latest version id", () => {
    const cut = {
      pick: "v2",
      versions_list: [
        { id: "v1", created: 1 },
        { id: "v2", created: 3 },
        { id: "v3", created: 2 },
      ],
    };
    assert.equal(cutBaseKey(cut), "v2:v2");
  });

  it("changes when pick changes", () => {
    const base = {
      pick: "a",
      versions_list: [{ id: "a", created: 1 }, { id: "b", created: 2 }],
    };
    const k1 = cutBaseKey(base);
    const k2 = cutBaseKey({ ...base, pick: "b" });
    assert.notEqual(k1, k2);
  });

  it("changes when a newer version is added", () => {
    const cut = {
      pick: "a",
      versions_list: [{ id: "a", created: 1 }],
    };
    const k1 = cutBaseKey(cut);
    const k2 = cutBaseKey({
      ...cut,
      versions_list: [
        { id: "a", created: 1 },
        { id: "c", created: 5 },
      ],
    });
    assert.notEqual(k1, k2);
  });
});

describe("stampWip + shouldRestoreWip", () => {
  const cutId = "cut-1";
  const baseKey = "v1:v1";

  it("matches when cut and baseKey equal", () => {
    const extra = stampWip({}, { cutId, baseKey, at: 100 });
    const wf = { extra };
    assert.equal(shouldRestoreWip(wf, { cutId, baseKey }), true);
  });

  it("rejects different cut", () => {
    const extra = stampWip({}, { cutId, baseKey });
    assert.equal(shouldRestoreWip({ extra }, { cutId: "other", baseKey }), false);
  });

  it("rejects baseKey mismatch after new version", () => {
    const extra = stampWip({}, { cutId, baseKey: "v1:v1" });
    assert.equal(shouldRestoreWip({ extra }, { cutId, baseKey: "v1:v2" }), false);
  });

  it("rejects when no stamp", () => {
    assert.equal(shouldRestoreWip({ extra: {} }, { cutId, baseKey }), false);
    assert.equal(shouldRestoreWip({}, { cutId, baseKey }), false);
  });
});
