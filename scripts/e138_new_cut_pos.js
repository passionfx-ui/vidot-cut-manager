const { chromium } = require("playwright");
const base = process.argv[2] || "http://127.0.0.1:8188";
const PROJ = `e2e_newcutpos_${Date.now()}`;

async function api(page, path, body) {
  return page.evaluate(async ({ path, body }) => {
    const r = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const t = await r.text();
    let j = null;
    try { j = JSON.parse(t); } catch (_) {}
    return { ok: r.ok, status: r.status, j, t: t.slice(0, 300) };
  }, { path, body });
}

(async () => {
  console.log("e138_new_cut_pos", base, PROJ);
  const browser = await chromium.launch();
  const page = await (await browser.newContext({ viewport: { width: 1600, height: 720 } })).newPage();
  await page.goto(base);
  await page.waitForTimeout(8000);
  await page.click('[aria-label*="Vidot"]');
  await page.waitForTimeout(3000);

  const created = await api(page, "/gonggan/project/create", { name: PROJ });
  if (!created.ok) { console.error("FAIL create", created); process.exit(1); }
  const pid = created.j?.project?.id;
  const seedIds = await page.evaluate(async (pid) => {
    const r = await fetch(`/gonggan/timeline?pid=${encodeURIComponent(pid)}`);
    const j = await r.json();
    return (j.cuts || []).map((c) => c.id);
  }, pid);
  const cutIds = [...seedIds];
  for (let i = 0; i < 3; i++) {
    const add = await api(page, "/gonggan/cut/add", { pid });
    if (!add.ok) { console.error("FAIL cut add", add); process.exit(1); }
    cutIds.push(add.j.cut.id);
  }
  const g1 = `s1-${Date.now()}`;
  const g2 = `s2-${Date.now()}`;
  const gr = await api(page, "/gonggan/groups", {
    pid,
    groups: [
      { id: g1, name: "Scene One", cut_ids: cutIds.slice(0, 2), collapsed: false },
      { id: g2, name: "Scene Two", cut_ids: cutIds.slice(2), collapsed: false },
    ],
  });
  if (!gr.ok) { console.error("FAIL groups", gr); process.exit(1); }

  await page.evaluate(async () => { if (typeof globalThis.__gongganReloadShotsData === "function") await globalThis.__gongganReloadShotsData(); });
  await page.waitForTimeout(2000);
  await page.selectOption(".gg-proj", { value: pid });
  await page.waitForTimeout(2000);

  const middleId = cutIds[0]; // first scene, not last in list
  await page.locator(`.gg-cut[data-cut-id="${middleId}"]`).click();
  await page.waitForTimeout(400);
  await page.locator(".gg-ir-cut").click();
  await page.waitForTimeout(1500);

  const check = await page.evaluate(({ middleId, g2 }) => {
    const rows = [...document.querySelectorAll(".gg-shots .gg-cut[data-cut-id]")];
    const ids = rows.map((r) => r.dataset.cutId);
    const last = rows[rows.length - 1];
    const wrap = document.querySelector(".gg-shots .gg-grp-wrap");
    const lr = last?.getBoundingClientRect();
    const wr = wrap?.getBoundingClientRect();
    const visible = !!(lr && wr && lr.bottom <= wr.bottom + 2 && lr.top >= wr.top - 2);
    const lastInScene2 = !!last?.closest(`.gg-grp-sec[data-group-id="${g2}"]`);
    return {
      ids,
      lastId: last?.dataset.cutId || "",
      selected: last?.classList.contains("gg-on"),
      middleStillNotLast: ids.indexOf(middleId) < ids.length - 1,
      visible,
      lastInScene2,
    };
  }, { middleId, g2 });

  const tl = await page.evaluate(async (pid) => {
    const r = await fetch(`/gonggan/timeline?pid=${encodeURIComponent(pid)}`);
    return r.json();
  }, pid);
  const serverOrder = (tl.cuts || []).map((c) => c.id);
  const serverLast = serverOrder[serverOrder.length - 1];

  if (!check.middleStillNotLast) { console.error("FAIL: setup middle cut should not be last", check); process.exit(1); }
  if (check.lastId !== serverLast) { console.error("FAIL: UI last != server last", check.lastId, serverLast); process.exit(1); }
  if (check.lastId === middleId) { console.error("FAIL: new cut not at list end (still after selection)", check); process.exit(1); }
  if (!check.selected) { console.error("FAIL: new cut not selected", check); process.exit(1); }
  if (!check.lastInScene2) { console.error("FAIL: new cut not in last scene", check); process.exit(1); }
  if (!check.visible) { console.error("FAIL: new cut not visible in list", check); process.exit(1); }

  await browser.close();
  console.log("e138_new_cut_pos OK", { lastId: check.lastId, count: check.ids.length });
})().catch((e) => { console.error("FAIL", e.message || e); process.exit(1); });