/** Which empty-list hint the Shots panel shows (pure; no DOM). */
export const NO_PROJECTS_HINT = "No projects yet. Right-click here and choose New Project\u2026";
export const NO_CUTS_HINT = "No cuts yet. Right-click here and choose Add Cut.";

/**
 * @param {{ projectsLoaded: boolean, projectCount: number, timeline: object|null, native: boolean }} s
 * @returns {{ kind: "projects"|"cuts", text: string } | null}
 */
export function emptyListHint(s) {
  if (s.projectsLoaded && !s.projectCount && !s.timeline) return { kind: "projects", text: NO_PROJECTS_HINT };
  if (s.timeline && s.native && !(s.timeline.cuts || []).length) return { kind: "cuts", text: NO_CUTS_HINT };
  return null;
}