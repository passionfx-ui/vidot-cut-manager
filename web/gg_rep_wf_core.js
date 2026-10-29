/**
 * REP / Image|Video workflow kind helpers (pure, no DOM).
 */

export const CUT_WF_KIND_KEY = "gg.cutWfKind";

/** @param {unknown} v */
export function normalizeWorkflowKind(v) {
  if (v === "image" || v === "video") return v;
  return null;
}

/**
 * Kind of the timeline representative (pick) version.
 * @param {{ pick?: string, pick_version_id?: string, media?: { id?: string, kind?: string }, versions_list?: Array<{ id?: string, kind?: string }> } | null | undefined} cut
 * @returns {"image" | "video" | null}
 */
export function repMediaKind(cut) {
  if (!cut || typeof cut !== "object") return null;
  const pick = cut.pick ?? cut.pick_version_id ?? cut.media?.id ?? "";
  if (!pick) return normalizeWorkflowKind(cut.media?.kind);
  const list = cut.versions_list;
  if (Array.isArray(list)) {
    for (const v of list) {
      if (v && v.id === pick) return normalizeWorkflowKind(v.kind);
    }
  }
  return normalizeWorkflowKind(cut.media?.kind);
}

/**
 * @param {Storage | null | undefined} storage
 * @param {string} cutId
 * @returns {"image" | "video" | null}
 */
export function readCutWorkflowKindSwitch(storage, cutId) {
  if (!storage || !cutId || typeof storage.getItem !== "function") return null;
  try {
    const raw = storage.getItem(CUT_WF_KIND_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    return normalizeWorkflowKind(parsed[cutId]);
  } catch (_) {
    return null;
  }
}

/**
 * Explicit Image/Video switch wins over REP kind.
 * @param {{ userKind?: string | null, repKind?: string | null }} opts
 * @returns {"image" | "video" | null}
 */
export function resolveEffectiveWorkflowKind(opts) {
  const user = normalizeWorkflowKind(opts?.userKind);
  if (user) return user;
  return normalizeWorkflowKind(opts?.repKind);
}

/**
 * @param {string | null | undefined} fallback
 * @param {string} label base toast label (stored version workflow, etc.)
 */
export function workflowSourceToastDetail(label, fallback) {
  const base = label || "stored version workflow";
  if (fallback && String(fallback).trim()) return `${base} · ${fallback}`;
  return base;
}

/**
 * @param {{ kind?: string | null, media?: { kind?: string } } | null | undefined} cut
 * @param {"image" | "video" | null} effectiveKind
 */
export function shouldTryEmbeddedRepWorkflow(cut, effectiveKind) {
  if (!cut?.media || cut.media.kind !== "image") return false;
  const kind = effectiveKind ?? repMediaKind(cut);
  return kind === "image";
}

export const VERSION_WF_MISSING = "No workflow saved for this version.";

/**
 * @param {{ versions_list?: Array<{ id?: string }> } | null | undefined} cut
 * @param {string} vid
 */
export function findCutVersion(cut, vid) {
  if (!cut || !vid || !Array.isArray(cut.versions_list)) return null;
  return cut.versions_list.find((v) => v && v.id === vid) || null;
}

/**
 * Sources to try, in order, when a version thumbnail is clicked: the workflow embedded in an
 * image result first, then the per-version stored workflow (image or video).
 * @param {{ id?: string, kind?: string } | null | undefined} version
 * @returns {Array<"embedded" | "stored">}
 */
export function versionWorkflowSourceOrder(version) {
  if (!version || !version.id) return [];
  return version.kind === "image" ? ["embedded", "stored"] : ["stored"];
}

/**
 * Graph from a /gonggan/version-workflow payload: UI graph first, else the API prompt.
 * @param {{ workflow?: unknown, prompt?: unknown } | null | undefined} rec
 * @returns {object | null}
 */
export function workflowFromVersionRecord(rec) {
  if (!rec || typeof rec !== "object") return null;
  const isObj = (x) => !!x && typeof x === "object" && !Array.isArray(x) && Object.keys(x).length > 0;
  if (isObj(rec.workflow)) return rec.workflow;
  if (isObj(rec.prompt)) return rec.prompt;
  return null;
}

/**
 * Whether a version thumbnail is the one whose workflow is open in the shot tab.
 * @param {{ projectId?: string, cutId?: string, vid?: string } | null | undefined} open
 * @param {{ projectId?: string, cutId?: string, vid?: string, tabOpen?: boolean }} at
 */
export function isOpenVersion(open, at) {
  if (!open || !open.vid || !at?.tabOpen) return false;
  return open.projectId === at.projectId && open.cutId === at.cutId && open.vid === at.vid;
}
