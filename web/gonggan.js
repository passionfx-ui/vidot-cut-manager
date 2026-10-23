// comfyui-gonggan-cut — "Shots" sidebar tab + "Timeline" bottom panel tab.
// Day 1: static render of real 공간쉐어 projects/cuts (read-only). Trim/reorder come next.
import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";

const EXT = "gonggan.cut";
const PID_KEY = "gg.pid";
const TIMELINE_TAB = "gg-timeline";
const SHOTS_TAB = "gg-shots";
const bus = new EventTarget();
const state = { projects: [], pid: localStorage.getItem(PID_KEY) || "", timeline: null, cutId: "", cutSel: new Set(), error: "" };

(function loadCss() {
  if (document.getElementById("gg-css")) return;
  const link = document.createElement("link");
  link.id = "gg-css";
  link.rel = "stylesheet";
  link.href = new URL("./gonggan.css", import.meta.url).href;
  document.head.appendChild(link);
})();

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const mediaUrl = (id) => api.apiURL("/gonggan/media?id=" + encodeURIComponent(id));
const posterUrl = (id) => api.apiURL("/gonggan/poster?id=" + encodeURIComponent(id));
const fmt = (t) => {
  t = Math.max(0, Number(t) || 0);
  const m = Math.floor(t / 60), s = Math.floor(t % 60), f = Math.floor((t * 10) % 10);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${f}`;
};

function thumbHtml(media, cls) {
  if (!media) return `<div class="${cls} gg-thumb-empty">no media</div>`;
  const url = esc(mediaUrl(media.id));
  if (media.kind === "video") {
    // poster from the pack cache; the video itself loads only on hover (preload=none)
    return `<video class="${cls}" src="${url}" poster="${esc(posterUrl(media.id))}" muted playsinline preload="none"></video>`;
  }
  return `<img class="${cls}" src="${esc(posterUrl(media.id))}" loading="lazy" decoding="async" alt="" />`;
}

async function getJson(route) {
  const res = await api.fetchApi(route);
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.ok === false) throw new Error(data.message || `HTTP ${res.status}`);
  return data;
}

async function loadProjects() {
  try {
    const data = await getJson("/gonggan/projects");
    state.projects = data.projects || [];
    state.error = "";
    if (!state.projects.some((p) => p.id === state.pid)) {
      const pick = state.projects.find((p) => p.id === data.active_project_id) || state.projects[0];
      state.pid = pick ? pick.id : "";
    }
  } catch (e) {
    state.error = "Could not load projects: " + e.message;
  }
  bus.dispatchEvent(new Event("projects"));
  await loadTimeline();
}

async function loadTimeline() {
  if (!state.pid) { state.timeline = null; bus.dispatchEvent(new Event("timeline")); return; }
  try {
    state.timeline = await getJson("/gonggan/timeline?pid=" + encodeURIComponent(state.pid));
    state.error = "";
  } catch (e) {
    state.timeline = null;
    state.error = "Could not load timeline: " + e.message;
  }
  bus.dispatchEvent(new Event("timeline"));
}

function selectProject(pid) {
  if (pid === state.pid) return;
  state.pid = pid;
  state.cutId = "";
  state.cutSel.clear();
  localStorage.setItem(PID_KEY, pid);
  bus.dispatchEvent(new Event("projects"));
  loadTimeline();
}

let wfLoadGen = 0;
let ggToastTimer = 0;

function ggToast(summary, detail, kind = "info") {
  let host = document.getElementById("gg-toast-host");
  if (!host) {
    host = document.createElement("div");
    host.id = "gg-toast-host";
    host.className = "gg-toast-host";
    document.body.appendChild(host);
  }
  clearTimeout(ggToastTimer);
  host.innerHTML = `<div class="gg-toast gg-toast-${kind}"><span class="gg-toast-sum">${esc(summary)}</span><span class="gg-toast-detail">${esc(detail)}</span></div>`;
  host.hidden = false;
  ggToastTimer = setTimeout(() => { host.hidden = true; }, 4500);
}

function cutById(cutId) {
  const tl = state.timeline;
  return tl ? tl.cuts.find((c) => c.id === cutId) : null;
}

function shotTitle(c) {
  if (!c) return "";
  return `${(c.pos ?? c.index) + 1}. ${c.name || "(untitled)"}`;
}

function panelPreviewHtml(c) {
  if (!c || !c.media) return `<div class="gg-panel-preview gg-panel-preview-empty">No media for this shot yet.</div>`;
  const url = esc(mediaUrl(c.media.id));
  if (c.media.kind === "video") {
    return `<div class="gg-panel-preview"><video class="gg-panel-vid" src="${url}" poster="${esc(posterUrl(c.media.id))}" controls muted playsinline preload="metadata"></video></div>`;
  }
  return `<div class="gg-panel-preview"><img class="gg-panel-img" src="${url}" alt="" decoding="async" /></div>`;
}

async function loadCutWorkflow(cutId, cut) {
  const tl = state.timeline;
  if (!tl || !cutId) return;
  const gen = ++wfLoadGen;
  const title = shotTitle(cut || cutById(cutId));
  try {
    const q = `/gonggan/workflow?pid=${encodeURIComponent(tl.project.id)}&cut_id=${encodeURIComponent(cutId)}`;
    const d = await getJson(q);
    if (gen !== wfLoadGen) return;
    const label = `gonggan-cut-${d.cut_no || cutId}.json`;
    if (app.extensionManager?.workflow?.activeWorkflow?.isModified && !confirm("Current workflow has unsaved changes. Load this shot's workflow anyway?")) return;
    if (typeof app.loadApiJson === "function") app.loadApiJson(d.workflow, label);
    else if (typeof app.loadGraphData === "function") await app.loadGraphData(d.workflow, true, true, label);
    sdk.msg = `Canvas: ${d.cut_no}. ${d.cut_name} · ${d.model} · seed ${d.seed}`;
    bus.dispatchEvent(new Event("sdk"));
    ggToast("Shot", `${title} — asset + workflow on canvas`, "ok");
  } catch (e) {
    if (gen !== wfLoadGen) return;
    const hasMedia = cut && cut.media;
    sdk.msg = hasMedia
      ? `Shot: ${title} (preview — no workflow: ${e.message})`
      : `Shot: ${title} — ${e.message}`;
    bus.dispatchEvent(new Event("sdk"));
    ggToast("Shot", hasMedia ? `${title} — preview only (${e.message})` : `${title} — ${e.message}`, "warn");
  }
}

function selectCut(cutId, opts) {
  const multi = opts && opts.multi;
  const cut = cutById(cutId);
  if (multi) {
    if (state.cutSel.has(cutId)) state.cutSel.delete(cutId);
    else state.cutSel.add(cutId);
  } else {
    state.cutSel.clear();
  }
  state.cutId = cutId;
  bus.dispatchEvent(new Event("select"));
  const i = state.timeline ? state.timeline.cuts.findIndex((c) => c.id === cutId) : -1;
  if (i >= 0 && typeof seek === "function" && !play.on) {
    play.idx = -1;
    seek(startOf(i) + 0.001);
  }
  if (!multi) loadCutWorkflow(cutId, cut);
}

function cutSelIds() {
  const cuts = state.timeline ? state.timeline.cuts : [];
  const ids = cuts.filter((c) => state.cutSel.has(c.id)).map((c) => c.id);
  if (!ids.length && state.cutId) ids.push(state.cutId);
  return ids;
}

function groupsClone() {
  return JSON.parse(JSON.stringify(state.timeline?.groups || []));
}

async function persistGroups(groups) {
  const tl = state.timeline;
  if (!tl) return;
  const data = await postJson("/gonggan/groups", { pid: tl.project.id, groups });
  state.timeline = data;
  state.error = "";
  bus.dispatchEvent(new Event("timeline"));
}

function stripCutsFromGroups(groups, cutIds) {
  const drop = new Set(cutIds);
  groups.forEach((g) => { g.cut_ids = (g.cut_ids || []).filter((id) => !drop.has(id)); });
  return groups.filter((g) => (g.cut_ids || []).length);
}

function orderCutIds(ids) {
  const cuts = state.timeline ? state.timeline.cuts : [];
  const rank = new Map(cuts.map((c, i) => [c.id, i]));
  return [...ids].sort((a, b) => (rank.get(a) ?? 9999) - (rank.get(b) ?? 9999));
}

async function createSceneGroup(cutIds) {
  let ids = orderCutIds(cutIds && cutIds.length ? cutIds : cutSelIds());
  if (!ids.length && state.cutId) ids = [state.cutId];
  if (!ids.length) return;
  const title = prompt("씬 제목 (Scene)", "씬 " + ((state.timeline?.groups?.length || 0) + 1));
  if (title === null || !title.trim()) return;
  let groups = stripCutsFromGroups(groupsClone(), ids);
  groups.push({ id: "s" + Date.now(), name: title.trim().slice(0, 40), cut_ids: ids, collapsed: false });
  await persistGroups(groups);
  state.cutSel.clear();
}

async function ungroupCuts(cutIds) {
  const ids = cutIds && cutIds.length ? cutIds : cutSelIds();
  await persistGroups(stripCutsFromGroups(groupsClone(), ids));
  state.cutSel.clear();
}

async function renameSceneGroup(groupId) {
  const g = (state.timeline?.groups || []).find((x) => x.id === groupId);
  if (!g) return;
  const title = prompt("씬 이름 (Scene)", g.name || "씬");
  if (title === null || !title.trim()) return;
  const groups = groupsClone();
  const hit = groups.find((x) => x.id === groupId);
  if (hit) hit.name = title.trim().slice(0, 40);
  await persistGroups(groups);
}

async function deleteSceneGroup(groupId) {
  if (!confirm("이 씬을 삭제할까요? (컷은 미분류로 남습니다)")) return;
  await persistGroups(groupsClone().filter((g) => g.id !== groupId));
}

async function toggleGroupCollapsed(groupId) {
  const groups = groupsClone();
  const g = groups.find((x) => x.id === groupId);
  if (!g) return;
  g.collapsed = !g.collapsed;
  await persistGroups(groups);
}

async function assignCutsToGroup(groupId, cutIds) {
  const ids = orderCutIds(cutIds);
  let groups = stripCutsFromGroups(groupsClone(), ids);
  const g = groups.find((x) => x.id === groupId);
  if (!g) return;
  g.cut_ids = orderCutIds([...(g.cut_ids || []), ...ids]);
  await persistGroups(groups);
  state.cutSel.clear();
}

async function splitSceneHere(cutId) {
  const tl = state.timeline;
  if (!tl) return;
  const cuts = tl.cuts;
  const idx = cuts.findIndex((c) => c.id === cutId);
  if (idx < 0) return;
  const gid = cuts[idx].group_id;
  const title = prompt("새 씬 제목 (이 샷부터)", cuts[idx].group_name || "씬");
  if (title === null || !title.trim()) return;
  const moveIds = [];
  for (let i = idx; i < cuts.length; i++) {
    if (!gid || cuts[i].group_id === gid) moveIds.push(cuts[i].id);
    else break;
  }
  let groups = stripCutsFromGroups(groupsClone(), moveIds);
  groups.push({ id: "s" + Date.now(), name: title.trim().slice(0, 40), cut_ids: moveIds, collapsed: false });
  await persistGroups(groups);
}

function groupColor(id) {
  let h = 0;
  for (let i = 0; i < (id || "").length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return [42, 88, 148, 118, 168, 28, 198][Math.abs(h) % 7];
}

function shotsSections(cuts, groups) {
  const rank = new Map(cuts.map((c, i) => [c.id, i]));
  const inGrp = new Set();
  const secs = (groups || []).map((g) => {
    const ids = (g.cut_ids || []).filter((id) => rank.has(id));
    ids.forEach((id) => inGrp.add(id));
    ids.sort((a, b) => rank.get(a) - rank.get(b));
    return { type: "group", group: g, cuts: ids.map((id) => cuts.find((c) => c.id === id)).filter(Boolean) };
  }).filter((s) => s.cuts.length);
  secs.sort((a, b) => rank.get(a.cuts[0].id) - rank.get(b.cuts[0].id));
  const loose = cuts.filter((c) => !inGrp.has(c.id));
  if (loose.length) secs.push({ type: "ungrouped", group: null, cuts: loose });
  return secs;
}

function cutRowHtml(c) {
  return `
    <li class="gg-cut${state.cutSel.has(c.id) ? " gg-sel" : ""}" data-cut-id="${esc(c.id)}" title="${esc(c.story || c.prompt)}">
      <div class="gg-cut-thumb">${thumbHtml(c.media, "gg-thumb")}${c.media && c.media.kind === "video" ? '<span class="gg-badge">▶</span>' : ""}${c.media && c.media.source && c.media.source !== "gonggan" ? `<span class="gg-badge gg-badge-l gg-src-${esc(c.media.source)}">${esc(fmtSrc(c.media.source))}</span>` : ""}</div>
      <div class="gg-cut-text">
        <div class="gg-cut-name"><span class="gg-no">${(c.pos ?? c.index) + 1}</span>${esc(c.name || "(untitled)")}</div>
        <div class="gg-cut-sub">${c.group_name ? esc(c.group_name) + " · " : ""}${c.sec.toFixed(1)}s${c.versions > 1 ? ` · v${c.versions}` : ""}</div>
      </div>
    </li>`;
}

function timelinePanelVisible() {
  const el = document.querySelector(".gg-timeline");
  return !!(el && el.isConnected && el.offsetParent);
}

function openTimelinePanel() {
  const cmd = app.extensionManager?.command;
  if (!cmd?.execute) return;
  if (timelinePanelVisible()) return;
  cmd.execute(`Workspace.ToggleBottomPanelTab.${TIMELINE_TAB}`);
}

/** Open Timeline when the Shots sidebar panel becomes visible (not when leaving). */
function bindShotsTabActivated(hostEl, onCleanup) {
  let wasShown = false;
  const sync = () => {
    if (!hostEl.isConnected) return;
    const r = hostEl.getBoundingClientRect();
    const shown = r.width > 0 && r.height > 0 && hostEl.offsetParent !== null;
    if (shown && !wasShown) openTimelinePanel();
    wasShown = shown;
  };
  const io = new IntersectionObserver(() => sync(), { threshold: 0.01 });
  io.observe(hostEl);
  onCleanup.push(() => io.disconnect());
  requestAnimationFrame(sync);
}

function paintSelection(root) {
  root.querySelectorAll("[data-cut-id]").forEach((el) => {
    el.classList.toggle("gg-on", el.dataset.cutId === state.cutId);
    el.classList.toggle("gg-sel", state.cutSel.has(el.dataset.cutId));
  });
  const on = root.querySelector(`[data-cut-id="${CSS.escape(state.cutId)}"]`);
  if (on) on.scrollIntoView({ block: "nearest", inline: "nearest" });
}

// ---------------- Shots (sidebar) ----------------
// ---- SDK status / versions / regen (Shots tab) ----
const sdk = { st: null, busy: "", msg: "" };

async function refreshSdk(force) {
  try { sdk.st = await (await api.fetchApi("/gonggan/sdk/status" + (force ? "?force=1" : ""))).json(); }
  catch (e) { sdk.st = { ok: false, error: String(e) }; }
  bus.dispatchEvent(new Event("sdk"));
}

function sdkBadge() {
  const st = sdk.st;
  if (!st) return `<span class="gg-sdk gg-sdk-wait" title="checking Comfy SDK…">● SDK</span>`;
  const tip = st.ok
    ? `Comfy SDK ${st.comfy_sdk} → comfy-api-proxy ${st.comfy_api_proxy} at ${st.proxy_url || st.base_url} → ComfyUI (${st.sdk_roundtrip_ms} ms)`
    : (st.error || "SDK not ready");
  return `<span class="gg-sdk ${st.ok ? "gg-sdk-ok" : "gg-sdk-bad"}" title="${esc(tip)}">● SDK${st.ok ? "" : " off"}</span>`;
}

const fmtSrc = (s) => ({ gonggan: "공간쉐어", "local-sdk": "SDK", "comfy-history": "Comfy", "comfy-output-folder": "Comfy" }[s] || s || "");

async function postJson(route, body) {
  const res = await api.fetchApi(route, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.ok === false) throw new Error(data.message || data.error || `HTTP ${res.status}`);
  return data;
}

function repIdOf(c) {
  return (c && (c.pick || (c.media && c.media.id))) || "";
}

function mediaFromVersion(v) {
  if (!v) return null;
  return { id: v.id, kind: v.kind, width: v.width, height: v.height, seconds: v.seconds, model: v.model, source: v.source };
}

function recomputeCutStarts() {
  const tl = state.timeline;
  if (!tl) return;
  let at = 0;
  for (const c of tl.cuts) {
    c.start = r2(at);
    at += c.sec;
  }
  tl.total_sec = r2(at);
}

/** Optimistic promote: swap timeline media + clamp trim, then persist via /gonggan/edit. */
function applyPickLocally(c, vid) {
  if (!c || !vid || repIdOf(c) === vid) return false;
  const v = (c.versions_list || []).find((x) => x.id === vid);
  if (!v) return false;
  c.pick = vid;
  c.media = mediaFromVersion(v);
  c.src_dur = v.kind === "video" ? Math.max(0, Number(v.seconds) || 0) : 0;
  const clamped = clampClip(c, c.in, c.sec);
  c.in = clamped.in;
  c.sec = clamped.sec;
  c.edited = true;
  recomputeCutStarts();
  play.idx = -1;
  return true;
}

async function setPick(cutId, vid) {
  const c = cutsNow().find((x) => x.id === cutId);
  if (!c) return;
  const prev = {
    pick: c.pick,
    in: c.in,
    sec: c.sec,
    media: c.media ? { ...c.media } : null,
    src_dur: c.src_dur,
    edited: c.edited,
  };
  if (!applyPickLocally(c, vid)) return;
  bus.dispatchEvent(new Event("timeline"));
  bus.dispatchEvent(new Event("select"));
  clearTimeout(ed.saveTimer);
  const ok = await saveEdit();
  if (ok) return;
  const v = (c.versions_list || []).find((x) => x.id === prev.pick);
  c.pick = prev.pick;
  c.media = prev.media || (v ? mediaFromVersion(v) : null);
  c.src_dur = prev.src_dur;
  c.in = prev.in;
  c.sec = prev.sec;
  c.edited = prev.edited;
  recomputeCutStarts();
  play.idx = -1;
  bus.dispatchEvent(new Event("timeline"));
  bus.dispatchEvent(new Event("select"));
  const msg = (state.error || "").replace(/^Save failed:\s*/, "") || "unknown error";
  ggToast("대표 저장 실패", `이전 버전으로 되돌림: ${msg}`, "warn");
}

async function regenCut(cutId) {
  const tl = state.timeline;
  if (!tl) return;
  sdk.busy = "regen"; sdk.msg = "Building + validating workflow (dry run)…"; bus.dispatchEvent(new Event("sdk"));
  try {
    const d = await postJson("/gonggan/regen", { pid: tl.project.id, cut_id: cutId, dry_run: true });
    const p = d.plan, v = d.validation || {};
    sdk.msg = v.ok ? `Dry run OK · ${p.model} · ${p.steps} steps · ~${p.approx_size} · seed ${p.seed}` : "Validation failed: " + (v.problems || [v.error]).join("; ");
    bus.dispatchEvent(new Event("sdk"));
    if (!v.ok) return;
    const ok = confirm(
      `Queue ONE generation job on this PC's GPU?\n\nCut ${p.cut_no}. ${p.cut_name}\nModel: ${p.model}\nSteps: ${p.steps} · CFG ${p.cfg} · ${p.sampler}\n` +
      `Size: ~${p.approx_size} (${p.megapixels} MP, ${p.aspect})\nSeed: ${p.seed}\n\nPrompt:\n${p.prompt.slice(0, 400)}`);
    if (!ok) { sdk.msg = "Not queued (cancelled)."; return; }
    await postJson("/gonggan/regen", { pid: tl.project.id, cut_id: cutId, dry_run: false, confirm: true, seed: p.seed });
    sdk.msg = "Queued through Comfy SDK → proxy → ComfyUI…";
  } catch (e) {
    sdk.msg = "Regenerate failed: " + e.message;
  } finally {
    sdk.busy = "";
    bus.dispatchEvent(new Event("sdk"));
  }
}

async function sendLastOutput(cutId) {
  const tl = state.timeline;
  if (!tl) return;
  sdk.busy = "send"; sdk.msg = "Looking for the last ComfyUI output…"; bus.dispatchEvent(new Event("sdk"));
  try {
    const d = await postJson("/gonggan/send-output", { pid: tl.project.id, cut_id: cutId });
    sdk.msg = `Added ${d.output.name} (${d.output.from}) as a new version.`;
    await loadTimeline();
  } catch (e) {
    sdk.msg = "Send failed: " + e.message;
  } finally {
    sdk.busy = "";
    bus.dispatchEvent(new Event("sdk"));
  }
}

api.addEventListener("gonggan.regen", (e) => {
  const j = e.detail || {};
  if (j.status === "done") { sdk.msg = `New version from SDK job ${j.sdk_job_id || ""}`; loadTimeline(); }
  else if (j.status === "error") sdk.msg = "SDK job failed: " + (j.error || "");
  else if (j.status === "running") sdk.msg = "SDK job running…";
  bus.dispatchEvent(new Event("sdk"));
});

function cutPanelHtml(c) {
  if (!c) return `<div class="gg-panel-empty">Select a cut for versions and actions.</div>`;
  const rep = repIdOf(c);
  const vers = (c.versions_list || []).map((v) => {
    const on = v.id === rep;
    const tip = `${fmtSrc(v.source)} · ${v.model || ""} · ${new Date(v.created * 1000).toLocaleString()}`;
    return `
    <div class="gg-ver-wrap${on ? " gg-rep" : ""}" data-vid="${esc(v.id)}">
      <div class="gg-ver" title="${esc(tip)}">
        <img src="${esc(posterUrl(v.id))}" loading="lazy" alt="" />
        <span class="gg-ver-src gg-src-${esc(v.source)}">${esc(fmtSrc(v.source))}</span>
        ${on ? '<span class="gg-ver-rep">대표</span>' : ""}
      </div>
      <button type="button" class="gg-btn gg-promote${on ? " gg-on" : ""}" ${on ? "disabled" : ""} title="${on ? "타임라인에 쓰는 대표 버전" : "이 버전을 타임라인 대표로"}">${on ? "대표" : "대표로"}</button>
    </div>`;
  }).join("");
  return `
    <div class="gg-panel-title"><span class="gg-no">${c.pos + 1}</span>${esc(c.name)}</div>
    ${panelPreviewHtml(c)}
    <div class="gg-vers">${vers || '<span class="gg-dim">no versions yet</span>'}</div>
    <div class="gg-scene-actions">
      <button class="gg-btn gg-scene-new" type="button" title="선택한 샷을 새 씬(Scene)으로 묶기">+ 씬</button>
      <button class="gg-btn gg-scene-split" type="button" title="이 샷부터 새 씬으로 나누기">씬 나누기</button>
      <button class="gg-btn gg-scene-off" type="button" title="선택 샷을 씬에서 빼기 (미분류)">씬 해제</button>
    </div>
    <div class="gg-actions">
      <button class="gg-btn gg-regen" ${sdk.busy || !(sdk.st && sdk.st.ok) ? "disabled" : ""} title="Draft re-render through Comfy SDK → comfy-api-proxy → ComfyUI. Shows the job and asks before queueing.">Regenerate (new version)</button>
      <button class="gg-btn gg-send" ${sdk.busy ? "disabled" : ""} title="Copy ComfyUI's last output (from /history, else newest file in output/) into this cut as a new version">Send last ComfyUI output</button>
    </div>
    <div class="gg-sdk-msg">${esc(sdk.msg)}</div>`;
}

function mountShots(el) {
  el.innerHTML = "";
  const root = document.createElement("div");
  root.className = "gg-root gg-shots";
  el.appendChild(root);
  const extraCleanup = [];
  bindShotsTabActivated(el, extraCleanup);
  // The sidebar host has no definite height; pin the root to the visible viewport so the
  // cut list scrolls and the cut panel stays at the bottom.
  const scroller = () => {
    for (let e = el.parentElement; e && e !== document.body; e = e.parentElement) {
      const o = getComputedStyle(e).overflowY;
      if (o === "auto" || o === "scroll" || o === "hidden") return e;
    }
    return null;
  };
  let watched = null;
  const fit = () => {
    const sc = scroller();
    if (sc && sc !== watched) { watched = sc; ro.observe(sc); }
    const r = root.getBoundingClientRect();
    const bottom = sc ? sc.getBoundingClientRect().top + sc.clientHeight : window.innerHeight;
    const h = Math.floor(bottom - r.top - 1);
    if (h > 0) root.style.height = Math.max(200, h) + "px";
  };
  const ro = new ResizeObserver(fit);
  ro.observe(document.body);
  window.addEventListener("resize", fit);
  requestAnimationFrame(fit);
  setTimeout(fit, 300);
  setTimeout(fit, 1500);

  const paintPanel = () => {
    const panel = root.querySelector(".gg-cutpanel");
    const badge = root.querySelector(".gg-sdk-slot");
    if (badge) badge.innerHTML = sdkBadge();
    if (!panel) return;
    const c = state.timeline && state.timeline.cuts.find((x) => x.id === state.cutId);
    panel.innerHTML = cutPanelHtml(c);
    panel.querySelectorAll(".gg-promote").forEach((b) => b.addEventListener("click", (e) => {
      e.stopPropagation();
      const wrap = b.closest(".gg-ver-wrap");
      if (!b.disabled && wrap) setPick(c.id, wrap.dataset.vid);
    }));
    panel.querySelector(".gg-regen")?.addEventListener("click", () => regenCut(c.id));
    panel.querySelector(".gg-send")?.addEventListener("click", () => sendLastOutput(c.id));
    panel.querySelector(".gg-scene-new")?.addEventListener("click", () => createSceneGroup([c.id]));
    panel.querySelector(".gg-scene-split")?.addEventListener("click", () => splitSceneHere(c.id));
    panel.querySelector(".gg-scene-off")?.addEventListener("click", () => ungroupCuts([c.id]));
  };
  const paint = () => {
    const tl = state.timeline;
    const opts = state.projects.map((p) =>
      `<option value="${esc(p.id)}"${p.id === state.pid ? " selected" : ""}>${esc(p.name)} (${p.cut_count})</option>`).join("");
    const cuts = tl ? tl.cuts : [];
    const groups = tl ? tl.groups || [] : [];
    const selN = state.cutSel.size;
    const sections = shotsSections(cuts, groups);
    const listHtml = sections.map((sec) => {
      if (sec.type === "ungrouped") {
        return `<section class="gg-grp-sec gg-grp-loose"><header class="gg-grp-head">미분류 <span class="gg-grp-meta">${sec.cuts.length}</span></header><ol class="gg-cutlist">${sec.cuts.map(cutRowHtml).join("")}</ol></section>`;
      }
      const g = sec.group;
      const hue = groupColor(g.id);
      const collapsed = !!g.collapsed;
      return `<section class="gg-grp-sec" data-group-id="${esc(g.id)}" style="--gg-grp:${hue}">
        <header class="gg-grp-head">
          <button type="button" class="gg-grp-fold" title="접기/펼치기">${collapsed ? "▸" : "▾"}</button>
          <span class="gg-grp-title">씬 · ${esc(g.name)}</span>
          <span class="gg-grp-meta">${sec.cuts.length}</span>
          <button type="button" class="gg-grp-ren" title="이름 바꾸기">✎</button>
          <button type="button" class="gg-grp-del" title="씬 삭제 (컷은 미분류)">×</button>
        </header>
        <ol class="gg-cutlist"${collapsed ? " hidden" : ""}>${sec.cuts.map(cutRowHtml).join("")}</ol>
      </section>`;
    }).join("");
    root.innerHTML = `
      <div class="gg-head">
        <select class="gg-proj" title="Project">${opts}</select>
        <span class="gg-sdk-slot"></span>
        <button class="gg-btn gg-scene-add" type="button" title="새 씬 만들기">+ 씬</button>
        <button class="gg-btn gg-reload" title="Reload">⟳</button>
      </div>
      ${state.error ? `<div class="gg-error">${esc(state.error)}</div>` : ""}
      <div class="gg-meta">${tl ? `${cuts.length} shots · ${groups.length} scenes · ${fmt(tl.total_sec)}` : ""}</div>
      ${selN ? `<div class="gg-selbar">${selN} selected · <button type="button" class="gg-btn gg-sel-group">씬으로 묶기</button> · <button type="button" class="gg-btn gg-sel-ungroup">씬 해제</button> · <button type="button" class="gg-btn gg-sel-x">×</button></div>` : ""}
      <div class="gg-grp-wrap">${listHtml}</div>
      <div class="gg-cutpanel"></div>`;
    root.querySelector(".gg-proj")?.addEventListener("change", (e) => selectProject(e.target.value));
    root.querySelector(".gg-reload")?.addEventListener("click", () => { loadProjects(); refreshSdk(true); });
    root.querySelector(".gg-scene-add")?.addEventListener("click", () => createSceneGroup(cutSelIds()));
    root.querySelector(".gg-sel-group")?.addEventListener("click", () => createSceneGroup(cutSelIds()));
    root.querySelector(".gg-sel-ungroup")?.addEventListener("click", () => ungroupCuts(cutSelIds()));
    root.querySelector(".gg-sel-x")?.addEventListener("click", () => { state.cutSel.clear(); paint(); });
    root.querySelectorAll(".gg-grp-sec[data-group-id]").forEach((sec) => {
      const gid = sec.dataset.groupId;
      sec.querySelector(".gg-grp-fold")?.addEventListener("click", (e) => { e.stopPropagation(); toggleGroupCollapsed(gid); });
      sec.querySelector(".gg-grp-ren")?.addEventListener("click", (e) => { e.stopPropagation(); renameSceneGroup(gid); });
      sec.querySelector(".gg-grp-del")?.addEventListener("click", (e) => { e.stopPropagation(); deleteSceneGroup(gid); });
    });
    root.querySelectorAll(".gg-cut").forEach((li) => li.addEventListener("click", (e) => {
      selectCut(li.dataset.cutId, { multi: e.ctrlKey || e.metaKey });
      openTimelinePanel();
      paintSelection(root);
      paintPanel();
    }));
    bindHoverPlay(root);
    paintSelection(root);
    paintPanel();
    fit();
  };
  const onSel = () => { paintSelection(root); paintPanel(); fit(); };
  bus.addEventListener("projects", paint);
  bus.addEventListener("timeline", paint);
  bus.addEventListener("select", onSel);
  bus.addEventListener("sdk", paintPanel);
  paint();
  if (!state.projects.length) loadProjects();
  refreshSdk(false);
  const timer = setInterval(() => refreshSdk(false), 20000);
  return () => {
    ro.disconnect();
    window.removeEventListener("resize", fit);
    clearInterval(timer);
    bus.removeEventListener("projects", paint);
    bus.removeEventListener("timeline", paint);
    bus.removeEventListener("select", onSel);
    bus.removeEventListener("sdk", paintPanel);
    extraCleanup.forEach((fn) => fn());
  };
}

// ---------------- Timeline (bottom panel) ----------------
// Edit model: state.timeline.cuts in edit order, each with in/sec (+ src_dur for video caps).
const ed = {
  px: Number(localStorage.getItem("gg.px")) || 48,      // pixels per second (zoom)
  snap: localStorage.getItem("gg.snap") !== "0",          // on = 1 s steps, off = 0.1 s
  sound: localStorage.getItem("gg.sound") === "1",
  saveTimer: 0,
  saving: false,
  dragging: false,
};
const play = { on: false, t: 0, idx: -1, raf: 0, last: 0 };

const IMG_MIN = 0.5, IMG_MAX = 60, VID_MIN = 0.2;
const r2 = (x) => Math.round(x * 100 + 1e-6) / 100;
const cutsNow = () => (state.timeline ? state.timeline.cuts : []);
const totalSec = () => cutsNow().reduce((a, c) => a + c.sec, 0);
const startOf = (i) => cutsNow().slice(0, i).reduce((a, c) => a + c.sec, 0);
const kindOf = (c) => (c.media ? c.media.kind : null);
const fmtClock = (t) => {
  t = Math.max(0, Number(t) || 0);
  const m = Math.floor(t / 60), s = Math.floor(t % 60), f = Math.floor((t % 1) * 24 + 1e-6);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}:${String(f).padStart(2, "0")}`;
};

function snapSec(raw) {
  const n = Number(raw) || 0;
  return ed.snap ? Math.round(n) : Math.round(n * 10) / 10;
}

// Same rule as gg_data.clamp_clip (server re-validates on save).
function clampClip(c, tlIn, sec) {
  if (kindOf(c) !== "video") return { in: 0, sec: r2(Math.min(IMG_MAX, Math.max(IMG_MIN, sec))) };
  const dur = Number(c.src_dur) || 0;
  tlIn = Math.max(0, tlIn);
  if (dur) {
    tlIn = Math.min(tlIn, Math.max(0, dur - VID_MIN));
    sec = Math.min(sec, dur - tlIn);
  }
  return { in: r2(tlIn), sec: r2(Math.min(60, Math.max(VID_MIN, sec))) };
}

function scheduleSave() {
  clearTimeout(ed.saveTimer);
  ed.saveTimer = setTimeout(saveEdit, 400);
  bus.dispatchEvent(new Event("dirty"));
}

async function saveEdit() {
  const tl = state.timeline;
  if (!tl) return true;
  ed.saving = true;
  bus.dispatchEvent(new Event("dirty"));
  const body = {
    pid: tl.project.id,
    order: tl.cuts.map((c) => c.id),
    clips: Object.fromEntries(tl.cuts.map((c) => [c.id, { in: c.in, sec: c.sec, pick: c.pick || null }])),
  };
  let ok = true;
  try {
    const res = await api.fetchApi("/gonggan/edit", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const data = await res.json();
    if (!res.ok || data.ok === false) throw new Error(data.message || `HTTP ${res.status}`);
    if (!ed.dragging && state.timeline && state.timeline.project.id === data.project.id) {
      state.timeline = data;
      state.error = "";
    }
  } catch (e) {
    ok = false;
    state.error = "Save failed: " + e.message;
  }
  ed.saving = false;
  bus.dispatchEvent(new Event("timeline"));
  return ok;
}

async function resetEdit() {
  const tl = state.timeline;
  if (!tl) return;
  if (!confirm("Reset this timeline to the 공간쉐어 order and lengths? (the current edit is kept as a backup file)")) return;
  stopPlay();
  try {
    const res = await api.fetchApi("/gonggan/edit/reset", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pid: tl.project.id }) });
    const data = await res.json();
    if (!res.ok || data.ok === false) throw new Error(data.message || `HTTP ${res.status}`);
    state.timeline = data;
    state.error = "";
  } catch (e) {
    state.error = "Reset failed: " + e.message;
  }
  bus.dispatchEvent(new Event("timeline"));
}

// ---- playback ----
function itemAt(t) {
  const cuts = cutsNow();
  let at = 0;
  for (let i = 0; i < cuts.length; i++) {
    if (t < at + cuts[i].sec - 1e-6) return { i, local: t - at };
    at += cuts[i].sec;
  }
  return cuts.length ? { i: cuts.length - 1, local: cuts[cuts.length - 1].sec } : { i: -1, local: 0 };
}

let viewer = null;  // { box, img, vid, next, label, clock, playBtn, soundBtn }

function showFrame(force) {
  if (!viewer) return;
  if (viewer.mode === "export") { paintHead(); return; }
  const cuts = cutsNow();
  const { i, local } = itemAt(play.t);
  const c = cuts[i];
  const { img, vid, label, blank } = viewer;
  if (i !== play.idx || force) {
    play.idx = i;
    document.querySelectorAll(".gg-timeline .gg-clip").forEach((el) => el.classList.toggle("gg-play", c && el.dataset.cutId === c.id));
    if (!c) { img.hidden = vid.hidden = true; blank.hidden = false; blank.textContent = ""; label.textContent = ""; return; }
    label.textContent = c.group_name ? `씬 · ${c.group_name} — ${c.pos + 1}. ${c.name}` : `${c.pos + 1}. ${c.name}`;
    if (c.media && c.media.kind === "video") {
      img.hidden = true; blank.hidden = true; vid.hidden = false;
      const url = mediaUrl(c.media.id);
      if (vid.dataset.src !== url) { vid.dataset.src = url; vid.src = url; }
    } else if (c.media) {
      vid.pause(); vid.hidden = true; blank.hidden = true; img.hidden = false;
      const url = mediaUrl(c.media.id);
      if (img.dataset.src !== url) { img.dataset.src = url; img.src = url; }
    } else {
      vid.pause(); vid.hidden = true; img.hidden = true; blank.hidden = false;
      blank.textContent = `${c.pos + 1}. ${c.name} — no media`;
    }
    preloadNext(i + 1);
  }
  if (c && c.media && c.media.kind === "video") {
    vid.muted = !ed.sound;
    const want = c.in + local;
    try {
      if (vid.readyState >= 1) {
        const dur = Number(vid.duration);
        if (Number.isFinite(dur) && want >= dur - 0.04) { if (!vid.paused) vid.pause(); }
        else {
          if (Math.abs((vid.currentTime || 0) - want) > (play.on ? 0.15 : 0.02)) vid.currentTime = want;
          if (play.on && vid.paused) vid.play().catch(() => {});
          if (!play.on && !vid.paused) vid.pause();
        }
      } else if (!vid._ggWait) {
        vid._ggWait = true;
        vid.addEventListener("loadedmetadata", () => { vid._ggWait = false; showFrame(); }, { once: true });
      }
    } catch (_) {}
  }
  paintHead();
}

function preloadNext(i) {
  const c = cutsNow()[i];
  if (!viewer || !c || !c.media) return;
  const url = mediaUrl(c.media.id);
  if (c.media.kind === "video") { if (viewer.next.dataset.src !== url) { viewer.next.dataset.src = url; viewer.next.src = url; } }
  else { const im = new Image(); im.src = url; }
}

function paintHead() {
  const total = totalSec();
  document.querySelectorAll(".gg-timeline .gg-head-line").forEach((h) => { h.style.left = play.t * ed.px + "px"; });
  document.querySelectorAll(".gg-timeline .gg-clock").forEach((el) => { el.textContent = `${fmtClock(play.t)} / ${fmtClock(total)}`; });
  document.querySelectorAll(".gg-timeline .gg-play-btn").forEach((b) => { b.textContent = play.on ? "❚❚" : "▶"; b.title = play.on ? "Pause (Space)" : "Play (Space)"; });
  if (play.on) {
    const wrap = document.querySelector(".gg-timeline .gg-tl-scroll");
    if (wrap) {
      const x = play.t * ed.px, sl = wrap.scrollLeft, vw = wrap.clientWidth;
      if (x < sl + 16) wrap.scrollLeft = Math.max(0, x - 16);
      else if (x > sl + vw - 40) wrap.scrollLeft = x - 40;
    }
  }
}

function tick(now) {
  if (!play.on) return;
  const dt = Math.min(0.25, (now - play.last) / 1000);
  play.last = now;
  play.t += dt;
  const total = totalSec();
  if (play.t >= total) { play.t = total; stopPlay(); showFrame(); return; }
  showFrame();
  play.raf = requestAnimationFrame(tick);
}

function leaveExportView() {
  if (!viewer || viewer.mode !== "export") return;
  viewer.mode = "";
  viewer.vid.controls = false;
  viewer.vid.pause();
  viewer.vid.dataset.src = "";
  play.idx = -1;
}

function startPlay() {
  if (!cutsNow().length) return;
  leaveExportView();
  if (play.t >= totalSec() - 0.05) play.t = 0;
  play.on = true;
  play.last = performance.now();
  showFrame(true);
  play.raf = requestAnimationFrame(tick);
}

function stopPlay() {
  play.on = false;
  if (play.raf) cancelAnimationFrame(play.raf);
  play.raf = 0;
  if (viewer) viewer.vid.pause();
  paintHead();
}

function togglePlay() { play.on ? stopPlay() : startPlay(); }

function seek(t) {
  leaveExportView();
  play.t = Math.max(0, Math.min(totalSec(), t));
  play.last = performance.now();
  showFrame();
}

// ---- trim (port of app.js bindTlTrim) ----
function bindTrim(root) {
  root.querySelectorAll(".gg-edge").forEach((edge) => {
    edge.addEventListener("pointerdown", (e) => {
      if (e.button) return;
      e.preventDefault();
      e.stopPropagation();
      const el = edge.closest(".gg-clip");
      const c = cutsNow().find((x) => x.id === el.dataset.cutId);
      if (!c) return;
      const side = edge.dataset.side;
      const startX = e.clientX;
      const startIn = c.in, startSec = c.sec, outPt = startIn + startSec;
      const isVid = kindOf(c) === "video";
      let raf = 0, pendingX = startX;
      ed.dragging = true;
      el.classList.add("gg-trimming");
      const paint = (x) => {
        const dx = x - startX;
        let next;
        if (side === "l" && isVid) {
          const nextIn = Math.max(0, snapSec(startIn + dx / ed.px));
          next = clampClip(c, Math.min(nextIn, outPt - VID_MIN), outPt - Math.min(nextIn, outPt - VID_MIN));
        } else if (side === "l") {
          next = clampClip(c, 0, snapSec(startSec - dx / ed.px));
        } else {
          next = clampClip(c, startIn, snapSec(startSec + dx / ed.px));
        }
        c.in = next.in; c.sec = next.sec;
        layoutClips(root);
        const badge = el.querySelector(".gg-clip-dur");
        if (badge) badge.textContent = `${c.sec.toFixed(1)}s`;
        const inb = el.querySelector(".gg-clip-in");
        if (inb) inb.textContent = isVid && c.in > 0 ? `in ${c.in.toFixed(1)}` : "";
        const tip = root.querySelector(".gg-tip");
        if (tip) tip.textContent = isVid ? `in ${c.in.toFixed(2)}s · len ${c.sec.toFixed(2)}s · src ${c.src_dur ? c.src_dur.toFixed(2) + "s" : "?"}` : `len ${c.sec.toFixed(2)}s (still ${IMG_MIN}–${IMG_MAX}s)`;
      };
      const move = (ev) => {
        pendingX = ev.clientX;
        if (raf) return;
        raf = requestAnimationFrame(() => { raf = 0; paint(pendingX); });
      };
      const up = (ev) => {
        edge.removeEventListener("pointermove", move);
        edge.removeEventListener("pointerup", up);
        edge.removeEventListener("pointercancel", up);
        try { edge.releasePointerCapture(e.pointerId); } catch (_) {}
        if (raf) cancelAnimationFrame(raf);
        paint(ev.clientX || pendingX);
        el.classList.remove("gg-trimming");
        ed.dragging = false;
        c.edited = true;
        play.idx = -1;
        if (startIn !== c.in || startSec !== c.sec) scheduleSave();
        setTimeout(() => { const tip = root.querySelector(".gg-tip"); if (tip && !ed.dragging) tip.textContent = ""; }, 2500);
        bus.dispatchEvent(new Event("timeline"));
      };
      try { edge.setPointerCapture(e.pointerId); } catch (_) {}
      edge.addEventListener("pointermove", move);
      edge.addEventListener("pointerup", up);
      edge.addEventListener("pointercancel", up);
    });
  });
}

// ---- reorder (pointer-based; ComfyUI owns HTML5 drop for workflow files) ----
function bindReorder(root) {
  const track = root.querySelector(".gg-track");
  const marker = root.querySelector(".gg-drop");
  root.querySelectorAll(".gg-clip").forEach((el) => {
    el.addEventListener("pointerdown", (e) => {
      if (e.button || e.target.closest(".gg-edge")) return;
      const startX = e.clientX, startY = e.clientY;
      let active = false, target = -1;
      const cuts = cutsNow();
      const from = cuts.findIndex((x) => x.id === el.dataset.cutId);
      const slot = (x) => {
        const rect = track.getBoundingClientRect();
        const t = (x - rect.left) / ed.px;
        let at = 0;
        for (let i = 0; i < cuts.length; i++) {
          if (t < at + cuts[i].sec / 2) return i;
          at += cuts[i].sec;
        }
        return cuts.length;
      };
      const move = (ev) => {
        if (!active && Math.hypot(ev.clientX - startX, ev.clientY - startY) < 6) return;
        if (!active) { active = true; ed.dragging = true; el.classList.add("gg-moving"); try { el.setPointerCapture(e.pointerId); } catch (_) {} }
        target = slot(ev.clientX);
        marker.hidden = false;
        marker.style.left = startOf(target) * ed.px + "px";
      };
      const up = () => {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
        window.removeEventListener("pointercancel", up);
        marker.hidden = true;
        el.classList.remove("gg-moving");
        if (!active) { selectCut(el.dataset.cutId); return; }
        ed.dragging = false;
        if (target >= 0 && target !== from && target !== from + 1) {
          const [m] = cuts.splice(from, 1);
          cuts.splice(target > from ? target - 1 : target, 0, m);
          cuts.forEach((c, i) => { c.pos = i; });
          play.idx = -1;
          scheduleSave();
        }
        bus.dispatchEvent(new Event("timeline"));
      };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
      window.addEventListener("pointercancel", up);
    });
  });
}

function layoutClips(root) {
  const cuts = cutsNow();
  const byId = new Map(cuts.map((c) => [c.id, c]));
  root.querySelectorAll(".gg-clip").forEach((el) => {
    const c = byId.get(el.dataset.cutId);
    if (c) el.style.width = c.sec * ed.px + "px";
  });
  paintRuler(root);
}

function paintRuler(root) {
  const total = totalSec();
  const inner = root.querySelector(".gg-tl-inner");
  if (inner) inner.style.width = Math.max(1, Math.ceil((total + 2) * ed.px)) + "px";
  const ruler = root.querySelector(".gg-ruler");
  if (!ruler) return;
  const step = ed.px >= 30 ? 1 : ed.px >= 12 ? 2 : 5;
  const ticks = [];
  for (let s = 0; s <= Math.ceil(total) + 1; s += step) {
    const major = s % (step * 5) === 0;
    ticks.push(`<span class="gg-tick${major ? " gg-major" : ""}" style="left:${s * ed.px}px">${major ? esc(fmtClock(s).slice(0, 5)) : ""}</span>`);
  }
  ruler.innerHTML = ticks.join("");
  const info = root.querySelector(".gg-tl-info");
  if (info) info.textContent = `${cutsNow().length} cuts · ${fmtClock(total)}${state.timeline && state.timeline.edited ? " · edited" : ""}${ed.saving ? " · saving…" : ""}`;
}

function mountTimeline(el) {
  el.innerHTML = "";
  const root = document.createElement("div");
  root.className = "gg-root gg-timeline";
  root.tabIndex = -1;
  el.appendChild(root);
  root.innerHTML = `
    <div class="gg-viewer">
      <div class="gg-screen">
        <img class="gg-v-img" alt="" hidden />
        <video class="gg-v-vid" playsinline preload="auto" hidden></video>
        <video class="gg-v-next" muted preload="auto" hidden></video>
        <div class="gg-v-blank"></div>
        <div class="gg-v-label"></div>
      </div>
      <div class="gg-transport">
        <button class="gg-btn gg-play-btn" title="Play (Space)">▶</button>
        <span class="gg-clock">00:00:00 / 00:00:00</span>
        <button class="gg-btn gg-sound" title="Sound"></button>
      </div>
    </div>
    <div class="gg-editor">
      <div class="gg-tl-tools">
        <span class="gg-tl-title"></span>
        <span class="gg-tl-info"></span>
        <span class="gg-tip"></span>
        <button class="gg-btn gg-snap" title="Snap: 1 s steps (off = 0.1 s)">Snap</button>
        <button class="gg-btn gg-zoom-out" title="Zoom out">−</button>
        <button class="gg-btn gg-zoom-in" title="Zoom in">+</button>
        <button class="gg-btn gg-reset" title="Reset to 공간쉐어 order and lengths">Reset</button>
        <button class="gg-btn gg-reload" title="Reload">⟳</button>
        <span class="gg-sep"></span>
        <select class="gg-ex-preset" title="Export size">
          <option value="480p">480p</option><option value="720p" selected>720p</option><option value="1080p">1080p</option>
        </select>
        <label class="gg-ex-snd" title="Include clip audio (silence for stills)"><input type="checkbox" class="gg-ex-sound" checked /> audio</label>
        <button class="gg-btn gg-export gg-primary" title="Render the timeline to one mp4 (CPU, ffmpeg)">Export mp4</button>
      </div>
      <div class="gg-ex-row" hidden>
        <div class="gg-ex-bar"><div class="gg-ex-fill"></div></div>
        <span class="gg-ex-text"></span>
        <button class="gg-btn gg-ex-cancel">Cancel</button>
        <button class="gg-btn gg-ex-play" hidden>▶ Preview</button>
        <a class="gg-btn gg-ex-open" target="_blank" rel="noopener" hidden>Open</a>
        <span class="gg-ex-path" title="Click to copy path"></span>
        <button class="gg-btn gg-ex-close" title="Hide">×</button>
      </div>
      <div class="gg-error" hidden></div>
      <div class="gg-tl-scroll">
        <div class="gg-tl-inner">
          <div class="gg-ruler" title="Click to seek"></div>
          <div class="gg-track"></div>
          <div class="gg-drop" hidden></div>
          <div class="gg-head-line"></div>
        </div>
      </div>
    </div>`;
  viewer = {
    box: root,
    img: root.querySelector(".gg-v-img"),
    vid: root.querySelector(".gg-v-vid"),
    next: root.querySelector(".gg-v-next"),
    blank: root.querySelector(".gg-v-blank"),
    label: root.querySelector(".gg-v-label"),
  };
  const $r = (q) => root.querySelector(q);
  const paintButtons = () => {
    $r(".gg-snap").classList.toggle("gg-on", ed.snap);
    $r(".gg-sound").textContent = ed.sound ? "🔊" : "🔇";
    $r(".gg-sound").classList.toggle("gg-on", ed.sound);
  };
  $r(".gg-play-btn").addEventListener("click", togglePlay);
  $r(".gg-sound").addEventListener("click", () => { ed.sound = !ed.sound; localStorage.setItem("gg.sound", ed.sound ? "1" : "0"); viewer.vid.muted = !ed.sound; paintButtons(); });
  $r(".gg-snap").addEventListener("click", () => { ed.snap = !ed.snap; localStorage.setItem("gg.snap", ed.snap ? "1" : "0"); paintButtons(); });
  const zoom = (f) => { ed.px = Math.max(6, Math.min(240, Math.round(ed.px * f))); localStorage.setItem("gg.px", String(ed.px)); paintTrack(); };
  $r(".gg-zoom-in").addEventListener("click", () => zoom(1.5));
  $r(".gg-zoom-out").addEventListener("click", () => zoom(1 / 1.5));
  $r(".gg-reset").addEventListener("click", resetEdit);
  $r(".gg-export").addEventListener("click", () => startExport($r(".gg-ex-preset").value, $r(".gg-ex-sound").checked));
  $r(".gg-ex-cancel").addEventListener("click", cancelExport);
  $r(".gg-ex-play").addEventListener("click", () => showExport(exp.job));
  $r(".gg-ex-close").addEventListener("click", () => { exp.hidden = true; paintExport(); });
  $r(".gg-ex-path").addEventListener("click", (e) => { navigator.clipboard?.writeText(e.target.textContent).catch(() => {}); });
  $r(".gg-reload").addEventListener("click", () => loadProjects());
  $r(".gg-ruler").addEventListener("pointerdown", (e) => {
    const rect = $r(".gg-track").getBoundingClientRect();
    const go = (x) => seek((x - rect.left) / ed.px);
    go(e.clientX);
    const move = (ev) => go(ev.clientX);
    const up = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  });
  // The panel host has no definite height; size the root from it so the viewer can fill the panel.
  const host = el.parentElement || el;
  const fit = () => {
    const h = host.clientHeight || el.clientHeight;
    if (h > 60) root.style.height = h + "px";
    const scr = root.querySelector(".gg-screen");
    const w = Math.max(200, Math.min(host.clientWidth * 0.4, ((h || 220) - 46) * 16 / 9));
    if (scr) { scr.style.width = Math.round(w) + "px"; scr.style.height = Math.round(w * 9 / 16) + "px"; }
  };
  const ro = window.ResizeObserver ? new ResizeObserver(fit) : null;
  if (ro) ro.observe(host);
  fit();
  root.addEventListener("mouseenter", () => { root._ggHover = true; });
  root.addEventListener("mouseleave", () => { root._ggHover = false; });

  const paintTrack = () => {
    const tl = state.timeline;
    const cuts = cutsNow();
    $r(".gg-tl-title").textContent = tl ? tl.project.name : "No project";
    const err = $r(".gg-error");
    err.hidden = !state.error;
    err.textContent = state.error || "";
    $r(".gg-track").innerHTML = cuts.map((c, i) => {
      const run = c.group_id && (i === 0 || cuts[i - 1].group_id !== c.group_id);
      const hue = c.group_id ? groupColor(c.group_id) : 0;
      const tip = `${c.group_name ? `씬 · ${c.group_name}\n` : ""}${c.pos + 1}. ${c.name}  ${c.sec.toFixed(1)}s${c.src_dur ? ` (src ${c.src_dur}s)` : ""}`;
      return `
      <div class="gg-clip${c.media ? "" : " gg-clip-empty"}${kindOf(c) === "video" ? " gg-clip-video" : ""}${c.pos !== c.index ? " gg-moved" : ""}${c.group_id ? " gg-in-scene" : ""}${run ? " gg-scene-start" : ""}"
           data-cut-id="${esc(c.id)}" style="width:${c.sec * ed.px}px;${c.group_id ? `--gg-grp:${hue}` : ""}"
           title="${esc(tip)}">
        ${run ? `<div class="gg-scene-band">씬 · ${esc(c.group_name)}</div>` : ""}
        ${thumbHtml(c.media, "gg-clip-thumb")}
        <div class="gg-clip-label"><span class="gg-no">${c.pos + 1}</span>${esc(c.name)}</div>
        <div class="gg-clip-in">${kindOf(c) === "video" && c.in > 0 ? `in ${c.in.toFixed(1)}` : ""}</div>
        <div class="gg-clip-dur">${c.sec.toFixed(1)}s</div>
        <div class="gg-edge gg-edge-l${i > 0 ? " gg-edge-split" : ""}" data-side="l" title="Trim in"></div>
        <div class="gg-edge gg-edge-r${i < cuts.length - 1 ? " gg-edge-split" : ""}" data-side="r" title="Trim out"></div>
      </div>`;
    }).join("");
    layoutClips(root);
    bindTrim(root);
    bindReorder(root);
    paintSelection(root);
    paintButtons();
    if (play.t > totalSec()) play.t = totalSec();
    play.idx = -1;
    showFrame(true);
  };
  const onTimeline = () => { if (!ed.dragging) paintTrack(); };
  const onDirty = () => paintRuler(root);
  const onSel = () => {
    paintSelection(root);
    if (!play.on && state.cutId) {
      const idx = cutsNow().findIndex((c) => c.id === state.cutId);
      if (idx >= 0) {
        play.idx = -1;
        play.t = startOf(idx) + 0.001;
        showFrame(true);
      }
    }
  };
  const onProjects = () => { stopPlay(); play.t = 0; };
  bus.addEventListener("timeline", onTimeline);
  bus.addEventListener("projects", onProjects);
  bus.addEventListener("dirty", onDirty);
  bus.addEventListener("select", onSel);
  paintTrack();
  paintExport();
  refreshExport();
  if (!state.projects.length) loadProjects();
  return () => {
    stopPlay();
    if (ro) ro.disconnect();
    bus.removeEventListener("timeline", onTimeline);
    bus.removeEventListener("projects", onProjects);
    bus.removeEventListener("dirty", onDirty);
    bus.removeEventListener("select", onSel);
    if (viewer && viewer.box === root) viewer = null;
  };
}

// ---- export ----
const exp = { job: null, poll: 0, hidden: false };
const exportUrl = (name) => api.apiURL("/gonggan/export/file?name=" + encodeURIComponent(name));
const fmtMB = (b) => (b / 1048576).toFixed(1) + " MB";

function onExportJob(job) {
  if (!job || job.status === "idle") return;
  const was = exp.job && exp.job.status;
  exp.job = job;
  if (job.status === "running") exp.hidden = false;
  paintExport();
  if (job.status === "running" && !exp.poll) exp.poll = setInterval(refreshExport, 1000);
  if (job.status !== "running" && exp.poll) { clearInterval(exp.poll); exp.poll = 0; }
  if (was === "running" && job.status === "done") showExport(job);
}

async function refreshExport() {
  try { const d = await getJson("/gonggan/export/status"); onExportJob(d.job); } catch (_) {}
}

async function startExport(preset, sound) {
  const tl = state.timeline;
  if (!tl || !tl.cuts.length) return;
  clearTimeout(ed.saveTimer);
  if (ed.saving || ed.saveTimer) await saveEdit();   // export what is on screen
  stopPlay();
  try {
    const res = await api.fetchApi("/gonggan/export", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pid: tl.project.id, preset, fps: 24, sound }),
    });
    const data = await res.json();
    if (!data.ok) throw new Error(data.message || `HTTP ${res.status}`);
    exp.hidden = false;
    onExportJob(data.job);
  } catch (e) {
    state.error = "Export failed to start: " + e.message;
    bus.dispatchEvent(new Event("timeline"));
  }
}

async function cancelExport() {
  try { await api.fetchApi("/gonggan/export/cancel", { method: "POST" }); } catch (_) {}
  refreshExport();
}

function showExport(job) {
  if (!viewer || !job || job.status !== "done") return;
  stopPlay();
  viewer.mode = "export";
  const { img, vid, blank, label } = viewer;
  img.hidden = true; blank.hidden = true; vid.hidden = false;
  vid.controls = true;
  vid.muted = !ed.sound;
  const url = exportUrl(job.file);
  vid.dataset.src = url;
  vid.src = url;
  label.textContent = `EXPORT · ${job.file}`;
  document.querySelectorAll(".gg-timeline .gg-clip").forEach((el) => el.classList.remove("gg-play"));
}

function paintExport() {
  const root = document.querySelector(".gg-timeline");
  if (!root) return;
  const row = root.querySelector(".gg-ex-row");
  const job = exp.job;
  const btn = root.querySelector(".gg-export");
  const running = job && job.status === "running";
  btn.disabled = !!running;
  btn.textContent = running ? "Exporting…" : "Export mp4";
  row.hidden = !job || exp.hidden;
  if (!job) return;
  const pct = Math.round((job.progress || 0) * 100);
  row.querySelector(".gg-ex-fill").style.width = (job.status === "done" ? 100 : pct) + "%";
  row.classList.toggle("gg-ex-done", job.status === "done");
  row.classList.toggle("gg-ex-bad", job.status === "error" || job.status === "cancelled");
  const text = row.querySelector(".gg-ex-text");
  if (running) text.textContent = `${job.project} · ${job.preset} · ${job.step || ""} · ${pct}%`;
  else if (job.status === "done") text.textContent = `✓ ${job.preset} · ${fmtClock(job.expected_sec || 0)} · ${fmtMB(job.size || 0)} · ${Math.round((job.finished_at - job.started_at) || 0)}s`;
  else if (job.status === "cancelled") text.textContent = "Export cancelled";
  else if (job.status === "error") text.textContent = "Export failed: " + (job.error || "");
  row.querySelector(".gg-ex-cancel").hidden = !running;
  const done = job.status === "done";
  row.querySelector(".gg-ex-play").hidden = !done;
  const open = row.querySelector(".gg-ex-open");
  open.hidden = !done;
  if (done) open.href = exportUrl(job.file);
  row.querySelector(".gg-ex-path").textContent = done ? job.path : "";
}

api.addEventListener("gonggan.export", (e) => onExportJob(e.detail));

// Space = play/pause, only while the pointer is over (or focus is inside) the Timeline panel,
// so ComfyUI's own space-drag canvas panning keeps working everywhere else.
window.addEventListener("keydown", (e) => {
  if (e.code !== "Space" || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
  const root = document.querySelector(".gg-timeline");
  if (!root || !root.isConnected || !(root._ggHover || root.contains(document.activeElement))) return;
  const t = e.target;
  if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
  e.preventDefault();
  e.stopPropagation();
  togglePlay();
}, true);

function bindHoverPlay(root) {
  root.querySelectorAll("video").forEach((v) => {
    const host = v.parentElement;
    host.addEventListener("mouseenter", () => { v.loop = true; v.play().catch(() => {}); });
    host.addEventListener("mouseleave", () => { v.pause(); try { v.currentTime = 0; } catch (_) {} });
  });
}

app.registerExtension({
  name: EXT,
  bottomPanelTabs: [
    { id: TIMELINE_TAB, title: "Timeline", type: "custom", icon: "pi pi-video", render: (el) => mountTimeline(el) },
  ],
  async setup() {
    app.extensionManager.registerSidebarTab({
      id: SHOTS_TAB,
      icon: "pi pi-images",
      title: "Shots",
      tooltip: "공간쉐어 shot list",
      type: "custom",
      render: (el) => mountShots(el),
    });
  },
});
