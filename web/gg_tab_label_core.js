function collapseWs(s) {
  return String(s ?? "").trim().replace(/\s+/g, " ");
}

/** @returns {string|null} null when project name empty (do not override label). */
export function formatShotTabLabel({ projectName, cutName, cutNumber }) {
  const project = collapseWs(projectName);
  if (!project) return null;
  let cut = collapseWs(cutName);
  if (!cut) {
    if (cutNumber != null && Number.isFinite(Number(cutNumber))) {
      cut = `Cut ${Number(cutNumber)}`;
    } else {
      cut = "Untitled cut";
    }
  }
  return `${project} / ${cut}`;
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
