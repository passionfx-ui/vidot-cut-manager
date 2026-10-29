import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ZOOM_MIN_PX,
  ZOOM_MAX_PX,
  clampPx,
  thumbFromScroll,
  scrollFromThumbLeft,
  zoomFromHandle,
  fitPx,
  scrollForZoomAt,
  wheelZoomFactor,
  zoomKeyAction,
} from "../../web/gg_zoombar_core.js";

const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) <= eps, `${a} != ${b}`);

describe("clampPx", () => {
  it("keeps 6..240 and rounds to 0.01", () => {
    assert.equal(ZOOM_MIN_PX, 6);
    assert.equal(ZOOM_MAX_PX, 240);
    assert.equal(clampPx(1), 6);
    assert.equal(clampPx(999), 240);
    assert.equal(clampPx(48.123), 48.12);
    assert.equal(clampPx(NaN), 6);
  });
});

describe("thumbFromScroll", () => {
  it("fills the bar when nothing scrolls", () => {
    assert.deepEqual(thumbFromScroll({ scrollLeft: 0, scrollWidth: 500, clientWidth: 500, barW: 400 }), { left: 0, width: 400 });
    assert.deepEqual(thumbFromScroll({ scrollLeft: 0, scrollWidth: 300, clientWidth: 500, barW: 400 }), { left: 0, width: 400 });
  });
  it("is proportional to the visible window", () => {
    const t0 = thumbFromScroll({ scrollLeft: 0, scrollWidth: 2000, clientWidth: 500, barW: 400 });
    assert.deepEqual(t0, { left: 0, width: 100 });
    const tEnd = thumbFromScroll({ scrollLeft: 1500, scrollWidth: 2000, clientWidth: 500, barW: 400 });
    assert.deepEqual(tEnd, { left: 300, width: 100 });
    const tMid = thumbFromScroll({ scrollLeft: 750, scrollWidth: 2000, clientWidth: 500, barW: 400 });
    near(tMid.left, 150);
  });
  it("respects the minimum thumb and still reaches both ends", () => {
    const t = thumbFromScroll({ scrollLeft: 99000, scrollWidth: 100000, clientWidth: 1000, barW: 400, minThumb: 24 });
    assert.equal(t.width, 24);
    near(t.left, 376);
  });
  it("handles a zero-width bar", () => {
    assert.deepEqual(thumbFromScroll({ scrollLeft: 0, scrollWidth: 2000, clientWidth: 500, barW: 0 }), { left: 0, width: 0 });
  });
});

describe("scrollFromThumbLeft", () => {
  it("inverts thumbFromScroll", () => {
    const s = { scrollWidth: 2000, clientWidth: 500, barW: 400 };
    for (const sl of [0, 333, 750, 1500]) {
      const t = thumbFromScroll({ ...s, scrollLeft: sl });
      near(scrollFromThumbLeft({ left: t.left, width: t.width, barW: 400, maxScroll: 1500 }), sl);
    }
  });
  it("clamps past either end and when nothing scrolls", () => {
    assert.equal(scrollFromThumbLeft({ left: -50, width: 100, barW: 400, maxScroll: 1500 }), 0);
    assert.equal(scrollFromThumbLeft({ left: 900, width: 100, barW: 400, maxScroll: 1500 }), 1500);
    assert.equal(scrollFromThumbLeft({ left: 10, width: 400, barW: 400, maxScroll: 0 }), 0);
  });
});

describe("zoomFromHandle", () => {
  // 62 s sequence (60 s + 2 s tail), 16 px padding, 1016 px viewport.
  const base = { seqSec: 62, clientWidth: 1016, pad: 16 };
  const fracs = (px, sl) => {
    const W = 62 * px + 16;
    return { startFrac: sl / W, endFrac: (sl + 1016) / W };
  };

  it("right handle inward zooms in and keeps the left edge", () => {
    const f = fracs(20, 200);
    const r = zoomFromHandle({ ...base, ...f, side: "r", edgeFrac: f.startFrac + (f.endFrac - f.startFrac) / 2 });
    assert.ok(r.px > 20);
    const W2 = 62 * r.px + 16;
    near(r.scrollLeft / W2, f.startFrac, 1e-3);
    near((r.scrollLeft + 1016) / W2 - r.scrollLeft / W2, (f.endFrac - f.startFrac) / 2, 2e-3);
  });

  it("left handle inward zooms in and keeps the right edge", () => {
    const f = fracs(20, 200);
    const r = zoomFromHandle({ ...base, ...f, side: "l", edgeFrac: f.startFrac + (f.endFrac - f.startFrac) / 2 });
    assert.ok(r.px > 20);
    const W2 = 62 * r.px + 16;
    near((r.scrollLeft + 1016) / W2, f.endFrac, 1e-3);
  });

  it("outward drag zooms out", () => {
    const f = fracs(40, 400);
    const r = zoomFromHandle({ ...base, ...f, side: "r", edgeFrac: Math.min(1, f.endFrac + 0.2) });
    assert.ok(r.px < 40);
  });

  it("clamps px and scroll", () => {
    const f = fracs(20, 0);
    const tight = zoomFromHandle({ ...base, ...f, side: "r", edgeFrac: f.startFrac });
    assert.equal(tight.px, 240);
    const wide = zoomFromHandle({ ...base, startFrac: 0, endFrac: 0.5, side: "r", edgeFrac: 1 });
    assert.equal(wide.px, 16.13);
    const W = 62 * wide.px + 16;
    assert.ok(wide.scrollLeft >= 0 && wide.scrollLeft <= Math.max(0, W - 1016));
    const lo = zoomFromHandle({ seqSec: 600, clientWidth: 1016, pad: 16, startFrac: 0, endFrac: 0.9, side: "r", edgeFrac: 1 });
    assert.equal(lo.px, 6);
  });
});

describe("fitPx", () => {
  it("fits the whole sequence into the viewport", () => {
    const px = fitPx({ seqSec: 62, clientWidth: 1016, pad: 16 });
    assert.equal(px, 16.12);
    assert.ok(Math.ceil(62 * px) <= 1000);
    assert.equal(fitPx({ seqSec: 2, clientWidth: 1016, pad: 16 }), 240);
    assert.equal(fitPx({ seqSec: 1000, clientWidth: 1016, pad: 16 }), 6);
  });
});

describe("scrollForZoomAt", () => {
  it("keeps the time under the pointer fixed", () => {
    const px = 20, nextPx = 40, sl = 300, x = 250, padLeft = 8;
    const t = (sl + x - padLeft) / px;
    const sl2 = scrollForZoomAt({ px, nextPx, scrollLeft: sl, x, padLeft });
    near((sl2 + x - padLeft) / nextPx, t);
  });
  it("never goes negative", () => {
    assert.equal(scrollForZoomAt({ px: 40, nextPx: 10, scrollLeft: 0, x: 500, padLeft: 8 }), 0);
  });
});

describe("wheelZoomFactor", () => {
  it("wheel up zooms in, down zooms out, symmetric", () => {
    assert.ok(wheelZoomFactor(-100) > 1);
    assert.ok(wheelZoomFactor(100) < 1);
    near(wheelZoomFactor(-100) * wheelZoomFactor(100), 1);
    assert.equal(wheelZoomFactor(0), 1);
  });
  it("scales line mode and caps huge deltas", () => {
    near(wheelZoomFactor(3, 1), wheelZoomFactor(48, 0));
    assert.equal(wheelZoomFactor(1e6), wheelZoomFactor(400));
  });
});

describe("zoomKeyAction", () => {
  it("maps bare = / + / -", () => {
    assert.equal(zoomKeyAction({ key: "=" }), "zoom-in");
    assert.equal(zoomKeyAction({ key: "+", shiftKey: true }), "zoom-in");
    assert.equal(zoomKeyAction({ key: "-" }), "zoom-out");
    assert.equal(zoomKeyAction({ key: "_" }), null);
    assert.equal(zoomKeyAction({ key: "t" }), null);
  });
  it("leaves modified keys to the browser / ComfyUI", () => {
    assert.equal(zoomKeyAction({ key: "=", ctrlKey: true }), null);
    assert.equal(zoomKeyAction({ key: "-", metaKey: true }), null);
    assert.equal(zoomKeyAction({ key: "=", altKey: true }), null);
    assert.equal(zoomKeyAction({ key: "-", isComposing: true }), null);
    assert.equal(zoomKeyAction(null), null);
  });
});
