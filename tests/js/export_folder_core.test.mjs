import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  EXPORT_OUTPUT_DEFAULT_LABEL,
  exportFolderCheckError,
  exportOutputDisplayPath,
} from "../../web/gg_export_folder_core.js";

describe("export output folder display", () => {
  it("shows effective path when no custom folder", () => {
    assert.equal(
      exportOutputDisplayPath({ effectivePath: "D:\\Films\\My\\edit" }),
      "D:/Films/My/edit",
    );
  });

  it("prefers custom export folder", () => {
    assert.equal(
      exportOutputDisplayPath({ exportFolder: "E:\\out", effectivePath: "D:\\x\\edit" }),
      "E:/out",
    );
  });

  it("uses default label when empty", () => {
    assert.equal(exportOutputDisplayPath({}), EXPORT_OUTPUT_DEFAULT_LABEL);
  });

  it("maps folder check errors", () => {
    assert.equal(exportFolderCheckError({ ok: false, message: "This folder is not writable" }), "This folder is not writable");
    assert.equal(exportFolderCheckError({ ok: true }), "");
  });
});
