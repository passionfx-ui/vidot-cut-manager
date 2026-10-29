import { computeCutLabels, cutDisplayLabel } from "./gg_cuts_core.js";

function collapseWs(s) {
  return String(s ?? "").trim().replace(/\s+/g, " ");
}

const MAX_LABEL_CHARS = 28;
const MIN_PROJECT_CHARS = 6;
const TAB_LABEL_SEP = "/";
const TAB_LABEL_PROJECT_SEP = " / ";
const TAB_LABEL_NO_SCENE = "Scene";
const TAB_LABEL_ELL = "…";

/**
 * @param {{ projectName?: string, sceneName?: string, cutLabel?: string }}
 * @returns {{ project: string, scene: string, cut: string } | null}
 */
function resolveShotTabParts({ projectName, sceneName, cutLabel }) {
  const project = collapseWs(projectName);
  if (!project) return null;
  const scene = collapseWs(sceneName);
  const cut = collapseWs(cutLabel) || "Untitled cut";
  return { project, scene, cut };
}

/**
 * Scene name (the cut's group, "" when ungrouped) and per-scene cut label for a timeline cut.
 * @param {object} cut
 * @param {{ cuts?: object[], groups?: { id: string, name?: string }[] } | null | undefined} timeline
 * @returns {{ sceneName: string, cutLabel: string }}
 */
export function shotTabCutParts(cut, timeline, labels) {
  if (cut?.kind === "reference") return { sceneName: "", cutLabel: cut.name || "Reference" };
  const gid = cut?.group_id ? String(cut.group_id) : "";
  const group = gid ? (timeline?.groups || []).find((g) => g.id === gid) : null;
  const sceneName = gid ? (group?.name ?? cut.group_name ?? "") : "";
  return { sceneName, cutLabel: cutDisplayLabel(cut, labels || computeCutLabels(timeline)) };
}

/** Scene word for labels: the scene name, or `Scene` when the cut has none. */
export function sceneLabelOrDefault(sceneName) {
  return collapseWs(sceneName) || TAB_LABEL_NO_SCENE;
}

/**
 * Cut card header parts `<cutLabel> <CutName>`; the scene name is shown only on the scene group header.
 * @returns {{ cutLabel: string, name: string }}
 */
export function cutHeaderParts(cut, timeline, labels) {
  const p = shotTabCutParts(cut, timeline, labels);
  if (cut?.kind === "reference") return { cutLabel: collapseWs(p.cutLabel), name: "" };
  return { cutLabel: collapseWs(p.cutLabel), name: collapseWs(cut?.name) || "(untitled)" };
}

function truncateWithEllipsis(s, maxLen) {
  if (maxLen <= 0) return TAB_LABEL_ELL;
  if (s.length <= maxLen) return s;
  if (maxLen === 1) return TAB_LABEL_ELL;
  return s.slice(0, maxLen - 1) + TAB_LABEL_ELL;
}

/**
 * Full untruncated tab tooltip: `<Project>/<Scene> <cutLabel>` (scene omitted when ungrouped),
 * followed by ` · <cutName>` when the cut has a name.
 */
export function formatShotTabTitle({ projectName, sceneName, cutLabel, cutName }) {
  const parts = resolveShotTabParts({ projectName, sceneName, cutLabel });
  if (!parts) return null;
  const rest = parts.scene ? `${parts.scene} ${parts.cut}` : parts.cut;
  const name = collapseWs(cutName);
  return `${parts.project}${TAB_LABEL_SEP}${rest}${name ? ` · ${name}` : ""}`;
}

/**
 * `<cutLabel> <Scene> / <Project>`; `Scene` stands in when the cut has no scene name; ` *` when edited.
 * Over budget: shorten the project, then the scene; the cut label and marker stay whole.
 * @returns {string|null} null when project name empty (do not override label).
 */
export function formatShotTabLabel({ projectName, sceneName, cutLabel, edited }) {
  const parts = resolveShotTabParts({ projectName, sceneName, cutLabel });
  if (!parts) return null;
  const { project, cut } = parts;
  const scene = sceneLabelOrDefault(parts.scene);
  const mark = edited ? " *" : "";
  const head = `${cut} ${scene}`;
  const full = `${head}${TAB_LABEL_PROJECT_SEP}${project}${mark}`;
  if (full.length <= MAX_LABEL_CHARS) return full;

  const minProjectSlot = MIN_PROJECT_CHARS + 1;
  const projectOnlyMax = MAX_LABEL_CHARS - head.length - TAB_LABEL_PROJECT_SEP.length - mark.length;
  if (projectOnlyMax >= minProjectSlot) {
    return head + TAB_LABEL_PROJECT_SEP + truncateWithEllipsis(project, projectOnlyMax) + mark;
  }

  const projectShort = truncateWithEllipsis(project, minProjectSlot);
  const headMax = MAX_LABEL_CHARS - TAB_LABEL_PROJECT_SEP.length - projectShort.length - mark.length;
  const sceneMax = headMax - cut.length - 1;
  const headShort = sceneMax >= 1 ? `${cut} ${truncateWithEllipsis(scene, sceneMax)}` : truncateWithEllipsis(head, headMax);
  return headShort + TAB_LABEL_PROJECT_SEP + projectShort + mark;
}

function basenameOnly(filename) {
  return String(filename ?? "").replace(/^.*\//, "");
}

function normFilenameKey(filename) {
  const b = basenameOnly(filename);
  const lower = b.toLowerCase();
  return lower.endsWith(".json") ? lower.slice(0, -5) : lower;
}

function tabOrigText(tab) {
  const orig = tab?.orig;
  if (orig != null && String(orig).length > 0) return String(orig);
  return String(tab?.text ?? "");
}

/** Strip path and .json for default tab label text. */
export function displayWorkflowFilename(filename) {
  const b = basenameOnly(filename);
  const lower = b.toLowerCase();
  return lower.endsWith(".json") ? b.slice(0, -5) : b;
}

/**
 * Drop stale ggOrig when Vue re-rendered the span (text no longer matches ggSet).
 * @param {{ text?: string, orig?: string, set?: string }}
 * @returns {{ text: string, orig: string }}
 */
export function normalizeTabDescriptor({ text, orig, set }) {
  const t = String(text ?? "");
  const o = orig != null ? String(orig) : "";
  const s = set != null ? String(set) : "";
  if (o !== "" && s !== "" && t === s) return { text: t, orig: o };
  if (o !== "" && (s === "" || t !== s)) return { text: t, orig: "" };
  return { text: t, orig: o };
}

function findUniqueWorkflowIndexByFilename(workflows, filenameKey) {
  if (!filenameKey) return -1;
  let found = -1;
  for (let i = 0; i < workflows.length; i++) {
    if (normFilenameKey(workflows[i].filename) !== filenameKey) continue;
    if (found >= 0) return -1;
    found = i;
  }
  return found;
}

/**
 * @param {{tabs: {text:string, orig?:string}[], workflows: {filename:string, label:string|null}[]}}
 * @returns {{index:number, action:"set"|"restore"|"none", text:string}[]}
 */
export function planTabLabels({ tabs, workflows }) {
  const n = tabs.length;
  const out = [];
  const indexAlign =
    n === workflows.length &&
    tabs.every((t, i) => normFilenameKey(tabOrigText(t)) === normFilenameKey(workflows[i]?.filename));

  for (let i = 0; i < n; i++) {
    const tab = tabs[i];
    const text = String(tab.text ?? "");
    const orig = tab.orig != null ? String(tab.orig) : "";
    let wfIndex = -1;
    if (indexAlign) {
      wfIndex = i;
    } else {
      wfIndex = findUniqueWorkflowIndexByFilename(workflows, normFilenameKey(tabOrigText(tab)));
      if (wfIndex < 0 && orig !== "" && n === workflows.length) wfIndex = i;
    }
    const label = wfIndex >= 0 ? workflows[wfIndex]?.label ?? null : null;

    if (label != null && label !== "" && text !== label) {
      out.push({ index: i, action: "set", text: label });
    } else if ((label == null || label === "") && orig !== "") {
      let restoreText = orig;
      if (wfIndex >= 0 && workflows[wfIndex]?.filename) {
        restoreText = displayWorkflowFilename(workflows[wfIndex].filename);
      }
      out.push({ index: i, action: "restore", text: restoreText });
    } else {
      out.push({ index: i, action: "none", text: text });
    }
  }
  return out;
}
