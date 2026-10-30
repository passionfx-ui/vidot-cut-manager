/** Puppeteer helpers for the New Project window (Project name, Location, Default template). */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export const NEW_PROJECT_MODAL = '.gg-modal[aria-label="New project"]';

/** Location for projects made through the window: Create makes <location>/<name>/assets, so keep it under temp. */
export const E2E_PROJECT_LOCATION = path.join(os.tmpdir(), `gg-e2e-projects-${process.pid}`);

/** Project delete keeps the folders, so the test process removes its own location when it exits. */
process.on("exit", () => {
  try {
    fs.rmSync(E2E_PROJECT_LOCATION, { recursive: true, force: true });
  } catch (_) {}
});

/**
 * Pick `ref` in the Default template combobox ("" = (none)). Each option's title is its label: the full
 * workflow path, or "(none)". The list is rebuilt when the workflow list fetch lands, so the option is
 * clicked by position and the pick is checked (reopening the list if it closed) up to `tries` times.
 */
export async function pickTemplate(page, ref, { tries = 3 } = {}) {
  const label = ref || "(none)";
  for (let i = 1; ; i++) {
    const open = await page.$eval(".gg-tpl-list", (el) => !el.hidden);
    if (!open) {
      await page.click(".gg-tpl-combo");
      if (ref) await page.type(".gg-tpl-combo", ref);
    }
    const at = await page.waitForFunction(
      (l) => {
        const li = [...document.querySelectorAll(".gg-tpl-list .gg-combo-opt")].find((o) => o.title === l);
        if (!li) return null;
        li.scrollIntoView({ block: "nearest" });
        const r = li.getBoundingClientRect();
        return r.width > 0 && r.height > 0 ? { x: r.x + r.width / 2, y: r.y + r.height / 2 } : null;
      },
      { timeout: 20000 },
      label,
    );
    const { x, y } = await at.jsonValue();
    await page.mouse.click(x, y);
    const picked = await page
      .waitForFunction(
        (r) => document.querySelector(".gg-tpl-combo")?.value === r && document.querySelector(".gg-tpl-list")?.hidden,
        { timeout: 3000 },
        ref,
      )
      .then(() => true, () => false);
    if (picked) return;
    if (i >= tries) throw new Error(`Default template "${label}" was not picked`);
  }
}

/**
 * Fill the open New Project window; the caller presses Create (`.gg-modal-create`).
 * `templateRef` undefined keeps the preselected template; "" picks (none).
 * @param {import("puppeteer-core").Page} page
 * @param {{ name: string, location?: string, templateRef?: string }} opts
 */
export async function fillNewProjectModal(page, { name, location = E2E_PROJECT_LOCATION, templateRef }) {
  await page.waitForSelector(NEW_PROJECT_MODAL, { timeout: 10000 });
  await page.click(".gg-modal-name", { clickCount: 3 });
  await page.type(".gg-modal-name", name, { delay: 8 });
  await page.$eval(".gg-modal-folder", (el, v) => {
    el.value = v;
    el.dispatchEvent(new Event("input", { bubbles: true }));
  }, location);
  if (typeof templateRef === "string") await pickTemplate(page, templateRef);
}
