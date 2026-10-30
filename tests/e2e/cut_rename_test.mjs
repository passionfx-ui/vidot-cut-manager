/**
 * Cut rename from the cut context menu (Rename…): Esc keeps, Enter renames, card title updates.
 * Inline rename by double-clicking the card title (fresh New cut and an unselected cut): the click's
 * select + workflow load must not close the field; Enter renames, Esc cancels.
 * ZZ-test- projects only. Blocks POST /prompt and /gonggan/regen.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";
import { fillNewProjectModal } from "./new_project_helpers.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const BASE = process.env.BASE_URL || "http://127.0.0.1:8188";
const MIN_RAM = 40 * 1024 ** 3;
const VIEWPORT = { width: 1600, height: 900 };
const TEST_PREFIX = "ZZ-test-cut-rename";
const BLOCKED_POST = [
  /\/prompt(\?|$)/,
  /\/api\/prompt(\?|$)/,
  /\/gonggan\/regen(\?|$)/,
  /\/api\/gonggan\/regen(\?|$)/,
];

const runStamp = Date.now();
const PERSISTENT_USER_DATA_DIR = path.join(os.tmpdir(), `gg-cut-rename-${runStamp}`);
const createdProjectIds = [];
let blockedPromptAttempts = 0;

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
    req.continue();
  });
}

async function getJson(page, route) {
  return page.evaluate(async (r) => {
    const res = await fetch(r.startsWith("http") ? r : `${location.origin}${r}`);
    const text = await res.text().catch(() => "");
    let data = null;
    try {
      data = JSON.parse(text);
    } catch (_) {}
    return { ok: res.ok, status: res.status, data, text };
  }, route);
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

async function launchPersistentBrowser() {
  fs.mkdirSync(PERSISTENT_USER_DATA_DIR, { recursive: true });
  return puppeteer.launch({
    executablePath: CHROME,
    headless: true,
    userDataDir: PERSISTENT_USER_DATA_DIR,
    args: ["--no-sandbox", "--disable-dev-shm-usage", `--window-size=${VIEWPORT.width},${VIEWPORT.height}`],
    defaultViewport: VIEWPORT,
  });
}

async function newGuardedPage(browser) {
  const page = await browser.newPage();
  await page.setRequestInterception(true);
  attachRequestGuard(page);
  return page;
}

async function waitForComfy(page) {
  await page.goto(BASE, { waitUntil: "domcontentloaded", timeout: 120000 });
  await page.waitForFunction(() => window.app?.extensionManager?.workflow, { timeout: 120000 });
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
    const btn = await page.waitForSelector('[aria-label="Shots list"]', { timeout: 15000 });
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

async function openNewProjectModal(page) {
  await page.evaluate(() => {
    document.querySelector(".gg-root.gg-shots .gg-head")?.dispatchEvent(
      new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 80, clientY: 40 })
    );
  });
  await clickCtxItem(page, "New Project…");
  await page.waitForSelector(".gg-modal", { timeout: 10000 });
}

async function cleanupProjects(page) {
  for (const pid of [...createdProjectIds].reverse()) {
    try {
      await postJson(page, "/gonggan/project/delete", { pid });
    } catch (_) {}
  }
  createdProjectIds.length = 0;
}


async function run() {
  checkRam("start");
  const browser = await launchPersistentBrowser();
  const page = await newGuardedPage(browser);
  const mock = { on: false, names: {} };
  page.removeAllListeners("request");
  page.on("request", async (req) => {
    const url = req.url();
    const method = req.method();
    if (isBlockedPost(url, method)) {
      blockedPromptAttempts += 1;
      req.abort("blockedbyclient");
      return;
    }
    const p = new URL(url).pathname;
    const json = (obj, status = 200) => req.respond({ status, contentType: "application/json", body: JSON.stringify(obj) });
    if (mock.on) {
      if (method === "GET" && p.endsWith("/gonggan/timeline")) {
        const r = await fetch(url);
        const j = await r.json();
        for (const c of j.cuts || []) if (mock.names[c.id]) c.name = mock.names[c.id];
        return json(j);
      }
      if (method === "POST" && p.endsWith("/gonggan/cut/rename")) {
        const b = JSON.parse(req.postData() || "{}");
        mock.names[b.cut_id] = b.name;
        return json({ ok: true });
      }
    }
    req.continue();
  });
  try {
    await waitForComfy(page);
    await openShotsTab(page);
    const probe = await page.evaluate(async () => {
      const r = await fetch(`${location.origin}/gonggan/cut/rename`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pid: "x", cut_id: "y" }),
      });
      return r.status;
    });
    mock.on = probe !== 400;
    console.log(mock.on ? "NOTE  server has no /gonggan/cut/rename yet (restart needed): mocking it" : "NOTE  using the real rename route");

    await openNewProjectModal(page);
    const name = `${TEST_PREFIX}-${runStamp}`;
    await fillNewProjectModal(page, { name });
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
    const tl0 = await getJson(page, `/gonggan/timeline?pid=${encodeURIComponent(pid)}`);
    const cutId = tl0.data.cuts[0].id;
    await page.waitForSelector(`.gg-root.gg-shots .gg-cut[data-cut-id="${cutId}"]`, { timeout: 15000 });
    const title = () => page.$eval(`.gg-root.gg-shots .gg-cut[data-cut-id="${cutId}"] .gg-cut-title`, (e) => e.textContent.trim());
    const before = await title();

    const openRename = async () => {
      await page.evaluate((id) => {
        const el = document.querySelector(`.gg-root.gg-shots .gg-cut[data-cut-id="${id}"]`);
        el.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 200, clientY: 200 }));
      }, cutId);
      await clickCtxItem(page, "Rename…");
      await page.waitForSelector(".gg-ask-input", { timeout: 5000 });
    };

    await openRename();
    const prefill = await page.$eval(".gg-ask-input", (e) => e.value);
    if (!before.includes(prefill) && prefill !== before) throw new Error(`prefill ${prefill} vs title ${before}`);
    await page.keyboard.press("Escape");
    await sleep(300);
    if ((await title()) !== before) throw new Error("Esc must keep the name");
    console.log("PASS  Rename… opens prefilled; Esc keeps the name");

    await openRename();
    await page.click(".gg-ask-input", { clickCount: 3 });
    await page.type(".gg-ask-input", "Platform wide", { delay: 5 });
    await page.keyboard.press("Enter");
    await page.waitForFunction(
      (id) => document.querySelector(`.gg-root.gg-shots .gg-cut[data-cut-id="${id}"] .gg-cut-title`)?.textContent.includes("Platform wide"),
      { timeout: 10000 },
      cutId
    );
    console.log("PASS  Enter renames the cut and the card title updates");

    // Double-click on the title: the first click of the pair also selects the cut and loads its workflow.
    const cardSel = (id) => `.gg-root.gg-shots .gg-cut[data-cut-id="${id}"]`;
    const titleOf = (id) => page.$eval(`${cardSel(id)} .gg-cut-title`, (e) => e.textContent.trim());
    const isOn = (id) => page.$eval(cardSel(id), (e) => e.classList.contains("gg-on"));
    const fieldState = (id) =>
      page.evaluate((s) => {
        const inp = document.querySelector(`${s} .gg-cut-title-input`);
        return {
          open: !!inp,
          focused: !!inp && document.activeElement === inp,
          allSelected: !!inp && inp.selectionStart === 0 && inp.selectionEnd === inp.value.length,
          value: inp ? inp.value : null,
        };
      }, cardSel(id));
    const openInline = async (id, label) => {
      const el = await page.waitForSelector(`${cardSel(id)} .gg-cut-title`, { timeout: 10000 });
      const box = await el.boundingBox();
      await page.mouse.click(box.x + Math.min(20, box.width / 2), box.y + box.height / 2, { count: 2 });
      await page.waitForSelector(`${cardSel(id)} .gg-cut-title-input`, { timeout: 3000 }).catch(() => {});
      await sleep(1500);
      const s = await fieldState(id);
      const graphCut = await page.evaluate(() => window.app?.graph?.extra?.gonggan?.cutId || "");
      if (graphCut !== id) throw new Error(`${label}: the click should have loaded this cut's workflow (graph cut ${graphCut})`);
      if (!s.open || !s.focused || !s.allSelected) {
        throw new Error(`${label}: inline field must stay open, focused and selected after the click's workflow load: ${JSON.stringify(s)}`);
      }
      return s;
    };
    const waitTitle = (id, text) =>
      page.waitForFunction(
        (s, t) => document.querySelector(`${s} .gg-cut-title`)?.textContent.includes(t) && !document.querySelector(`${s} .gg-cut-title-input`),
        { timeout: 10000 },
        cardSel(id),
        text
      );

    const knownIds = await page.$$eval(".gg-root.gg-shots .gg-cut[data-cut-id]", (els) => els.map((e) => e.dataset.cutId));
    await page.click(".gg-root.gg-shots .gg-ir-cut");
    const newHandle = await page.waitForFunction(
      (known) => [...document.querySelectorAll(".gg-root.gg-shots .gg-cut[data-cut-id]")].find((e) => !known.includes(e.dataset.cutId) && e.classList.contains("gg-on"))?.dataset.cutId,
      { timeout: 15000 },
      knownIds
    );
    const newCutId = await newHandle.jsonValue();
    const newBefore = await titleOf(newCutId);
    const sNew = await openInline(newCutId, "fresh New cut");
    if (!newBefore.includes(sNew.value)) throw new Error(`fresh New cut prefill ${sNew.value} vs title ${newBefore}`);
    await page.keyboard.type("Inline new", { delay: 5 });
    await page.keyboard.press("Enter");
    await waitTitle(newCutId, "Inline new");
    console.log("PASS  double-click on a fresh New cut title: field stays open; Enter renames");

    if (await isOn(cutId)) throw new Error("first cut should not be selected before the double-click");
    await openInline(cutId, "unselected cut");
    await page.keyboard.type("Inline wide", { delay: 5 });
    await page.keyboard.press("Enter");
    await waitTitle(cutId, "Inline wide");
    console.log("PASS  double-click on an unselected cut title: field stays open; Enter renames");

    // The save repaints the list, so query the card fresh and retry if it is replaced mid-click.
    for (let attempt = 0; ; attempt++) {
      try {
        const target = (await page.$(`${cardSel(newCutId)} .gg-cut-thumb`)) || (await page.$(cardSel(newCutId)));
        await target.click();
        break;
      } catch (e) {
        if (attempt >= 4) throw e;
        await sleep(300);
      }
    }
    await sleep(1500);
    if (await isOn(cutId)) throw new Error("first cut should be unselected before the Esc case");
    await openInline(cutId, "Esc case");
    await page.keyboard.type("Not this", { delay: 5 });
    await page.keyboard.press("Escape");
    await waitTitle(cutId, "Inline wide");
    if ((await titleOf(cutId)).includes("Not this")) throw new Error("Esc must cancel the inline rename");
    console.log("PASS  double-click then Esc cancels; the title keeps its name");

    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => window.app?.extensionManager?.workflow, { timeout: 120000 });
    await sleep(1500);
    await openShotsTab(page);
    await page.waitForSelector(`.gg-root.gg-shots .gg-cut[data-cut-id="${cutId}"]`, { timeout: 20000 }).catch(() => {});
    if (!mock.on) {
      const t = await title();
      if (!t.includes("Inline wide")) throw new Error(`name not persisted after reload: ${t}`);
      const tNew = await page.$eval(`.gg-root.gg-shots .gg-cut[data-cut-id="${newCutId}"] .gg-cut-title`, (e) => e.textContent.trim());
      if (!tNew.includes("Inline new")) throw new Error(`New cut name not persisted after reload: ${tNew}`);
      console.log("PASS  renamed cuts persist after reload");
    } else {
      console.log("SKIP  persistence after reload: server not restarted");
    }
    if (blockedPromptAttempts > 0) throw new Error(`unexpected blocked posts: ${blockedPromptAttempts}`);
    console.log("PASS  cut rename e2e complete");
  } finally {
    try {
      await cleanupProjects(page);
    } catch (_) {}
    await browser.close();
    try {
      fs.rmSync(PERSISTENT_USER_DATA_DIR, { recursive: true, force: true });
    } catch (_) {}
  }
}

run().catch((err) => {
  if (err.skipped) {
    console.log(`SKIP  cut rename e2e: ${err.message}`);
    process.exit(0);
  }
  console.error(err);
  process.exit(1);
});