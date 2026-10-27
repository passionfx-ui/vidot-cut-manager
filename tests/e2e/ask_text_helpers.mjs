/** Puppeteer helpers for the in-app askText dialog (not native prompt). */

export async function waitForAskDialog(page) {
  await page.waitForSelector(".gg-ask-input", { visible: true, timeout: 10000 });
}

export async function dismissAskDialog(page) {
  await waitForAskDialog(page);
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => !document.querySelector(".gg-ask-input"), { timeout: 5000 });
}

/**
 * @param {import("puppeteer").Page} page
 * @param {{ text?: string, useEnter?: boolean }} [opts]
 */
export async function submitAskDialog(page, opts = {}) {
  await waitForAskDialog(page);
  if (opts.text !== undefined) {
    await page.click(".gg-ask-input", { clickCount: 3 });
    await page.type(".gg-ask-input", opts.text, { delay: 5 });
  }
  if (opts.useEnter) {
    await page.keyboard.press("Enter");
  } else {
    await page.click(".gg-ask-ok");
  }
  await page.waitForFunction(() => !document.querySelector(".gg-ask-input"), { timeout: 10000 });
}
