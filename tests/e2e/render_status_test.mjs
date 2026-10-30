/**
 * Headless Chrome: per-cut render status badges (0.9.72). Nothing is rendered:
 * - POST /prompt and /api/prompt are intercepted and answered with a fake prompt id (never forwarded)
 * - GET /queue is answered from the test's fake queue
 * - ComfyUI api events (execution_start, progress, execution_success, status) are dispatched in the page
 * Checks: api.queuePrompt with a cut-stamped workflow -> "Queued" on the cut card + timeline clip ->
 * "Rendering 40%" (same DOM row, badge-only update) -> cleared on execution_success;
 * a prompt not tied to a cut -> "Queued" / "Rendering…" next to the status panel Queue button (0.9.97) -> cleared.
 * 0.9.87: cut menu Remove from queue on a queued cut -> POST /queue {delete:[id]} intercepted (never
 * forwarded), badge cleared; execution_error / execution_interrupted -> "Failed" on card + clip, menu lists
 * Re-queue (not clicked here; batch_render_test clicks it).
 * ZZ-test- project only, deleted at the end.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import puppeteer from "puppeteer-core";
import { shotWorkflowRelPathById } from "../../web/gg_shot_names.js";

const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const BASE = process.env.BASE_URL || "http://127.0.0.1:8188";
const VIEWPORT = { width: 1600, height: 900 };
const TEST_PREFIX = "ZZ-test-render-status";
const PROMPT_POST = [/\/prompt(\?|$)/, /\/api\/prompt(\?|$)/];
const QUEUE_GET = [/^\/queue$/, /^\/api\/queue$/];

const runStamp = Date.now();
const USER_DATA_DIR = path.join(os.tmpdir(), `gg-render-status-${runStamp}`);
const createdProjectIds = [];
const promptPosts = [];
/** Intercepted POST /queue bodies (never forwarded). */
const queuePosts = [];
/** What GET /queue answers with. */
const fakeQueue = { running: [], pending: [] };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const matchesAny = (list, url) => {
  try {
    const p = new URL(url).pathname;
    return list.some((re) => re.test(p));
  } catch {
    return false;
  }
};

function attachRequestGuard(page) {
  page.on("request", (req) => {
    const url = req.url();
    const method = req.method();
    if (method === "POST" && matchesAny(PROMPT_POST, url)) {
      const promptId = `zz-rs-${runStamp}-${promptPosts.length + 1}`;
      promptPosts.push({ url, promptId });
      console.log(`INTERCEPTED POST ${new URL(url).pathname} (not forwarded) -> ${promptId}`);
      req.respond({ status: 200, contentType: "application/json", body: JSON.stringify({ prompt_id: promptId, number: 0, node_errors: {} }) });
      return;
    }
    if (method === "POST" && matchesAny(QUEUE_GET, url)) {
      let body = null;
      try {
        body = JSON.parse(req.postData() || "null");
      } catch (_) {}
      queuePosts.push(body);
      const del = new Set(Array.isArray(body?.delete) ? body.delete : []);
      fakeQueue.pending = fakeQueue.pending.filter((id) => !del.has(id));
      console.log(`INTERCEPTED POST ${new URL(url).pathname} (not forwarded): ${JSON.stringify(body)}`);
      req.respond({ status: 200, contentType: "application/json", body: "{}" });
      return;
    }
    if (method === "GET" && matchesAny(QUEUE_GET, url)) {
      const item = (id, i) => [i, id, {}, {}, []];
      req.respond({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          queue_running: fakeQueue.running.map(item),
          queue_pending: fakeQueue.pending.map((id, i) => item(id, i + 1)),
        }),
      });
      return;
    }
    req.continue();
  });
}

async function postJson(page, route, body) {
  return page.evaluate(async (r, b) => {
    const res = await fetch(`${location.origin}${r}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(b),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.ok === false) throw new Error(data.message || `HTTP ${res.status}`);
    return data;
  }, route, body);
}

async function getJson(page, route) {
  return page.evaluate(async (r) => {
    const res = await fetch(`${location.origin}${r}`);
    return res.json().catch(() => null);
  }, route);
}

async function waitForComfy(page) {
  await page.goto(BASE, { waitUntil: "domcontentloaded", timeout: 120000 });
  await page.waitForFunction(() => window.app?.extensionManager?.workflow, { timeout: 120000 });
  await sleep(1500);
}

async function openShotsTab(page) {
  const opened = await page.evaluate(() => {
    const st = window.app?.extensionManager?.sidebarTab;
    if (!st) return false;
    st.activeSidebarTabId = "gg-shots";
    return true;
  });
  if (!opened) await (await page.waitForSelector('[aria-label="Vidot Cut Manager"]', { timeout: 15000 })).click();
  await page.waitForSelector(".gg-root.gg-shots", { timeout: 60000 });
}

async function selectProject(page, pid) {
  await page.evaluate(async () => {
    if (typeof globalThis.__gongganReloadShotsData === "function") await globalThis.__gongganReloadShotsData();
  });
  await page.waitForSelector(`.gg-root.gg-shots .gg-proj option[value="${pid}"]`, { timeout: 30000 });
  for (let i = 0; i < 12; i++) {
    await page.select(".gg-root.gg-shots .gg-proj", pid);
    await sleep(600);
    if ((await page.$eval(".gg-root.gg-shots .gg-proj", (el) => el.value)) === pid) break;
  }
}

async function ensureTimelineOpen(page) {
  const visible = () => page.evaluate(() => !!document.querySelector(".gg-timeline")?.offsetParent);
  if (!(await visible())) {
    await page.click(".gg-root.gg-shots .gg-timeline-toggle");
    await sleep(800);
  }
  if (!(await visible())) throw new Error("timeline panel did not open");
}

/** Dispatch a ComfyUI api event in the page (same api instance the extension listens on). */
async function fire(page, type, detail) {
  await page.evaluate(async (t, d) => {
    const { api } = await import("/scripts/api.js");
    if (typeof api.dispatchCustomEvent === "function") api.dispatchCustomEvent(t, d);
    else api.dispatchEvent(new CustomEvent(t, { detail: d }));
  }, type, detail);
}

const cardBadge = (id) => `.gg-root.gg-shots .gg-cut[data-cut-id="${id}"] .gg-render-badge`;
const clipBadge = (id) => `.gg-timeline .gg-track .gg-clip[data-cut-id="${id}"] .gg-render-badge`;
const GLOBAL = ".gg-root.gg-shots .gg-cutpanel .gg-sp-actions .gg-render-global";

async function queueForCut(page, cutId, projectId) {
  return page.evaluate(async (c, p) => {
    const { api } = await import("/scripts/api.js");
    const res = await api.queuePrompt(0, { output: {}, workflow: { nodes: [], links: [], extra: { gonggan: { cutId: c, projectId: p } } } });
    return res?.prompt_id || null;
  }, cutId, projectId);
}

async function openCardMenu(page, cutId) {
  const sel = `.gg-root.gg-shots .gg-cut[data-cut-id="${cutId}"] .gg-cut-title`;
  await page.$eval(sel, (el) => el.scrollIntoView({ block: "nearest" }));
  const box = await (await page.$(sel)).boundingBox();
  await page.mouse.click(box.x + Math.min(box.width / 2, 40), box.y + box.height / 2, { button: "right" });
  await page.waitForSelector(".gg-ctx", { timeout: 8000 });
  return page.$$eval(".gg-ctx > .gg-ctx-item", (els) => els.map((e) => e.textContent.trim()));
}

async function closeMenu(page) {
  if (!(await page.$(".gg-ctx"))) return;
  await page.evaluate(() => document.body.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true })));
  await page.waitForFunction(() => !document.querySelector(".gg-ctx"), { timeout: 5000 });
}

/** Wait until the badge's shown text is `want` ("" = hidden). */
async function waitBadge(page, sel, want, label) {
  try {
    await page.waitForFunction(
      (s, w) => {
        const el = document.querySelector(s);
        if (!el) return false;
        const shown = !el.hidden && el.offsetParent !== null;
        const text = el.querySelector(".gg-rs-text")?.textContent.trim() || "";
        return w ? shown && text === w : !shown;
      },
      { timeout: 8000 },
      sel,
      want
    );
  } catch (_) {
    const got = await page.evaluate((s) => {
      const el = document.querySelector(s);
      return el ? { hidden: el.hidden, text: el.textContent.trim() } : null;
    }, sel);
    throw new Error(`${label}: want ${want ? `"${want}"` : "hidden"}, got ${JSON.stringify(got)}`);
  }
}

async function cleanup(page) {
  for (const pid of createdProjectIds) {
    const dir = path.posix.dirname(shotWorkflowRelPathById({ projectId: pid, cutId: "x" }));
    try {
      await page.evaluate(async (d) => {
        await fetch(`${location.origin}/api/userdata/${encodeURIComponent("workflows/" + d)}`, { method: "DELETE" });
      }, dir);
    } catch (_) {}
    try {
      await postJson(page, "/gonggan/project/delete", { pid });
    } catch (e) {
      if (!/not found/i.test(e.message)) console.warn(`cleanup ${pid}:`, e.message);
    }
  }
}

async function main() {
  if (!fs.existsSync(CHROME)) {
    console.error(`Chrome not found at ${CHROME}`);
    process.exit(2);
  }
  fs.mkdirSync(USER_DATA_DIR, { recursive: true });
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: true,
    userDataDir: USER_DATA_DIR,
    protocolTimeout: 240000,
    args: ["--no-sandbox", "--disable-dev-shm-usage", `--window-size=${VIEWPORT.width},${VIEWPORT.height}`],
    defaultViewport: VIEWPORT,
  });
  const page = await browser.newPage();
  page.setDefaultTimeout(60000);
  await page.setRequestInterception(true);
  attachRequestGuard(page);
  page.on("dialog", (d) => d.dismiss().catch(() => {}));
  try {
    await waitForComfy(page);
    await page.evaluate(() => localStorage.setItem("gg.timelineOpen", "1"));
    await openShotsTab(page);

    const created = await postJson(page, "/gonggan/project/create", { name: `${TEST_PREFIX} ${runStamp}` });
    const pid = created.project.id;
    createdProjectIds.push(pid);
    await postJson(page, "/gonggan/cut/add", { pid });
    const tl = await getJson(page, `/gonggan/timeline?pid=${encodeURIComponent(pid)}`);
    const [cutA, cutB] = tl?.cuts || [];
    if (!cutA || !cutB) throw new Error("expected 2 cuts in the test project");
    await selectProject(page, pid);
    await page.waitForSelector(cardBadge(cutA.id), { timeout: 15000 });
    await ensureTimelineOpen(page);
    await page.waitForSelector(clipBadge(cutA.id), { timeout: 15000 });
    await waitBadge(page, GLOBAL, "", "global idle");

    // 1. queuePrompt with a workflow stamped for cut A -> Queued on card + clip
    const promptId = await page.evaluate(async (cutId, projectId) => {
      const { api } = await import("/scripts/api.js");
      const res = await api.queuePrompt(0, { output: {}, workflow: { nodes: [], links: [], extra: { gonggan: { cutId, projectId } } } });
      return res?.prompt_id || null;
    }, cutA.id, pid);
    if (!promptId || promptPosts.length !== 1) throw new Error(`queuePrompt not intercepted: ${promptId}, ${promptPosts.length} POSTs`);
    fakeQueue.pending = [promptId];
    await waitBadge(page, cardBadge(cutA.id), "Queued", "card queued");
    await waitBadge(page, clipBadge(cutA.id), "Queued", "clip queued");
    await waitBadge(page, cardBadge(cutB.id), "", "other cut idle");
    await waitBadge(page, GLOBAL, "", "global while mapped");
    console.log("PASS  queued prompt of cut A: card + clip show Queued, status panel indicator idle");

    // 2. execution_start + progress 4/10 -> Rendering 40%, same <li> (badge-only update)
    await page.evaluate((id) => {
      document.querySelector(`.gg-root.gg-shots .gg-cut[data-cut-id="${id}"]`).__ggRsMark = true;
    }, cutA.id);
    fakeQueue.pending = [];
    fakeQueue.running = [promptId];
    await fire(page, "execution_start", { prompt_id: promptId, timestamp: Date.now() });
    await waitBadge(page, cardBadge(cutA.id), "Rendering", "card rendering");
    await fire(page, "executing", { prompt_id: promptId, node: "9001", display_node: "9001" });
    await fire(page, "progress", { prompt_id: promptId, node: "9001", value: 4, max: 10 });
    await waitBadge(page, cardBadge(cutA.id), "Rendering 40%", "card 40%");
    await waitBadge(page, clipBadge(cutA.id), "Rendering 40%", "clip 40%");
    const sameRow = await page.evaluate(
      (id) => !!document.querySelector(`.gg-root.gg-shots .gg-cut[data-cut-id="${id}"]`)?.__ggRsMark,
      cutA.id
    );
    if (!sameRow) throw new Error("cut row was re-rendered on a progress tick");
    console.log("PASS  execution_start + progress 4/10: Rendering 40% on card + clip, row not re-rendered");

    // 3. execution_success -> cleared
    fakeQueue.running = [];
    await fire(page, "execution_success", { prompt_id: promptId, timestamp: Date.now() });
    await waitBadge(page, cardBadge(cutA.id), "", "card cleared");
    await waitBadge(page, clipBadge(cutA.id), "", "clip cleared");
    console.log("PASS  execution_success: badges cleared");

    // 4. prompt not tied to a cut: queued (via status -> /queue sync), then rendering -> status panel indicator
    const foreign = `zz-rs-unmapped-${runStamp}`;
    fakeQueue.pending = [foreign];
    await fire(page, "status", { exec_info: { queue_remaining: 1 } });
    await waitBadge(page, GLOBAL, "Queued", "global queued");
    fakeQueue.pending = [];
    fakeQueue.running = [foreign];
    await fire(page, "execution_start", { prompt_id: foreign, timestamp: Date.now() });
    await waitBadge(page, GLOBAL, "Rendering\u2026", "global rendering");
    for (const c of [cutA, cutB]) await waitBadge(page, cardBadge(c.id), "", `card ${c.id} stays idle`);
    fakeQueue.running = [];
    await fire(page, "execution_success", { prompt_id: foreign, timestamp: Date.now() });
    await fire(page, "status", { exec_info: { queue_remaining: 0 } });
    await waitBadge(page, GLOBAL, "", "global cleared");
    console.log("PASS  unmapped prompt: status panel shows Queued, then Rendering…, then clears; cut badges idle");

    // 5. Remove from queue on a queued cut -> POST /queue {delete:[id]} (intercepted), badge cleared
    const queuedId = await queueForCut(page, cutA.id, pid);
    fakeQueue.pending = [queuedId];
    await waitBadge(page, cardBadge(cutA.id), "Queued", "card queued again");
    let labels = await openCardMenu(page, cutA.id);
    if (!labels.includes("Remove from queue") || labels.includes("Re-queue")) throw new Error(`queued cut menu: ${labels.join(", ")}`);
    await page.$$eval(".gg-ctx > .gg-ctx-item", (els) => els.find((e) => e.textContent.trim() === "Remove from queue").click());
    const until = Date.now() + 10000;
    while (!queuePosts.length && Date.now() < until) await sleep(100);
    if (queuePosts.length !== 1 || JSON.stringify(queuePosts[0]) !== JSON.stringify({ delete: [queuedId] })) {
      throw new Error(`POST /queue body: ${JSON.stringify(queuePosts)}`);
    }
    await waitBadge(page, cardBadge(cutA.id), "", "card cleared after Remove from queue");
    await waitBadge(page, clipBadge(cutA.id), "", "clip cleared after Remove from queue");
    console.log("PASS  Remove from queue: POST /queue {delete:[id]} intercepted, card + clip cleared");

    // 6. execution_error / execution_interrupted -> Failed on card + clip; menu lists Re-queue, not Remove from queue
    for (const [ev, cut] of [["execution_error", cutB], ["execution_interrupted", cutA]]) {
      const id = await queueForCut(page, cut.id, pid);
      fakeQueue.running = [id];
      await fire(page, "execution_start", { prompt_id: id, timestamp: Date.now() });
      await waitBadge(page, cardBadge(cut.id), "Rendering", `${ev}: rendering`);
      fakeQueue.running = [];
      await fire(page, ev, { prompt_id: id, exception_message: "zz test", timestamp: Date.now() });
      await waitBadge(page, cardBadge(cut.id), "Failed", `${ev}: card failed`);
      await waitBadge(page, clipBadge(cut.id), "Failed", `${ev}: clip failed`);
    }
    await fire(page, "status", { exec_info: { queue_remaining: 0 } });
    await sleep(2500);
    await waitBadge(page, cardBadge(cutB.id), "Failed", "failed stays after the queue empties");
    labels = await openCardMenu(page, cutB.id);
    if (!labels.includes("Re-queue") || labels.includes("Remove from queue")) throw new Error(`failed cut menu: ${labels.join(", ")}`);
    await closeMenu(page);
    await waitBadge(page, GLOBAL, "", "global idle with failed cuts");
    console.log("PASS  execution_error / execution_interrupted: Failed on card + clip (kept after queue empties), menu has Re-queue");

    if (promptPosts.length !== 4) throw new Error(`expected 4 intercepted prompt POSTs, got ${promptPosts.length}`);
    if (queuePosts.length !== 1) throw new Error(`expected 1 intercepted POST /queue, got ${queuePosts.length}`);
  } finally {
    try {
      await cleanup(page);
    } catch (_) {}
    await browser.close().catch(() => {});
    try {
      fs.rmSync(USER_DATA_DIR, { recursive: true, force: true });
    } catch (_) {}
  }
  console.log(`DONE  ${promptPosts.length} prompt POSTs + ${queuePosts.length} queue POST intercepted, none forwarded`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
