/**
 * Headless Chrome: missing Load Image guard (not run in CI by default).
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "../..");
const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const BASE = process.env.BASE_URL || "http://127.0.0.1:8199";
const VIEWPORT = { width: 1600, height: 900 };

let blockedPromptAttempts = 0;
const BLOCKED_POST = [/\/prompt(\?|$)/, /\/api\/prompt(\?|$)/];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function attachRequestGuard(page) {
  page.on("request", (req) => {
    const method = req.method();
    const url = req.url();
    if (method === "POST") {
      try {
        const p = new URL(url).pathname;
        if (BLOCKED_POST.some((re) => re.test(p))) {
          blockedPromptAttempts += 1;
          req.abort("blockedbyclient");
          return;
        }
      } catch (_) {}
    }
    req.continue();
  });
}

async function launchBrowser() {
  const userDataDir = path.join(os.tmpdir(), `gg-loadimage-${Date.now()}`);
  fs.mkdirSync(userDataDir, { recursive: true });
  return puppeteer.launch({
    executablePath: CHROME,
    headless: true,
    userDataDir,
    args: ["--no-sandbox", "--disable-dev-shm-usage", `--window-size=${VIEWPORT.width},${VIEWPORT.height}`],
    defaultViewport: VIEWPORT,
  });
}

const FAKE_WORKFLOW = {
  last_node_id: 1,
  last_link_id: 0,
  nodes: [
    {
      id: 1,
      type: "LoadImage",
      pos: [100, 100],
      size: [320, 90],
      flags: {},
      order: 0,
      mode: 0,
      title: "ZZ Missing Load",
      properties: {},
      widgets_values: ["definitely-not-on-disk-zz.png"],
    },
  ],
  links: [],
  groups: [],
  config: {},
  extra: {},
  version: 0.4,
};

async function main() {
  const browser = await launchBrowser();
  const page = await browser.newPage();
  await page.setRequestInterception(true);
  attachRequestGuard(page);

  await page.goto(BASE, { waitUntil: "domcontentloaded", timeout: 120000 });
  await page.waitForFunction(() => window.app?.loadGraphData, { timeout: 120000 });

  await page.evaluate(async (wf) => {
    await window.app.loadGraphData(wf, true, true, "ZZ-loadimage-missing.json", { deferWarnings: true });
  }, FAKE_WORKFLOW);

  await sleep(2000);

  const hasMarker = await page.evaluate(() => {
    const nodes = window.app.graph?._nodes || [];
    const n = nodes.find((x) => x.type === "LoadImage");
    return !!n && String(n.title).includes("ZZ Missing");
  });
  if (!hasMarker) throw new Error("LoadImage node not found after workflow load");

  blockedPromptAttempts = 0;
  const queued = await page.evaluate(async () => {
    if (typeof window.app.queuePrompt !== "function") return { ok: false, reason: "no queuePrompt" };
    const res = await window.app.queuePrompt(0, 1);
    return { ok: true, res };
  });

  await sleep(500);

  if (blockedPromptAttempts !== 0) {
    throw new Error(`Expected 0 blocked POST /prompt attempts, got ${blockedPromptAttempts}`);
  }
  if (queued.ok && queued.res !== false) {
    throw new Error("queuePrompt should return false when image is missing");
  }

  await browser.close();
  console.log("loadimage_test: OK");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
