import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import * as cutSelectCore from "../../web/gg_cut_select_core.js";
import {
  shouldScheduleCutWorkflowLoad,
  shouldCancelPendingWorkflowLoad,
  shouldResetOpenTabTracking,
  shouldShowOpenTabMarker,
  isOpenTabCut,
  shotsKeyAction,
  stepCutId,
  selectAllCutIds,
} from "../../web/gg_cut_select_core.js";

const WEB = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../web");
const GONGGAN_JS = readFileSync(path.join(WEB, "gonggan.js"), "utf8");
const GONGGAN_CSS = readFileSync(path.join(WEB, "gonggan.css"), "utf8");

describe("shouldScheduleCutWorkflowLoad", () => {
  it("plain click schedules", () => {
    assert.equal(shouldScheduleCutWorkflowLoad({}), true);
  });

  it("multi and range do not schedule", () => {
    assert.equal(shouldScheduleCutWorkflowLoad({ multi: true }), false);
    assert.equal(shouldScheduleCutWorkflowLoad({ range: true }), false);
  });

  it("fromTimeline does not schedule", () => {
    assert.equal(shouldScheduleCutWorkflowLoad({ fromTimeline: true }), false);
  });

  it("fromTimeline with multi/range still does not schedule", () => {
    assert.equal(shouldScheduleCutWorkflowLoad({ fromTimeline: true, multi: true }), false);
    assert.equal(shouldScheduleCutWorkflowLoad({ fromTimeline: true, range: true }), false);
  });
});

describe("shouldCancelPendingWorkflowLoad", () => {
  it("only timeline cancels pending debounced load", () => {
    assert.equal(shouldCancelPendingWorkflowLoad({}), false);
    assert.equal(shouldCancelPendingWorkflowLoad({ fromTimeline: true }), true);
  });
});

describe("shouldResetOpenTabTracking", () => {
  it("plain click resets when graph cut differs", () => {
    assert.equal(
      shouldResetOpenTabTracking({ cutId: "a", graphCutId: "b" }),
      true,
    );
  });

  it("plain click resets when project differs", () => {
    assert.equal(
      shouldResetOpenTabTracking({
        cutId: "a",
        graphCutId: "a",
        projectId: "p1",
        graphProjectId: "p2",
      }),
      true,
    );
  });

  it("fromTimeline never resets", () => {
    assert.equal(
      shouldResetOpenTabTracking({
        fromTimeline: true,
        cutId: "a",
        graphCutId: "b",
      }),
      false,
    );
  });

  it("multi/range never reset", () => {
    assert.equal(
      shouldResetOpenTabTracking({ multi: true, cutId: "a", graphCutId: "b" }),
      false,
    );
  });
});

describe("shouldShowOpenTabMarker", () => {
  it("shows when open cut differs from selection", () => {
    assert.equal(
      shouldShowOpenTabMarker({
        cutId: "b",
        openCutId: "b",
        selectedCutId: "a",
        shotTabOpen: true,
        sameProject: true,
      }),
      true,
    );
  });

  it("hidden when open equals selected", () => {
    assert.equal(
      shouldShowOpenTabMarker({
        cutId: "a",
        openCutId: "a",
        selectedCutId: "a",
        shotTabOpen: true,
      }),
      false,
    );
  });

  it("hidden when tab not open or wrong project", () => {
    assert.equal(
      shouldShowOpenTabMarker({
        cutId: "b",
        openCutId: "b",
        selectedCutId: "a",
        shotTabOpen: false,
      }),
      false,
    );
    assert.equal(
      shouldShowOpenTabMarker({
        cutId: "b",
        openCutId: "b",
        selectedCutId: "a",
        shotTabOpen: true,
        sameProject: false,
      }),
      false,
    );
  });

  it("empty ids", () => {
    assert.equal(shouldShowOpenTabMarker({}), false);
    assert.equal(
      shouldShowOpenTabMarker({ cutId: "a", openCutId: "", selectedCutId: "b", shotTabOpen: true }),
      false,
    );
  });

  it("isOpenTabCut alias", () => {
    assert.equal(isOpenTabCut, shouldShowOpenTabMarker);
  });
});

describe("shotsKeyAction", () => {
  it("plain arrows step through the list", () => {
    assert.equal(shotsKeyAction({ key: "ArrowUp" }), "prev");
    assert.equal(shotsKeyAction({ key: "ArrowDown" }), "next");
    assert.equal(shotsKeyAction({ key: "ArrowDown", repeat: true }), "next");
  });

  it("Alt+arrows move cuts (existing)", () => {
    assert.equal(shotsKeyAction({ key: "ArrowUp", altKey: true }), "move-up");
    assert.equal(shotsKeyAction({ key: "ArrowDown", altKey: true }), "move-down");
  });

  it("Shift+arrows are not handled", () => {
    assert.equal(shotsKeyAction({ key: "ArrowDown", shiftKey: true }), null);
  });

  it("Enter opens, F2 renames", () => {
    assert.equal(shotsKeyAction({ key: "Enter" }), "open");
    assert.equal(shotsKeyAction({ key: "F2" }), "rename");
    assert.equal(shotsKeyAction({ key: "Enter", shiftKey: true }), null);
    assert.equal(shotsKeyAction({ key: "Enter", altKey: true }), null);
  });

  it("Alt+G groups, Alt+Shift+G ungroups", () => {
    assert.equal(shotsKeyAction({ key: "g", code: "KeyG", altKey: true }), "group");
    assert.equal(shotsKeyAction({ key: "G", code: "KeyG", altKey: true, shiftKey: true }), "ungroup");
  });

  it("Alt+G via physical key when the layout yields another character", () => {
    assert.equal(shotsKeyAction({ key: "©", code: "KeyG", altKey: true }), "group");
    assert.equal(shotsKeyAction({ key: "ㅎ", code: "KeyG", altKey: true }), "group");
  });

  it("Alt+N adds a cut", () => {
    assert.equal(shotsKeyAction({ key: "n", code: "KeyN", altKey: true }), "add");
    assert.equal(shotsKeyAction({ key: "N", code: "KeyN", altKey: true, shiftKey: true }), null);
  });

  it("Ctrl/Meta combos belong to ComfyUI", () => {
    assert.equal(shotsKeyAction({ key: "g", code: "KeyG", ctrlKey: true }), null);
    assert.equal(shotsKeyAction({ key: "g", code: "KeyG", ctrlKey: true, altKey: true }), null);
    assert.equal(shotsKeyAction({ key: "z", code: "KeyZ", ctrlKey: true }), null);
    assert.equal(shotsKeyAction({ key: "ArrowDown", metaKey: true }), null);
    assert.equal(shotsKeyAction({ key: "Enter", ctrlKey: true }), null);
    assert.equal(shotsKeyAction({ key: "Delete", ctrlKey: true }), null);
  });

  it("Ctrl/Cmd+A selects all cuts (layout-independent, repeats too); not with Shift/Alt, menu or field editing", () => {
    assert.equal(shotsKeyAction({ key: "a", code: "KeyA", ctrlKey: true }), "select-all");
    assert.equal(shotsKeyAction({ key: "A", code: "KeyA", metaKey: true }), "select-all");
    assert.equal(shotsKeyAction({ key: "ㅁ", code: "KeyA", ctrlKey: true }), "select-all");
    assert.equal(shotsKeyAction({ key: "a", code: "KeyA", ctrlKey: true, repeat: true }), "select-all");
    for (const extra of [{ shiftKey: true }, { altKey: true }, { menuOpen: true }, { fieldEditing: true }, { modalOpen: true }, { isComposing: true }]) {
      assert.equal(shotsKeyAction({ key: "a", code: "KeyA", ctrlKey: true, ...extra }), null, JSON.stringify(extra));
    }
  });

  it("IME composition is ignored", () => {
    assert.equal(shotsKeyAction({ key: "ArrowDown", isComposing: true }), null);
    assert.equal(shotsKeyAction({ key: "Enter", isComposing: true }), null);
    assert.equal(shotsKeyAction({ key: "Process", code: "KeyG", altKey: true }), null);
  });

  it("plain letters are not handled", () => {
    for (const k of ["g", "G", "n", "a", "t", "ㅎ"]) {
      assert.equal(shotsKeyAction({ key: k, code: "KeyG" }), null, k);
    }
    assert.equal(shotsKeyAction({ key: "G", code: "KeyG", shiftKey: true }), null);
  });

  it("Escape and Delete are kept", () => {
    assert.equal(shotsKeyAction({ key: "Escape" }), "escape");
    assert.equal(shotsKeyAction({ key: "Delete" }), "delete");
  });

  it("nothing while a modal is open", () => {
    for (const key of ["Escape", "Delete", "ArrowDown", "Enter", "F2"]) {
      assert.equal(shotsKeyAction({ key, modalOpen: true }), null, key);
    }
    assert.equal(shotsKeyAction({ key: "g", code: "KeyG", altKey: true, modalOpen: true }), null);
  });

  it("new keys are off while a context menu is open or a card field is edited", () => {
    assert.equal(shotsKeyAction({ key: "ArrowDown", menuOpen: true }), null);
    assert.equal(shotsKeyAction({ key: "Enter", fieldEditing: true }), null);
    assert.equal(shotsKeyAction({ key: "n", code: "KeyN", altKey: true, menuOpen: true }), null);
    assert.equal(shotsKeyAction({ key: "Escape", menuOpen: true }), "escape");
  });

  it("auto-repeat never re-fires dialogs or adds", () => {
    assert.equal(shotsKeyAction({ key: "Enter", repeat: true }), null);
    assert.equal(shotsKeyAction({ key: "F2", repeat: true }), null);
    assert.equal(shotsKeyAction({ key: "g", code: "KeyG", altKey: true, repeat: true }), null);
    assert.equal(shotsKeyAction({ key: "n", code: "KeyN", altKey: true, repeat: true }), null);
  });

  it("missing event", () => {
    assert.equal(shotsKeyAction(null), null);
    assert.equal(shotsKeyAction({}), null);
  });
});

describe("stepCutId", () => {
  const order = ["a", "b", "c", "d"];

  it("steps next / previous", () => {
    assert.equal(stepCutId(order, "b", 1), "c");
    assert.equal(stepCutId(order, "b", -1), "a");
  });

  it("stops at the ends", () => {
    assert.equal(stepCutId(order, "d", 1), "");
    assert.equal(stepCutId(order, "a", -1), "");
  });

  it("skips hidden cuts", () => {
    assert.equal(stepCutId(order, "a", 1, ["b", "c"]), "d");
    assert.equal(stepCutId(order, "d", -1, new Set(["c"])), "b");
    assert.equal(stepCutId(order, "c", 1, ["d"]), "");
  });

  it("leaves a hidden current cut", () => {
    assert.equal(stepCutId(order, "b", 1, ["b"]), "c");
    assert.equal(stepCutId(order, "b", -1, ["b"]), "a");
  });

  it("no current cut: down picks first visible, up picks last visible", () => {
    assert.equal(stepCutId(order, "", 1, ["a"]), "b");
    assert.equal(stepCutId(order, "zz", -1, ["d"]), "c");
  });

  it("empty list", () => {
    assert.equal(stepCutId([], "a", 1), "");
    assert.equal(stepCutId(null, "a", -1), "");
  });
});

describe("selectAllCutIds", () => {
  it("list order without cuts in collapsed scenes", () => {
    assert.deepEqual(selectAllCutIds(["a", "b", "c"], ["b"]), ["a", "c"]);
    assert.deepEqual(selectAllCutIds(["a", "", "c"]), ["a", "c"]);
    assert.deepEqual(selectAllCutIds(null), []);
  });
});

describe("0.9.125: no visible All button; Ctrl+A and Select All share one select-all", () => {
  const fnBody = (name) => {
    const s = GONGGAN_JS.slice(GONGGAN_JS.indexOf(`function ${name}(`));
    return s.slice(0, s.indexOf("\n}\n"));
  };

  it("the All button and its helpers are gone", () => {
    assert.ok(!GONGGAN_JS.includes("gg-list-all"));
    assert.ok(!GONGGAN_JS.includes("paintListAllButton"));
    assert.ok(!GONGGAN_CSS.includes("gg-list-all"));
    for (const name of ["listAllButtonView", "toggleAllCutSelection", "allVisibleCutsSelected"]) {
      assert.equal(typeof cutSelectCore[name], "undefined", name);
      assert.ok(!GONGGAN_JS.includes(name), name);
    }
  });

  it("Ctrl/Cmd+A selects all (also when everything is already selected), not inside text fields", () => {
    assert.equal(shotsKeyAction({ key: "a", ctrlKey: true }), "select-all");
    assert.equal(shotsKeyAction({ key: "a", metaKey: true }), "select-all");
    assert.equal(shotsKeyAction({ key: "A", code: "KeyA", ctrlKey: true, repeat: true }), "select-all");
    assert.equal(shotsKeyAction({ key: "a", ctrlKey: true, fieldEditing: true }), null);
    assert.equal(shotsKeyAction({ key: "a", ctrlKey: true, modalOpen: true }), null);
    assert.equal(shotsKeyAction({ key: "a", ctrlKey: true, shiftKey: true }), null);
    const handler = GONGGAN_JS.slice(GONGGAN_JS.indexOf("const onShotsSelectAllKey"));
    const body = handler.slice(0, handler.indexOf("\n  };\n"));
    assert.match(body, /tag === "INPUT" \|\| tag === "TEXTAREA" \|\| tag === "SELECT" \|\| t\?\.isContentEditable/);
    assert.match(body, /selectAllListCuts\(\)/);
  });

  it("selectAllListCuts selects every shown cut (no toggle back to none)", () => {
    const body = fnBody("selectAllListCuts");
    assert.match(body, /selectAllCutIds\(order, hidden\)/);
    assert.match(body, /state\.cutSel\.add\(id\)/);
    assert.ok(!/toggle/i.test(body));
  });

  it("cut card menu and empty list menu offer Select All", () => {
    assert.match(fnBody("openCutContextMenu"), /selectAll: \(\) => selectAllListCuts\(\)/);
    assert.match(fnBody("openShotsPanelContextMenu"), /label: SELECT_ALL_LABEL, action: \(\) => selectAllListCuts\(\)/);
  });

  it("click / Shift / Ctrl selection and the empty Queue rule are kept", () => {
    assert.match(GONGGAN_JS, /function selectCutRange\(fromId, toId\)/);
    assert.match(GONGGAN_JS, /function timelineSelectedCutIds\(\)/);
    assert.equal(shouldScheduleCutWorkflowLoad({ multi: true }), false);
    assert.equal(shouldScheduleCutWorkflowLoad({ range: true }), false);
  });
});
