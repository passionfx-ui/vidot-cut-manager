import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  EXPORT_TAB_ID,
  EXPORT_TAB_TITLE,
  bottomTabLabelsMatch,
  expectedBottomPanelTabLabels,
} from "../../web/gg_export_tab_core.js";

describe("export tab helpers", () => {
  it("defines tab id and title", () => {
    assert.equal(EXPORT_TAB_ID, "gg-export");
    assert.equal(EXPORT_TAB_TITLE, "Export");
  });

  it("matches bottom panel tab order", () => {
    assert.equal(bottomTabLabelsMatch(expectedBottomPanelTabLabels(), ["Logs", "Timeline", "Export"]), true);
    assert.equal(bottomTabLabelsMatch(expectedBottomPanelTabLabels(), ["LOGS", "TIMELINE", "Export"]), true);
    assert.equal(bottomTabLabelsMatch(expectedBottomPanelTabLabels(), ["Logs", "Timeline"]), false);
  });
});
