/** Which empty-list hint the Shots panel shows (pure; no DOM). */
export const NO_PROJECTS_HINT = "No projects yet. Create one to start.";
export const NEW_PROJECT_BUTTON = "New project";
export const NO_CUTS_HINT = "No cuts yet. Right-click here and choose Add Cut.";

/**
 * @param {{ projectsLoaded: boolean, projectCount: number, timeline: object|null, native: boolean }} s
 * @returns {{ kind: "projects", text: string, button: string } | { kind: "cuts", text: string } | null}
 *   button: label of the New project button shown under the hint
 */
export function emptyListHint(s) {
  if (s.projectsLoaded && !s.projectCount && !s.timeline) return { kind: "projects", text: NO_PROJECTS_HINT, button: NEW_PROJECT_BUTTON };
  if (s.timeline && s.native && !(s.timeline.cuts || []).length) return { kind: "cuts", text: NO_CUTS_HINT };
  return null;
}
