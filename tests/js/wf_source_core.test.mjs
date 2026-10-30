import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { cutBaseKey } from "../../web/gg_wip_core.js";
import { formatShotTabLabel } from "../../web/gg_tab_label_core.js";
import {
  extractPngWorkflow,
  isCutEdited,
  loadEditedMap,
  saveEditedMap,
  widgetValuesDiffer,
} from "../../web/gg_wf_source_core.js";

const PNG_SIG = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]);

const crcTable = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = crcTable[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function writeU32BE(n) {
  return Uint8Array.from([(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff]);
}

function pngChunk(type, data) {
  const t = new TextEncoder().encode(type);
  const len = writeU32BE(data.length);
  const body = new Uint8Array(4 + 4 + data.length + 4);
  body.set(len, 0);
  body.set(t, 4);
  body.set(data, 8);
  const crc = crc32(body.subarray(4, 8 + data.length));
  body.set(writeU32BE(crc), 8 + data.length);
  return body;
}

function buildMinimalPng(extraChunks) {
  const ihdr = pngChunk(
    "IHDR",
    Uint8Array.from([0, 0, 0, 1, 0, 0, 0, 1, 8, 2, 0, 0, 0])
  );
  const parts = [PNG_SIG, ihdr, ...extraChunks, pngChunk("IEND", new Uint8Array(0))];
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const p of parts) {
    out.set(p, off);
    off += p.length;
  }
  return out.buffer;
}

function texWorkflowChunk(jsonObj) {
  const text = JSON.stringify(jsonObj);
  const kw = new TextEncoder().encode("workflow");
  const data = new Uint8Array(kw.length + 1 + new TextEncoder().encode(text).length);
  data.set(kw, 0);
  data[kw.length] = 0;
  data.set(new TextEncoder().encode(text), kw.length + 1);
  return pngChunk("tEXt", data);
}

function texPromptChunk(promptObj) {
  const text = JSON.stringify(promptObj);
  const kw = new TextEncoder().encode("prompt");
  const data = new Uint8Array(kw.length + 1 + new TextEncoder().encode(text).length);
  data.set(kw, 0);
  data[kw.length] = 0;
  data.set(new TextEncoder().encode(text), kw.length + 1);
  return pngChunk("tEXt", data);
}

function itxtWorkflowChunk(jsonObj) {
  const text = JSON.stringify(jsonObj);
  const enc = new TextEncoder();
  const kw = enc.encode("workflow");
  const textBytes = enc.encode(text);
  const data = new Uint8Array(kw.length + 1 + 1 + 1 + 1 + 1 + textBytes.length);
  let i = 0;
  data.set(kw, i);
  i += kw.length + 1;
  data[i++] = 0;
  data[i++] = 0;
  data[i++] = 0;
  data[i++] = 0;
  data.set(textBytes, i);
  return pngChunk("iTXt", data);
}

describe("extractPngWorkflow", () => {
  it("reads tEXt workflow JSON with nodes", () => {
    const wf = { nodes: [{ id: 1, widgets_values: ["a"] }] };
    const buf = buildMinimalPng([texWorkflowChunk(wf)]);
    const got = extractPngWorkflow(buf);
    assert.deepEqual(got?.nodes?.[0]?.widgets_values, ["a"]);
  });

  it("ignores prompt-only tEXt", () => {
    const buf = buildMinimalPng([texPromptChunk({ "3": { class_type: "X" } })]);
    assert.equal(extractPngWorkflow(buf), null);
  });

  it("reads iTXt workflow", () => {
    const wf = { nodes: [{ id: 2, type: "Test" }] };
    const buf = buildMinimalPng([itxtWorkflowChunk(wf)]);
    assert.equal(extractPngWorkflow(buf)?.nodes?.[0]?.id, 2);
  });

  it("returns null on truncated buffer", () => {
    const buf = buildMinimalPng([texWorkflowChunk({ nodes: [] })]);
    const short = buf.slice(0, 32);
    assert.equal(extractPngWorkflow(short), null);
  });
});

describe("widgetValuesDiffer", () => {
  const base = { nodes: [{ id: 1, widgets_values: [1, "x"] }, { id: 2, widgets_values: [] }] };

  it("false when only pos differs", () => {
    const cur = {
      nodes: [
        { id: 1, pos: [100, 200], widgets_values: [1, "x"] },
        { id: 2, widgets_values: [] },
      ],
    };
    assert.equal(widgetValuesDiffer(base, cur), false);
  });

  it("true when widget value changes", () => {
    const cur = { nodes: [{ id: 1, widgets_values: [2, "x"] }, { id: 2, widgets_values: [] }] };
    assert.equal(widgetValuesDiffer(base, cur), true);
  });

  it("true when node added", () => {
    const cur = { nodes: [...base.nodes, { id: 3, widgets_values: [] }] };
    assert.equal(widgetValuesDiffer(base, cur), true);
  });
});

describe("edited map", () => {
  it("round trips via storage", () => {
    const store = new Map();
    const storage = {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, v),
    };
    saveEditedMap(storage, { c1: "a:1" });
    assert.deepEqual(loadEditedMap(storage), { c1: "a:1" });
  });

  it("tolerates corrupt JSON", () => {
    const storage = { getItem: () => "{not json", setItem: () => {} };
    assert.deepEqual(loadEditedMap(storage), {});
  });

  it("isCutEdited matches cutId and baseKey", () => {
    const map = { cutA: "pick:ver1" };
    assert.equal(isCutEdited(map, "cutA", "pick:ver1"), true);
    assert.equal(isCutEdited(map, "cutA", "pick:ver2"), false);
    assert.equal(isCutEdited(map, "cutB", "pick:ver1"), false);
  });

  it("new generation clears marker when baseKey changes", () => {
    const cut = { pick: "v1", versions_list: [{ id: "v1", created: 1 }] };
    const key1 = cutBaseKey(cut);
    const map = { c1: key1 };
    assert.equal(isCutEdited(map, "c1", key1), true);
    const bumped = {
      pick: "v2",
      versions_list: [
        { id: "v1", created: 1 },
        { id: "v2", created: 2 },
      ],
    };
    const key2 = cutBaseKey(bumped);
    assert.notEqual(key1, key2);
    assert.equal(isCutEdited(map, "c1", key2), false);
  });
});

describe("formatShotTabLabel edited", () => {
  it("appends star at the end", () => {
    assert.equal(
      formatShotTabLabel({ projectName: "P", sceneName: "Intro", cutLabel: "1-1", edited: true }),
      "1-1 Intro / P *"
    );
  });
});
