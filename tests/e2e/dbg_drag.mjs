import * as L from "./ux_lib.mjs";
const { page, browser } = await L.launch();
try {
  await L.openComfy(page); await L.openShots(page);
  const d = await L.post(page, "/gonggan/project/create", { name: "ZZ-test-dbgdrag" });
  const pid = d.project.id; L.created.push(pid);
  for (let i = 0; i < 3; i++) await L.post(page, "/gonggan/cut/add", { pid });
  await page.click(".gg-root.gg-shots .gg-reload"); await L.sleep(800);
  await page.select(".gg-root.gg-shots .gg-proj", pid); await L.sleep(1500);
  const ids = () => page.$$eval(".gg-root.gg-shots .gg-cut", (els) => els.map((e) => e.dataset.cutId.slice(-4) + "@" + (e.closest(".gg-grp-sec")?.dataset.groupId?.slice(-4) || "-")));
  L.note("before", await ids());
  page.on("request", (r) => { if (r.method() === "POST") L.note("POST", r.url()); });
  const cuts = await page.$$(".gg-root.gg-shots .gg-cut");
  const a = await cuts[0].boundingBox(), b = await cuts[2].boundingBox();
  L.note("boxes", { a, b });
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await page.mouse.down(); await L.sleep(80);
  await page.mouse.move(b.x + b.width / 2, b.y + 4, { steps: 12 }); await L.sleep(100);
  L.note("ind", await page.evaluate(() => { const i = document.querySelector(".gg-drag-ind"); return i ? { hidden: i.hidden, top: i.style.top } : null; }));
  await page.mouse.up(); await L.sleep(1000);
  L.note("after", await ids());
  await L.shot(page, "dbg_drag");
} catch (e) { L.note("ERR", String(e.stack || e)); }
finally { await L.cleanup(page); await L.close(browser); }