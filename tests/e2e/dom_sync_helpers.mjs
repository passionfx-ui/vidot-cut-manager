/** Wait until Shots DOM cut count matches GET /gonggan/timeline for the active project. */

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function getServerCutCount(page) {
  return page.evaluate(async () => {
    const sel = document.querySelector(".gg-root.gg-shots .gg-proj");
    const pid = sel?.value;
    if (!pid) return -1;
    const res = await fetch(`/gonggan/timeline?pid=${encodeURIComponent(pid)}`);
    const data = await res.json().catch(() => ({}));
    const cuts = Array.isArray(data.cuts) ? data.cuts : [];
    return cuts.filter((c) => !c?.trashed).length;
  });
}

export async function countDomCuts(page) {
  return page.$$eval(".gg-root.gg-shots .gg-cut", (els) => els.length);
}

/**
 * @param {import('puppeteer-core').Page} page
 * @param {number} [timeoutMs]
 * @returns {Promise<number>} synced cut count
 */
export async function waitForDomCutCountSync(page, timeoutMs = 10000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const dom = await countDomCuts(page);
    const server = await getServerCutCount(page);
    if (server >= 0 && dom === server) return dom;
    await sleep(150);
  }
  const dom = await countDomCuts(page);
  const server = await getServerCutCount(page);
  throw new Error(`DOM cut count ${dom} != server ${server} (sync timeout ${timeoutMs}ms)`);
}
