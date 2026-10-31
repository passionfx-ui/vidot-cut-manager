import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { animatedWebpFrameBytes, parseAnimatedWebp, wrapStillWebp } from "../../web/gg_webp_anim_core.js";

function riff(fourcc, data) {
  const pad = data.length & 1 ? 1 : 0;
  const size = data.length;
  const head = new Uint8Array(8 + size + pad);
  head.set(new TextEncoder().encode(fourcc), 0);
  head[4] = size & 255;
  head[5] = (size >> 8) & 255;
  head[6] = (size >> 16) & 255;
  head[7] = (size >> 24) & 255;
  head.set(data, 8);
  return head;
}

function buildTestWebp(durationsMs) {
  let body = riff("VP8X", new Uint8Array([0x02, ...new Array(9).fill(0)]));
  body = concat(body, riff("ANIM", new Uint8Array(6)));
  for (const ms of durationsMs) {
    const dur = new Uint8Array(16);
    dur[12] = ms & 255;
    dur[13] = (ms >> 8) & 255;
    dur[14] = (ms >> 16) & 255;
    const vp8l = riff("VP8L", new Uint8Array([0x2f, 0, 0, 0]));
    body = concat(body, riff("ANMF", concat(dur, vp8l)));
  }
  const webp = concat(new TextEncoder().encode("WEBP"), body);
  const size = webp.length + 4;
  const out = new Uint8Array(8 + webp.length);
  out.set(new TextEncoder().encode("RIFF"), 0);
  out[4] = size & 255;
  out[5] = (size >> 8) & 255;
  out[6] = (size >> 16) & 255;
  out[7] = (size >> 24) & 255;
  out.set(webp, 8);
  return out;
}

function concat(a, b) {
  const out = new Uint8Array(a.length + b.length);
  out.set(a, 0);
  out.set(b, a.length);
  return out;
}

describe("parseAnimatedWebp", () => {
  it("reads frame count and duration from ANMF chunks", () => {
    const buf = buildTestWebp([500, 250, 250]);
    const p = parseAnimatedWebp(buf);
    assert.ok(p);
    assert.equal(p.frames, 3);
    assert.equal(p.seconds, 1);
    assert.equal(p.frameWebps.length, 3);
    assert.deepEqual(p.durationsMs, [500, 250, 250]);
  });

  it("returns null for still webp", () => {
    const body = concat(new TextEncoder().encode("WEBP"), riff("VP8L", new Uint8Array([0x2f, 0, 0, 0])));
    const size = body.length + 4;
    const buf = new Uint8Array(8 + body.length);
    buf.set(new TextEncoder().encode("RIFF"), 0);
    buf[4] = size & 255;
    buf[5] = (size >> 8) & 255;
    buf[6] = (size >> 16) & 255;
    buf[7] = (size >> 24) & 255;
    buf.set(body, 8);
    assert.equal(parseAnimatedWebp(buf), null);
  });
});

describe("animatedWebpFrameBytes", () => {
  it("extracts a wrapped still webp per index", () => {
    const buf = buildTestWebp([100, 100]);
    const f0 = animatedWebpFrameBytes(buf, 0);
    const f1 = animatedWebpFrameBytes(buf, 1);
    assert.ok(f0 && f1);
    assert.notEqual(f0.length, 0);
    assert.ok(String.fromCharCode(...f0.subarray(0, 4)) === "RIFF");
    assert.ok(String.fromCharCode(...f0.subarray(8, 12)) === "WEBP");
  });
});

describe("wrapStillWebp", () => {
  it("builds a RIFF WEBP container", () => {
    const inner = riff("VP8L", new Uint8Array([1, 2, 3]));
    const w = wrapStillWebp(inner);
    assert.equal(String.fromCharCode(...w.subarray(0, 4)), "RIFF");
    assert.equal(String.fromCharCode(...w.subarray(8, 12)), "WEBP");
  });
});
