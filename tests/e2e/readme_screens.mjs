/**
 * Capture README screenshots (docs/images/*.png) against live ComfyUI.
 * Project display name: "Demo film" only. Blocks POST /prompt and /gonggan/regen.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";
import { waitForDomCutCountSync } from "./dom_sync_helpers.mjs";
import { fillNewProjectModal } from "./new_project_helpers.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "../..");
const OUT_DIR = path.join(REPO_ROOT, "docs", "images");
const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const BASE = process.env.BASE_URL || "http://127.0.0.1:8188";
const MIN_RAM = 40 * 1024 ** 3;
const VIEWPORT = { width: 1600, height: 900, deviceScaleFactor: 1 };
const PROJECT_NAME = "Demo film";
const BLOCKED_POST = [
  /\/prompt(\?|$)/,
  /\/api\/prompt(\?|$)/,
  /\/gonggan\/regen(\?|$)/,
  /\/api\/gonggan\/regen(\?|$)/,
];

const runStamp = Date.now();
const createdProjectIds = [];
/** @type {Map<string, object>} */
const timelineMocks = new Map();
/** @type {Map<string, Buffer>} */
const mediaBytes = new Map();
let blockedPromptAttempts = 0;
let demoPid = "";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function checkRam(label) {
  const free = os.freemem();
  if (free < MIN_RAM) {
    const err = new Error(`RAM check failed (${label}): ${Math.round(free / 1e9)} GB free, need 40+ GB`);
    err.skipped = true;
    throw err;
  }
}

function isBlockedPost(url, method) {
  if (method !== "POST") return false;
  try {
    const p = new URL(url).pathname;
    return BLOCKED_POST.some((re) => re.test(p));
  } catch {
    return false;
  }
}

function attachRequestGuard(page) {
  page.on("request", (req) => {
    const url = req.url();
    const method = req.method();
    if (isBlockedPost(url, method)) {
      blockedPromptAttempts += 1;
      console.error(`BLOCKED UNSAFE POST: ${method} ${url}`);
      req.abort("blockedbyclient");
      return;
    }
    if (method === "GET" && /gonggan\/(poster|media)/.test(url)) {
      try {
        const id = new URL(url).searchParams.get("id");
        if (id && mediaBytes.has(id)) {
          req.respond({ status: 200, contentType: "image/png", body: mediaBytes.get(id) });
          return;
        }
      } catch (_) {}
    }
    if (method === "GET" && /gonggan\/timeline/.test(url)) {
      try {
        const u = new URL(url);
        const pid = u.searchParams.get("pid");
        if (pid && timelineMocks.has(pid)) {
          req.respond({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify(timelineMocks.get(pid)),
          });
          return;
        }
      } catch (_) {}
    }
    if (method === "POST" && /\/gonggan\/edit$/.test(new URL(url).pathname)) {
      try {
        const raw = req.postData() || "{}";
        const body = JSON.parse(raw);
        const pid = body.pid;
        if (pid && timelineMocks.has(pid)) {
          const tl = timelineMocks.get(pid);
          const clips = body.clips || {};
          for (const c of tl.cuts || []) {
            const clip = clips[c.id];
            if (clip && clip.pick) {
              c.pick = clip.pick;
              const v = (c.versions_list || []).find((x) => x.id === clip.pick);
              if (v) c.media = { id: v.id, kind: v.kind };
            }
            if (clip && typeof clip.in === "number") c.in = clip.in;
            if (clip && typeof clip.sec === "number") c.sec = clip.sec;
          }
          req.respond({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({ ok: true, ...tl }),
          });
          return;
        }
      } catch (_) {}
    }
    req.continue();
  });
}

async function postJson(page, route, body) {
  return page.evaluate(async (r, b) => {
    const res = await fetch(r.startsWith("http") ? r : `${location.origin}${r}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(b),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.ok === false) throw new Error(data.message || data.error || `HTTP ${res.status}`);
    return data;
  }, route, body);
}

async function launchBrowser() {
  const userDataDir = path.join(os.tmpdir(), `gg-readme-screens-${runStamp}`);
  fs.mkdirSync(userDataDir, { recursive: true });
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: true,
    userDataDir,
    args: ["--no-sandbox", "--disable-dev-shm-usage", `--window-size=${VIEWPORT.width},${VIEWPORT.height}`],
    defaultViewport: VIEWPORT,
  });
  browser._ggUserDataDir = userDataDir;
  return browser;
}

async function closeBrowser(browser) {
  if (!browser) return;
  const dir = browser._ggUserDataDir;
  try {
    await browser.close();
  } finally {
    if (dir) {
      try {
        fs.rmSync(dir, { recursive: true, force: true });
      } catch (_) {}
    }
  }
}

async function waitForComfy(page) {
  await page.goto(BASE, { waitUntil: "domcontentloaded", timeout: 120000 });
  await page.waitForFunction(() => window.app?.extensionManager, { timeout: 120000 });
  await sleep(1500);
}

async function openShotsTab(page) {
  const opened = await page.evaluate(() => {
    const st = window.app?.extensionManager?.sidebarTab;
    if (st) {
      st.activeSidebarTabId = "gg-shots";
      return true;
    }
    return false;
  });
  if (!opened) {
    const btn = await page.waitForSelector('[aria-label="Vidot Studio – Cut Manager"]', { timeout: 15000 });
    await btn.click();
  }
  await page.waitForSelector(".gg-root.gg-shots", { timeout: 60000 });
}

async function clickCtxItem(page, label) {
  await page.waitForSelector(".gg-ctx", { timeout: 8000 });
  const items = await page.$$(".gg-ctx-item");
  for (const it of items) {
    const t = await page.evaluate((n) => n.textContent?.trim(), it);
    if (t === label) {
      await it.click();
      return;
    }
  }
  throw new Error(`Context menu item not found: ${label}`);
}

async function createProjectViaUi(page, name, templateRef) {
  await page.evaluate(() => {
    document.querySelector(".gg-root.gg-shots .gg-head")?.dispatchEvent(
      new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 80, clientY: 40 })
    );
  });
  await clickCtxItem(page, "New Project…");
  await fillNewProjectModal(page, { name, templateRef });
  await page.click(".gg-modal-create");
  await page.waitForFunction(
    (n) => {
      const sel = document.querySelector(".gg-root.gg-shots .gg-proj");
      const opt = sel?.options[sel.selectedIndex];
      return opt && opt.textContent.includes(n);
    },
    { timeout: 30000 },
    name
  );
  const pid = await page.$eval(".gg-root.gg-shots .gg-proj", (sel) => sel.value);
  if (pid) createdProjectIds.push(pid);
  await waitForDomCutCountSync(page);
  return pid;
}

async function reloadShots(page) {
  for (let i = 0; ; i++) {
    try {
      await page.waitForSelector(".gg-root.gg-shots .gg-reload", { visible: true, timeout: 5000 });
      await page.click(".gg-root.gg-shots .gg-reload");
      break;
    } catch (e) {
      if (i >= 3) throw e;
      await sleep(600);
    }
  }
  await sleep(1200);
}

async function fetchWorkflowPaths(page) {
  return page.evaluate(async () => {
    const res = await fetch("/api/userdata?dir=workflows&recurse=true&split=false");
    const data = await res.json().catch(() => null);
    if (Array.isArray(data)) {
      return data
        .map((x) => (typeof x === "string" ? x : x.path || x.name || ""))
        .filter(Boolean)
        .map((p) => String(p).replace(/^\/+/, ""));
    }
    if (data && typeof data === "object") return Object.keys(data);
    return [];
  });
}

async function pickUsableTemplateRef(page, paths) {
  const norm = (p) => String(p).replace(/^\/+/, "");
  const base = (p) => norm(p).replace(/^.*\//, "").toLowerCase();
  const cands = paths.filter(
    (p) => base(p).endsWith(".json") && !/^cut\d+\.json$/i.test(base(p)) && !norm(p).startsWith("gonggan/") && !/_api\.json$/i.test(base(p))
  );
  for (const p of cands.slice(0, 40)) {
    const ok = await page.evaluate(async (rel) => {
      try {
        const r = await fetch(`/api/userdata/${encodeURIComponent("workflows/" + rel)}`);
        if (!r.ok) return false;
        const j = await r.json();
        return Array.isArray(j.nodes) && j.nodes.length > 0 && j.nodes.length < 80;
      } catch (_) {
        return false;
      }
    }, norm(p));
    if (ok) return norm(p);
  }
  return "";
}

async function waitForToastsClear(page, timeoutMs = 8000) {
  await page
    .waitForFunction(() => !document.querySelector(".gg-toast, .comfy-toast"), { timeout: timeoutMs })
    .catch(() => sleep(2500));
}

async function setTimelineOpen(page, open) {
  await page.evaluate(async (wantOpen) => {
    localStorage.setItem("gg.timelineOpen", wantOpen ? "1" : "0");
    for (let i = 0; i < 5; i++) {
      const el = document.querySelector(".gg-timeline");
      const visible = !!(el && el.offsetParent && el.getBoundingClientRect().height > 120);
      if (visible === wantOpen) break;
      document.querySelector(".gg-root.gg-shots .gg-timeline-toggle")?.click();
      await new Promise((r) => setTimeout(r, 450));
    }
  }, open);
  await sleep(600);
}

async function ensureTimelineVisible(page) {
  await setTimelineOpen(page, true);
  await page.waitForFunction(
    () => {
      const el = document.querySelector(".gg-timeline");
      return el && el.offsetParent && el.getBoundingClientRect().height >= 180;
    },
    { timeout: 15000 }
  );
  await sleep(500);
}

async function screenshotTo(page, filename) {
  const p = path.join(OUT_DIR, filename);
  await page.screenshot({ path: p, fullPage: false });
  console.log(`Wrote ${p}`);
  return p;
}

async function makePlaceholderPng(page, label, hue) {
  const b64 = await page.evaluate(
    (text, h) => {
      const c = document.createElement("canvas");
      c.width = 320;
      c.height = 180;
      const ctx = c.getContext("2d");
      const g = ctx.createLinearGradient(0, 0, c.width, c.height);
      g.addColorStop(0, `hsl(${h % 360}, 55%, 42%)`);
      g.addColorStop(1, `hsl(${(h + 50) % 360}, 45%, 22%)`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, c.width, c.height);
      ctx.fillStyle = "rgba(0,0,0,0.35)";
      ctx.fillRect(0, 0, c.width, c.height);
      ctx.fillStyle = "#f4f4f4";
      ctx.font = "600 26px system-ui,Segoe UI,sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(text, c.width / 2, c.height / 2);
      return c.toDataURL("image/png").split(",")[1];
    },
    label,
    hue
  );
  return Buffer.from(b64, "base64");
}

/**
 * @param {string} pid
 * @param {number} stamp
 */
function buildReadmeMockTimeline(pid, stamp) {
  const g1 = `scene-1-${stamp}`;
  const g2 = `scene-2-${stamp}`;
  /** @type {Array<[string,string,string,{image:boolean,video:boolean,best:boolean}]>} */
  const spec = [
    ["1-1", "Dawn", "Wide shot, the city wakes up", { image: true, video: true, best: true }],
    ["1-2", "Street", "", { image: true, video: true, best: false }],
    ["1-3", "Crowd", "", { image: true, video: false, best: false }],
    ["2-1", "Window", "Close-up: she looks at the camera", { image: true, video: true, best: true }],
    ["2-2", "Room", "", { image: true, video: true, best: true }],
    ["2-3", "Title", "", { image: false, video: false, best: false }],
  ];
  const cuts = [];
  let pos = 0;
  for (let i = 0; i < spec.length; i++) {
    const [numLabel, cutName, caption, stages] = spec[i];
    const cutId = `cut-${numLabel.replace("-", "")}-${stamp}`;
    const vImg = `ver-img-${cutId}`;
    const vVid = `ver-vid-${cutId}`;
    const groupId = i < 3 ? g1 : g2;
    const versions_list = [];
    if (stages.image) {
      versions_list.push({ id: vImg, kind: "image", source: "native", created: 1, seconds: 0, width: 320, height: 180 });
    }
    if (stages.video) {
      versions_list.push({ id: vVid, kind: "video", source: "native", created: 2, seconds: 2.5, width: 320, height: 180 });
    }
    let pick = null;
    let media = null;
    if (stages.best) {
      pick = vImg;
      media = { id: vImg, kind: "image" };
    } else if (stages.video) {
      pick = null;
      media = { id: vVid, kind: "video" };
    } else if (stages.image) {
      media = { id: vImg, kind: "image" };
    }
    cuts.push({
      id: cutId,
      name: cutName,
      number: i + 1,
      pos,
      index: i,
      sec: 3,
      in: 0,
      start: pos,
      group_id: groupId,
      group_name: groupId === g1 ? "Scene 1" : "Scene 2",
      scene_index: groupId === g1 ? 0 : 1,
      media,
      pick,
      caption,
      notes: "",
      versions: versions_list.length,
      versions_list,
      planned_sec: null,
      end_card: false,
      needs_redo: false,
    });
    pos += 3;
  }
  return {
    ok: true,
    project: { id: pid, name: PROJECT_NAME, native: true, due_date: "2026-10-30" },
    groups: [
      { id: g1, name: "Scene 1", cut_ids: cuts.slice(0, 3).map((c) => c.id), collapsed: false },
      { id: g2, name: "Scene 2", cut_ids: cuts.slice(3).map((c) => c.id), collapsed: false },
    ],
    groups_customized: true,
    total_sec: pos,
    cuts,
  };
}

async function registerMockMedia(page, mock) {
  mediaBytes.clear();
  const labels = ["1-1", "1-2", "1-3", "2-1", "2-2", "2-3"];
  for (let i = 0; i < (mock.cuts || []).length; i++) {
    const c = mock.cuts[i];
    const thumbLabel = `Cut ${labels[i] || i + 1}`;
    const buf = await makePlaceholderPng(page, thumbLabel, 40 + i * 37);
    for (const v of c.versions_list || []) {
      mediaBytes.set(v.id, buf);
    }
    if (c.media?.id) mediaBytes.set(c.media.id, buf);
  }
}

async function cleanupProjects(page) {
  for (const pid of [...new Set(createdProjectIds)]) {
    try {
      await postJson(page, "/gonggan/project/delete", { pid });
    } catch (e) {
      if (!/not found/i.test(e.message)) console.warn(`cleanup delete ${pid}:`, e.message);
    }
  }
}

async function main() {
  try {
    checkRam("startup");
  } catch (e) {
    if (e.skipped) {
      console.log(`SKIP RAM: ${e.message}`);
    } else {
      throw e;
    }
  }

  if (!fs.existsSync(CHROME)) {
    console.error(`Chrome not found at ${CHROME}`);
    process.exit(2);
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });

  const browser = await launchBrowser();
  const page = await browser.newPage();
  page.on("dialog", async (d) => {
    try {
      if (d.type() === "prompt") await d.accept(await d.defaultValue());
      else await d.accept();
    } catch (_) {
      try {
        await d.dismiss();
      } catch (_) {}
    }
  });
  await page.setRequestInterception(true);
  attachRequestGuard(page);

  try {
    await waitForComfy(page);
    await page.evaluate(() => {
      localStorage.setItem("gg.timelineOpen", "0");
    });
    await openShotsTab(page);
    await setTimelineOpen(page, false);

    demoPid = await createProjectViaUi(page, PROJECT_NAME, "");
    const activeName = await page.$eval(".gg-root.gg-shots .gg-proj", (sel) => sel.options[sel.selectedIndex]?.textContent || "");
    if (!activeName.includes(PROJECT_NAME)) throw new Error(`project name mismatch: ${activeName}`);

    const emptyCuts = await page.$$eval(".gg-root.gg-shots .gg-cut", (els) => els.length);
    if (emptyCuts < 1) throw new Error(`expected at least 1 default cut for empty shot, got ${emptyCuts}`);
    const hasEmptyThumb = await page.$(".gg-root.gg-shots .gg-thumb-empty");
    if (!hasEmptyThumb) {
      console.warn("warn: no .gg-thumb-empty on fresh project (still capturing empty.png)");
    }
    await page.click(".gg-root.gg-shots .gg-cut").catch(() => {});
    await sleep(2000);
    await waitForToastsClear(page);
    await setTimelineOpen(page, false);
    await sleep(800);
    await screenshotTo(page, "empty.png");

    const mock = buildReadmeMockTimeline(demoPid, runStamp);
    timelineMocks.set(demoPid, mock);
    await registerMockMedia(page, mock);
    await reloadShots(page);
    await waitForDomCutCountSync(page, 20000);
    const cutCount = await page.$$eval(".gg-root.gg-shots .gg-cut", (els) => els.length);
    if (cutCount !== 6) throw new Error(`expected 6 mocked cuts, got ${cutCount}`);

    await page.evaluate(() => {
      const btn = document.querySelector('.gg-list-toggle button[data-mode="info"]');
      btn?.click();
    });
    await sleep(400);
    await setTimelineOpen(page, false);
    await sleep(600);
    await screenshotTo(page, "shots.png");

    await ensureTimelineVisible(page);
    await page.waitForSelector(".gg-timeline .gg-clip", { timeout: 15000 });
    await sleep(800);
    await screenshotTo(page, "timeline.png");

    await screenshotTo(page, "overview.png");

    if (blockedPromptAttempts > 0) throw new Error(`blocked ${blockedPromptAttempts} unsafe POST(s)`);
  } finally {
    timelineMocks.delete(demoPid);
    try {
      await cleanupProjects(page);
    } catch (e) {
      console.warn("cleanup:", e.message);
    }
    await closeBrowser(browser);
  }

  for (const name of ["empty.png", "shots.png", "timeline.png", "overview.png"]) {
    const p = path.join(OUT_DIR, name);
    if (!fs.existsSync(p) || fs.statSync(p).size < 5000) {
      console.error(`Missing or tiny: ${p}`);
      process.exit(1);
    }
  }
  console.log("Done — docs/images/*.png");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
