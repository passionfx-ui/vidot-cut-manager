/** Animated WebP structure walk + per-frame still WebP bytes (no ImageDecoder; Node-safe). */

/**
 * @param {ArrayBuffer|Uint8Array} buf
 * @returns {{ frames: number, seconds: number|null, frameWebps: Uint8Array[] }|null}
 */
export function parseAnimatedWebp(buf) {
  const u8 = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  if (u8.length < 12 || readFour(u8, 0) !== "RIFF" || readFour(u8, 8) !== "WEBP") {
    return null;
  }
  let pos = 12;
  let frameWebps = [];
  let durationsMs = [];
  let totalMs = 0;
  while (pos + 8 <= u8.length) {
    const fourcc = readFour(u8, pos);
    const size = readU32(u8, pos + 4);
    const dataStart = pos + 8;
    const dataEnd = dataStart + size;
    if (dataEnd > u8.length) break;
    if (fourcc === "ANMF") {
      if (size >= 16) {
        const ms = u8[dataStart + 12] | (u8[dataStart + 13] << 8) | (u8[dataStart + 14] << 16);
        totalMs += ms;
        durationsMs.push(ms);
        const inner = u8.subarray(dataStart + 16, dataEnd);
        frameWebps.push(wrapStillWebp(inner));
      }
    }
    pos = dataEnd + (size & 1);
  }
  if (frameWebps.length < 2) return null;
  return {
    frames: frameWebps.length,
    seconds: totalMs > 0 ? Math.round((totalMs / 1000) * 1000) / 1000 : null,
    frameWebps,
    durationsMs,
  };
}

/** @param {Uint8Array} inner bytes after the 16-byte ANMF header (VP8/VP8L/ALPH chunks). */
export function wrapStillWebp(inner) {
  const body = concatBytes(textEnc("WEBP"), inner);
  const riffSize = body.length + 4;
  const head = concatBytes(textEnc("RIFF"), u32le(riffSize), body);
  return head;
}

/** @param {ArrayBuffer|Uint8Array} buf @param {number} index */
export function animatedWebpFrameBytes(buf, index) {
  const parsed = parseAnimatedWebp(buf);
  if (!parsed) return null;
  const i = Math.min(parsed.frameWebps.length - 1, Math.max(0, index | 0));
  return parsed.frameWebps[i];
}

function readFour(u8, off) {
  return String.fromCharCode(u8[off], u8[off + 1], u8[off + 2], u8[off + 3]);
}

function readU32(u8, off) {
  return u8[off] | (u8[off + 1] << 8) | (u8[off + 2] << 16) | (u8[off + 3] << 24);
}

function textEnc(s) {
  return new TextEncoder().encode(s);
}

function u32le(n) {
  const b = new Uint8Array(4);
  b[0] = n & 255;
  b[1] = (n >> 8) & 255;
  b[2] = (n >> 16) & 255;
  b[3] = (n >> 24) & 255;
  return b;
}

function concatBytes(...parts) {
  let n = 0;
  for (const p of parts) n += p.length;
  const out = new Uint8Array(n);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}
