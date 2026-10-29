/**
 * References modal: add, filter, rename, generate (opens its workflow tab), add last output, delete.
 * ZZ-test- projects only. Blocks POST /prompt and /gonggan/regen.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const BASE = process.env.BASE_URL || "http://127.0.0.1:8188";
const MIN_RAM = 40 * 1024 ** 3;
const VIEWPORT = { width: 1600, height: 900 };
const TEST_PREFIX = "ZZ-test-refs";
const BLOCKED_POST = [
  /\/prompt(\?|$)/,
  /\/api\/prompt(\?|$)/,
  /\/gonggan\/regen(\?|$)/,
  /\/api\/gonggan\/regen(\?|$)/,
];

const runStamp = Date.now();
const PERSISTENT_USER_DATA_DIR = path.join(os.tmpdir(), `gg-refs-${runStamp}`);
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


async function toastText(page) {
  return page.evaluate(() => document.getElementById("gg-toast-host")?.textContent || "");
}
const cardNames = (page) => page.$$eval(".gg-refs .gg-ref .gg-ref-name", (els) => els.map((e) => e.textContent.trim()));
const chipText = (page, cat) =>
  page.$eval(`.gg-ref-chip[data-cat="${cat}"]`, (e) => e.textContent.trim()).catch(() => "");

async function openRefs(page) {
  await page.evaluate(() => {
    document.querySelector(".gg-root.gg-shots .gg-head")?.dispatchEvent(
      new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 80, clientY: 40 })
    );
  });
  await clickCtxItem(page, "References…");
  await page.waitForSelector(".gg-refs", { timeout: 10000 });
}

async function addRef(page, name, category) {
  await page.click(".gg-refs-name", { clickCount: 3 });
  await page.type(".gg-refs-name", name, { delay: 5 });
  if (category) await page.select(".gg-refs-cat", category);
  await page.click(".gg-refs-form button[type=submit]");
}

async function run() {
  checkRam("start");
  const browser = await launchPersistentBrowser();
  const page = await newGuardedPage(browser);
  const mock = { on: false, refs: [], n: 0, sent: 0 };
  let sendCalls = 0;
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
    if (method === "POST" && p.endsWith("/gonggan/send-output")) sendCalls += 1;
    if (mock.on) {
      const body = method === "POST" ? JSON.parse(req.postData() || "{}") : {};
      if (method === "GET" && p.endsWith("/gonggan/timeline")) {
        const r = await fetch(url);
        const j = await r.json();
        j.references = mock.refs;
        return json(j);
      }
      if (method === "POST" && p.endsWith("/gonggan/reference/add")) {
        const dup = mock.refs.some((r) => r.category === body.category && r.name.toLowerCase() === String(body.name).toLowerCase());
        if (dup) return json({ ok: false, message: "this reference already exists" }, 400);
        const id = `mock-ref-${++mock.n}`;
        mock.refs.push({ id, name: body.name, category: body.category, kind: "reference", media: null, versions: 0, versions_list: [], pick: null, caption: "", notes: "", prompt: "" });
        return json({ ok: true, reference: { id } });
      }
      if (method === "POST" && p.endsWith("/gonggan/cut/rename") && mock.refs.some((r) => r.id === body.cut_id)) {
        mock.refs.find((r) => r.id === body.cut_id).name = body.name;
        return json({ ok: true });
      }
      if (method === "POST" && p.endsWith("/gonggan/cut/delete") && (body.cuts || []).every((c) => mock.refs.some((r) => r.id === c))) {
        mock.refs = mock.refs.filter((r) => !body.cuts.includes(r.id));
        return json({ ok: true });
      }
      if (method === "POST" && p.endsWith("/gonggan/send-output") && mock.refs.some((r) => r.id === body.cut_id)) {
        const r = mock.refs.find((x) => x.id === body.cut_id);
        r.media = { id: "mock-version-1", kind: "image" };
        r.pick = "mock-version-1";
        return json({ ok: true, output: { name: "x.png" } });
      }
    }
    req.continue();
  });
  page.on("dialog", (d) => d.accept().catch(() => {}));
  try {
    await waitForComfy(page);
    await openShotsTab(page);

    const probe = await page.evaluate(async () => {
      const r = await fetch(`${location.origin}/gonggan/reference/add`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pid: "x" }),
      });
      return r.status;
    });
    mock.on = probe !== 400;
    console.log(mock.on ? "NOTE  server has no /gonggan/reference/add yet (restart needed): mocking the reference routes" : "NOTE  using the real reference routes");

    // project
    await openNewProjectModal(page);
    const name = `${TEST_PREFIX}-${runStamp}`;
    await page.click(".gg-modal-name", { clickCount: 3 });
    await page.type(".gg-modal-name", name, { delay: 6 });
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
    await sleep(800);

    // Rename must send the name as a string (regression: the name was sent as an object)
    await page.evaluate(() => {
      document.querySelector(".gg-root.gg-shots .gg-head")?.dispatchEvent(
        new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 80, clientY: 40 })
      );
    });
    await clickCtxItem(page, "Rename Project…");
    await page.waitForSelector(".gg-ask-dialog .gg-ask-input", { timeout: 10000 });
    await page.click(".gg-ask-dialog .gg-ask-input");
    await page.keyboard.press("End");
    await page.type(".gg-ask-dialog .gg-ask-input", "x", { delay: 5 });
    await page.click(".gg-ask-dialog .gg-ask-ok");
    await page.waitForFunction(
      (n) => {
        const sel = document.querySelector(".gg-root.gg-shots .gg-proj");
        return sel?.options[sel.selectedIndex]?.textContent.includes(n);
      },
      { timeout: 15000 },
      `${name}x`
    ).catch(() => {});
    const renamed = await page.$eval(".gg-root.gg-shots .gg-proj", (sel) => sel.options[sel.selectedIndex].textContent);
    if (!renamed.includes(`${name}x`)) throw new Error(`Rename Project… did not rename: ${renamed}`);
    console.log("PASS  Rename Project… renames the project");

    // empty state
    await openRefs(page);
    const empty = await page.$eval(".gg-refs-list", (e) => e.textContent.trim());
    if (!empty.startsWith("No references yet")) throw new Error(`empty state wrong: ${empty}`);
    if ((await chipText(page, "All")) !== "All 0") throw new Error("All chip should read 'All 0'");
    if (await page.$(".gg-refs [class*=api-key], .gg-refs input[type=date]")) throw new Error("forbidden fields present");
    console.log("PASS  References modal opens from the project menu with an empty state");

    // add + chips + filter
    await addRef(page, "Mina", "Character");
    await page.waitForFunction(() => document.querySelectorAll(".gg-refs .gg-ref").length === 1, { timeout: 10000 });
    await addRef(page, "Old station", "Place");
    await page.waitForFunction(() => document.querySelectorAll(".gg-refs .gg-ref").length === 2, { timeout: 10000 });
    if ((await chipText(page, "All")) !== "All 2" || (await chipText(page, "Place")) !== "Place 1") throw new Error("chip counts wrong");
    await page.click('.gg-ref-chip[data-cat="Place"]');
    let names = await cardNames(page);
    if (names.join("|") !== "Old station") throw new Error(`filter wrong: ${names}`);
    const defCat = await page.$eval(".gg-refs-cat", (e) => e.value);
    if (defCat !== "Place") throw new Error(`new-reference category should follow the chip: ${defCat}`);
    await page.click('.gg-ref-chip[data-cat="All"]');
    console.log("PASS  add two references, chip counts, category filter");

    // duplicate
    await addRef(page, "mina", "Character");
    await sleep(700);
    if (!(await toastText(page)).includes("already exists")) throw new Error("duplicate not reported");
    if ((await cardNames(page)).length !== 2) throw new Error("duplicate was added");
    console.log("PASS  duplicate name in the same category is refused");

    // rename
    await page.click('.gg-ref[data-ref-id] .gg-ref-rename');
    await page.waitForSelector(".gg-ask-input", { timeout: 5000 });
    await page.click(".gg-ask-input", { clickCount: 3 });
    await page.type(".gg-ask-input", "Mina Park", { delay: 5 });
    await page.keyboard.press("Enter");
    await page.waitForFunction(() => [...document.querySelectorAll(".gg-refs .gg-ref-name")].some((e) => e.textContent.trim() === "Mina Park"), { timeout: 10000 });
    console.log("PASS  rename");

    // timeline unaffected
    const tl = await getJson(page, `/gonggan/timeline?pid=${encodeURIComponent(pid)}`);
    if ((tl.data?.cuts || []).length !== 1) throw new Error(`references leaked into the timeline: ${tl.data?.cuts?.length}`);
    console.log("PASS  references do not appear as timeline cuts");

    // add last output (before generate, so the modal is open)
    const before = sendCalls;
    const refId = await page.$eval('.gg-ref', (e) => e.dataset.refId);
    await page.click('.gg-ref[data-ref-id] .gg-ref-add');
    await sleep(1500);
    if (sendCalls !== before + 1) throw new Error("Add last output did not call send-output");
    const t1 = await toastText(page);
    if (mock.on && !(await page.$(".gg-refs .gg-ref-thumb img"))) throw new Error("thumbnail missing after add (mock)");
    console.log(`PASS  Add last output calls send-output (${t1.slice(0, 60)})`);

    // generate: closes the modal and opens this reference's workflow in the owned tab
    await page.click('.gg-ref[data-ref-id] .gg-ref-gen');
    await page.waitForFunction(() => !document.querySelector(".gg-refs"), { timeout: 5000 });
    await page.waitForFunction(
      (id) => window.app?.graph?.extra?.gonggan?.cutId === id,
      { timeout: 30000 },
      refId
    );
    console.log("PASS  Generate opens the reference workflow in a ComfyUI tab");

    // delete
    await openRefs(page);
    const refsBefore = await page.evaluate(() => document.querySelectorAll(".gg-refs .gg-ref").length);
    await page.click('.gg-ref[data-ref-id] .gg-ref-del');
    await page.waitForSelector(".gg-confirm-dialog", { timeout: 8000 }); // in-app confirm, not a native dialog
    await page.click(".gg-confirm-cancel");
    await sleep(600);
    if ((await page.evaluate(() => document.querySelectorAll(".gg-refs .gg-ref").length)) !== refsBefore) throw new Error("Cancel must not delete the reference");
    await page.click('.gg-ref[data-ref-id] .gg-ref-del');
    await page.waitForSelector(".gg-confirm-dialog", { timeout: 8000 });
    await page.click(".gg-confirm-ok");
    await page.waitForFunction(() => document.querySelectorAll(".gg-refs .gg-ref").length === 1, { timeout: 10000 });
    console.log("PASS  delete");

    if (blockedPromptAttempts > 0) throw new Error(`unexpected blocked posts: ${blockedPromptAttempts}`);
    console.log("PASS  references e2e complete");
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
    console.log(`SKIP  references e2e: ${err.message}`);
    process.exit(0);
  }
  console.error(err);
  process.exit(1);
});