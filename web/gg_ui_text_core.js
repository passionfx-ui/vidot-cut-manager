/** Strip internal path segments from strings shown in toasts, dialogs, and alerts. */

const INTERNAL_PATH_SEG = /\bgonggan\b/i;

/**
 * Remove internal folder names from a path shown to the user (e.g. input/gonggan/file.png -> input/file.png).
 * @param {string} path
 */
export function sanitizeUserPath(path) {
  let s = String(path ?? "").replace(/\\/g, "/").trim();
  s = s.replace(/(^|\/)gonggan\//gi, "$1");
  s = s.replace(/^gonggan\//i, "");
  return s.replace(/\/+/g, "/");
}

/**
 * User-visible message: no internal product folder names or the word "native".
 * @param {string} text
 */
export function sanitizeUserMessage(text) {
  let s = String(text ?? "");
  s = s.replace(/(^|[\s(/])gonggan\//gi, "$1");
  s = s.replace(/\bgonggan\b/gi, "");
  s = s.replace(/(?<![A-Za-z0-9_$])n\u0061tive(?![A-Za-z0-9_$])/gi, "");
  return s.replace(/\s{2,}/g, " ").trim();
}

/** @param {string} text */
export function containsForbiddenUserText(text) {
  const s = String(text ?? "");
  if (INTERNAL_PATH_SEG.test(s)) return true;
  return /(?<![A-Za-z0-9_$])native(?![A-Za-z0-9_$])/i.test(s);
}
