// comfyui-gonggan-cut — "Shots" sidebar tab + "Timeline" bottom panel tab.
// Day 1: static render of real 공간쉐어 projects/cuts (read-only). Trim/reorder come next.
import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";

const EXT = "gonggan.cut";
const PID_KEY = "gg.pid";
const PX_PER_SEC = 48;
const bus = new EventTarget();
const state = { projects: [], pid: localStorage.getItem(PID_KEY) || "", timeline: null, cutId: "", error: "" };

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
  localStorage.setItem(PID_KEY, pid);
  bus.dispatchEvent(new Event("projects"));
  loadTimeline();
}

function selectCut(cutId) {
  state.cutId = cutId;
  bus.dispatchEvent(new Event("select"));
}

function paintSelection(root) {
  root.querySelectorAll("[data-cut-id]").forEach((el) => el.classList.toggle("gg-on", el.dataset.cutId === state.cutId));
  const on = root.querySelector(`[data-cut-id="${CSS.escape(state.cutId)}"]`);
  if (on) on.scrollIntoView({ block: "nearest", inline: "nearest" });
}

// ---------------- Shots (sidebar) ----------------
function mountShots(el) {
  el.innerHTML = "";
  const root = document.createElement("div");
  root.className = "gg-root gg-shots";
  el.appendChild(root);

  const paint = () => {
    const tl = state.timeline;
    const opts = state.projects.map((p) =>
      `<option value="${esc(p.id)}"${p.id === state.pid ? " selected" : ""}>${esc(p.name)} (${p.cut_count})</option>`).join("");
    const cuts = tl ? tl.cuts : [];
    root.innerHTML = `
      <div class="gg-head">
        <select class="gg-proj" title="Project">${opts}</select>
        <button class="gg-btn gg-reload" title="Reload">⟳</button>
      </div>
      ${state.error ? `<div class="gg-error">${esc(state.error)}</div>` : ""}
      <div class="gg-meta">${tl ? `${cuts.length} cuts · ${fmt(tl.total_sec)}` : ""}</div>
      <ol class="gg-cutlist">
        ${cuts.map((c) => `
          <li class="gg-cut" data-cut-id="${esc(c.id)}" title="${esc(c.story || c.prompt)}">
            <div class="gg-cut-thumb">${thumbHtml(c.media, "gg-thumb")}${c.media && c.media.kind === "video" ? '<span class="gg-badge">▶</span>' : ""}</div>
            <div class="gg-cut-text">
              <div class="gg-cut-name"><span class="gg-no">${c.index + 1}</span>${esc(c.name || "(untitled)")}</div>
              <div class="gg-cut-sub">${esc(c.scene)}${c.scene ? " · " : ""}${c.sec.toFixed(1)}s${c.versions > 1 ? ` · v${c.versions}` : ""}</div>
            </div>
          </li>`).join("")}
      </ol>`;
    root.querySelector(".gg-proj")?.addEventListener("change", (e) => selectProject(e.target.value));
    root.querySelector(".gg-reload")?.addEventListener("click", () => loadProjects());
    root.querySelectorAll(".gg-cut").forEach((li) => li.addEventListener("click", () => selectCut(li.dataset.cutId)));
    bindHoverPlay(root);
    paintSelection(root);
  };
  const onSel = () => paintSelection(root);
  bus.addEventListener("projects", paint);
  bus.addEventListener("timeline", paint);
  bus.addEventListener("select", onSel);
  paint();
  if (!state.projects.length) loadProjects();
  return () => {
    bus.removeEventListener("projects", paint);
    bus.removeEventListener("timeline", paint);
    bus.removeEventListener("select", onSel);
  };
}

// ---------------- Timeline (bottom panel) ----------------
function mountTimeline(el) {
  el.innerHTML = "";
  const root = document.createElement("div");
  root.className = "gg-root gg-timeline";
  el.appendChild(root);

  const paint = () => {
    const tl = state.timeline;
    const cuts = tl ? tl.cuts : [];
    const total = tl ? tl.total_sec : 0;
    const width = Math.max(1, Math.ceil(total * PX_PER_SEC));
    const ticks = [];
    for (let s = 0; s <= Math.ceil(total); s += 1) {
      ticks.push(`<span class="gg-tick${s % 5 === 0 ? " gg-major" : ""}" style="left:${s * PX_PER_SEC}px">${s % 5 === 0 ? esc(fmt(s).slice(0, 5)) : ""}</span>`);
    }
    root.innerHTML = `
      <div class="gg-tl-tools">
        <span class="gg-tl-title">${tl ? esc(tl.project.name) : "No project"}</span>
        <span class="gg-tl-info">${cuts.length} cuts · ${fmt(total)}</span>
        <button class="gg-btn gg-reload" title="Reload">⟳</button>
      </div>
      ${state.error ? `<div class="gg-error">${esc(state.error)}</div>` : ""}
      <div class="gg-tl-scroll">
        <div class="gg-tl-inner" style="width:${width}px">
          <div class="gg-ruler">${ticks.join("")}</div>
          <div class="gg-track">
            ${cuts.map((c) => `
              <div class="gg-clip${c.media ? "" : " gg-clip-empty"}${c.media && c.media.kind === "video" ? " gg-clip-video" : ""}"
                   data-cut-id="${esc(c.id)}" style="width:${Math.max(4, c.sec * PX_PER_SEC)}px"
                   title="${esc(`${c.index + 1}. ${c.name}  ${c.sec.toFixed(1)}s`)}">
                ${thumbHtml(c.media, "gg-clip-thumb")}
                <div class="gg-clip-label"><span class="gg-no">${c.index + 1}</span>${esc(c.name)}</div>
                <div class="gg-clip-dur">${c.sec.toFixed(1)}s</div>
              </div>`).join("")}
          </div>
        </div>
      </div>`;
    root.querySelector(".gg-reload")?.addEventListener("click", () => loadProjects());
    root.querySelectorAll(".gg-clip").forEach((c) => c.addEventListener("click", () => selectCut(c.dataset.cutId)));
    bindHoverPlay(root);
    paintSelection(root);
  };
  const onSel = () => paintSelection(root);
  bus.addEventListener("projects", paint);
  bus.addEventListener("timeline", paint);
  bus.addEventListener("select", onSel);
  paint();
  if (!state.projects.length) loadProjects();
  return () => {
    bus.removeEventListener("projects", paint);
    bus.removeEventListener("timeline", paint);
    bus.removeEventListener("select", onSel);
  };
}

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
    { id: "gg-timeline", title: "Timeline", type: "custom", icon: "pi pi-video", render: (el) => mountTimeline(el) },
  ],
  async setup() {
    app.extensionManager.registerSidebarTab({
      id: "gg-shots",
      icon: "pi pi-images",
      title: "Shots",
      tooltip: "공간쉐어 shot list",
      type: "custom",
      render: (el) => mountShots(el),
    });
  },
});
