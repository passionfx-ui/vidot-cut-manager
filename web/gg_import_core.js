/** Pure parser for Auto Cut Split import lists (no DOM). */

export const AUTO_CUT_SPLIT_FORMAT_LINE = "# Format: auto-cut-split v1";

export const REFERENCE_CATEGORIES = ["Character", "Place", "Prop", "Style", "Other"];

const REFERENCE_CATEGORY_MAP = new Map(
  REFERENCE_CATEGORIES.map((c) => [c.toLowerCase(), c])
);

// Same limits the server enforces in LocalStore.import_structure / _validate_planned_sec (keep in sync).
export const IMPORT_LIMITS = Object.freeze({ maxCuts: 500, minSec: 0.2, maxSec: 600, captionMax: 4000 });
const MAX_CUTS = IMPORT_LIMITS.maxCuts;

const LLM_PROMPT_TEXT = `Split the story below into scenes and cuts using the rules, and output only the result in this format. No commentary, no code fences.

# Format: auto-cut-split v1
# Scene: <scene name>
- Cut: <short cut name> | <seconds, integer 1-3 preferred> | <English caption: note or dialogue>
# References
- <Character|Place|Prop|Style|Other>: <name>

Rules:
- One cut = one image/clip idea. Keep cuts at 3 seconds or less unless the story needs longer.
- Every scene has at least one cut. Captions are in English, one line, max about 140 characters.
- Use the same reference names in captions as in the References section.
- No dates, no schedule, no extra fields.

Example:
# Format: auto-cut-split v1
# Scene: Arrival
- Cut: Platform wide | 3 | Rain on an empty platform.
# References
- Place: Old station

Story:
<paste your story here>`;

/** @param {string} text */
function splitLines(text) {
  return String(text ?? "").split(/\r?\n/);
}

/**
 * @param {string} s
 * @returns {{ namePart: string, secRaw: string|null, caption: string }}
 */
function splitCutFields(s) {
  const i1 = s.indexOf("|");
  if (i1 < 0) {
    return { namePart: s, secRaw: null, caption: "" };
  }
  const i2 = s.indexOf("|", i1 + 1);
  const namePart = s.slice(0, i1);
  if (i2 < 0) {
    return { namePart, secRaw: s.slice(i1 + 1), caption: "" };
  }
  return {
    namePart,
    secRaw: s.slice(i1 + 1, i2),
    caption: s.slice(i2 + 1),
  };
}

/**
 * @param {number} line
 * @param {string} secRaw
 * @param {{ line: number, message: string }[]} errors
 * @returns {number|null}
 */
function parseSecondsSegment(line, secRaw, errors) {
  if (secRaw === null) return null;
  const t = secRaw.trim();
  if (t === "") return null;
  const n = Number(t);
  if (!Number.isFinite(n) || n < IMPORT_LIMITS.minSec || n > IMPORT_LIMITS.maxSec) {
    errors.push({
      line,
      message: `seconds must be a number between ${IMPORT_LIMITS.minSec} and ${IMPORT_LIMITS.maxSec}`,
    });
    return undefined;
  }
  return n;
}

/**
 * @param {number} line
 * @param {string} payload
 * @param {{ line: number, message: string }[]} errors
 * @returns {{ name: string, sec: number|null, caption: string }|null}
 */
function parseCutPayload(line, payload, errors) {
  const { namePart, secRaw, caption } = splitCutFields(payload);
  const name = namePart.trim();
  if (!name) {
    errors.push({
      line,
      message: "expected '- Cut: name | seconds | caption'",
    });
    return null;
  }
  const sec = parseSecondsSegment(line, secRaw, errors);
  if (sec === undefined) return null;
  const cap = caption.trim();
  if (cap.length > IMPORT_LIMITS.captionMax) {
    errors.push({
      line,
      message: `caption must be at most ${IMPORT_LIMITS.captionMax} characters`,
    });
    return null;
  }
  return { name, sec, caption: cap };
}

/**
 * @param {{ name: string, line: number, cuts: object[] }|null} scene
 * @param {{ line: number, message: string }[]} errors
 * @param {{ name: string, line: number, cuts: object[] }[]} scenes
 */
function finalizeScene(scene, errors, scenes) {
  if (!scene) return;
  if (scene.cuts.length === 0) {
    errors.push({
      line: scene.line,
      message: `scene '${scene.name}' has no cuts`,
    });
  }
  scenes.push(scene);
}

/**
 * @param {number|null|undefined} sec
 * @param {number} defaultSec
 */
function resolveSec(sec, defaultSec) {
  return sec == null ? defaultSec : sec;
}

/**
 * @param {string} text
 * @param {{ defaultSec?: number }} [options]
 */
export function parseImportList(text, options = {}) {
  const defaultSec = options.defaultSec ?? 3;
  const rawLines = splitLines(text);
  const errors = [];
  /** @type {{ name: string, line: number, cuts: object[] }[]} */
  const scenes = [];
  /** @type {object[]} */
  const loose = [];
  /** @type {{ category: string, name: string, line: number }[]} */
  const references = [];

  let firstNonBlankLine = 0;
  let firstNonBlankTrimmed = "";
  for (let i = 0; i < rawLines.length; i++) {
    const t = rawLines[i].trim();
    if (t !== "") {
      firstNonBlankLine = i + 1;
      firstNonBlankTrimmed = t;
      break;
    }
  }

  if (firstNonBlankLine === 0) {
    errors.push({
      line: 1,
      message: "first line must be '# Format: auto-cut-split v1'",
    });
  } else if (firstNonBlankTrimmed.startsWith("# Format:")) {
    if (firstNonBlankTrimmed !== AUTO_CUT_SPLIT_FORMAT_LINE) {
      errors.push({
        line: firstNonBlankLine,
        message: "unsupported format version (expected 'auto-cut-split v1')",
      });
    }
  } else {
    errors.push({
      line: 1,
      message: "first line must be '# Format: auto-cut-split v1'",
    });
  }

  let inReferences = false;
  /** @type {{ name: string, line: number, cuts: object[] }|null} */
  let currentScene = null;
  let cutCount = 0;
  let overCutLimit = false;

  const pushCut = (cut, line, target) => {
    if (overCutLimit) return;
    if (cutCount >= MAX_CUTS) {
      errors.push({
        line,
        message: `maximum ${MAX_CUTS} cuts allowed`,
      });
      overCutLimit = true;
      return;
    }
    cutCount += 1;
    target.push({
      name: cut.name,
      sec: resolveSec(cut.sec, defaultSec),
      caption: cut.caption,
      line,
    });
  };

  for (let i = 0; i < rawLines.length; i++) {
    const lineNum = i + 1;
    const trimmed = rawLines[i].trim();
    if (trimmed === "") continue;

    if (lineNum === firstNonBlankLine && trimmed === AUTO_CUT_SPLIT_FORMAT_LINE) {
      continue;
    }

    if (trimmed === "# References") {
      finalizeScene(currentScene, errors, scenes);
      currentScene = null;
      inReferences = true;
      continue;
    }

    if (inReferences) {
      if (trimmed.startsWith("- Cut:")) {
        errors.push({
          line: lineNum,
          message: "expected '- Cut: name | seconds | caption'",
        });
        continue;
      }
      const refMatch = trimmed.match(/^-\s*([^:]+):\s*(.*)$/);
      if (!refMatch) {
        errors.push({
          line: lineNum,
          message: "expected '- Cut: name | seconds | caption'",
        });
        continue;
      }
      const rawCat = refMatch[1].trim();
      const canonical = REFERENCE_CATEGORY_MAP.get(rawCat.toLowerCase());
      if (!canonical) {
        errors.push({
          line: lineNum,
          message: `unknown reference category '${rawCat}' (use Character, Place, Prop, Style or Other)`,
        });
        continue;
      }
      references.push({
        category: canonical,
        name: refMatch[2].trim(),
        line: lineNum,
      });
      continue;
    }

    if (trimmed.startsWith("# Scene:")) {
      finalizeScene(currentScene, errors, scenes);
      const sceneName = trimmed.slice("# Scene:".length).trim();
      if (!sceneName) {
        errors.push({
          line: lineNum,
          message: "expected '- Cut: name | seconds | caption'",
        });
        currentScene = null;
        continue;
      }
      currentScene = { name: sceneName, line: lineNum, cuts: [] };
      continue;
    }

    if (trimmed.startsWith("- Cut:")) {
      const payload = trimmed.slice("- Cut:".length);
      const cut = parseCutPayload(lineNum, payload, errors);
      if (!cut) continue;
      if (currentScene) {
        pushCut(cut, lineNum, currentScene.cuts);
      } else {
        pushCut(cut, lineNum, loose);
      }
      continue;
    }

    if (trimmed.startsWith("# Format:")) {
      if (trimmed !== AUTO_CUT_SPLIT_FORMAT_LINE) {
        errors.push({
          line: lineNum,
          message: "unsupported format version (expected 'auto-cut-split v1')",
        });
      } else {
        errors.push({
          line: lineNum,
          message: "expected '- Cut: name | seconds | caption'",
        });
      }
      continue;
    }

    errors.push({
      line: lineNum,
      message: "expected '- Cut: name | seconds | caption'",
    });
  }

  finalizeScene(currentScene, errors, scenes);

  const counts = {
    scenes: scenes.length,
    cuts: cutCount,
    references: references.length,
  };

  if (errors.length === 0 && cutCount === 0) {
    errors.push({ line: 0, message: "No cuts found" });
  }

  const ok = errors.length === 0 && cutCount > 0;

  return {
    ok,
    scenes,
    loose,
    references,
    errors,
    counts,
  };
}

/**
 * @param {ReturnType<typeof parseImportList>} result
 */
export function summarizeImport(result) {
  const nScenes = result.counts?.scenes ?? 0;
  const nCuts = result.counts?.cuts ?? 0;
  const nRefs = result.counts?.references ?? 0;
  const scenePart = nScenes === 1 ? "1 scene" : `${nScenes} scenes`;
  const cutPart = nCuts === 1 ? "1 cut" : `${nCuts} cuts`;
  let text = `${scenePart}, ${cutPart}`;
  if (nRefs > 0) {
    const refPart = nRefs === 1 ? "1 reference" : `${nRefs} references`;
    text += `, ${refPart}`;
  }
  return `${text} will be created`;
}

/**
 * @param {ReturnType<typeof parseImportList>} result
 */
export function firstErrorText(result) {
  const err = result.errors?.[0];
  if (!err) return "";
  return `Line ${err.line}: ${err.message}`;
}

/**
 * @param {ReturnType<typeof parseImportList>} result
 * @returns {{ scene: string|null, name: string, sec: number, caption: string }[]}
 */
export function flattenForCreate(result) {
  /** @type {{ scene: string|null, name: string, sec: number, caption: string }[]} */
  const out = [];
  for (const cut of result.loose ?? []) {
    out.push({
      scene: null,
      name: cut.name,
      sec: cut.sec,
      caption: cut.caption,
    });
  }
  for (const scene of result.scenes ?? []) {
    for (const cut of scene.cuts ?? []) {
      out.push({
        scene: scene.name,
        name: cut.name,
        sec: cut.sec,
        caption: cut.caption,
      });
    }
  }
  return out;
}

export function buildLlmPrompt() {
  return LLM_PROMPT_TEXT;
}
