import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  EXPORT_PLAY_LABEL,
  EXPORT_FOLDER_LABEL,
  exportPanelActions,
  exportDoneToastBody,
} from "../../web/gg_export_ui_core.js";

describe("export_ui_core", () => {
  it("uses Play and Show in Folder labels", () => {
    assert.equal(EXPORT_PLAY_LABEL, "Play");
    assert.equal(EXPORT_FOLDER_LABEL, "Show in Folder");
    assert.ok(!EXPORT_PLAY_LABEL.includes("Preview"));
  });

  it("disables actions until a finished export has a path", () => {
    const idle = exportPanelActions({ status: "running" });
    assert.equal(idle.hasFile, false);
    assert.equal(idle.playDisabled, true);
    assert.equal(idle.folderDisabled, true);
    const done = exportPanelActions({ status: "done", file: "x.mp4", path: "C:\\proj\\edit\\x.mp4" });
    assert.equal(done.hasFile, true);
    assert.equal(done.playDisabled, false);
    assert.equal(done.folderDisabled, false);
  });

  it("done toast mentions edit folder", () => {
    assert.match(exportDoneToastBody("cut.mp4"), /edit folder/);
  });
});
