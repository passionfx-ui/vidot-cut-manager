import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  sanitizeNamePart,
  shotProjectFolder,
  shotCutFileName,
  shotWorkflowRelPath,
  projectIdFolderFallback,
  graphExtraMatchesShot,
  shotTabIdentityMatches,
  shouldSkipShotWorkflowReload,
} from "../../web/gg_shot_names.js";
import { pickFreeWorkflowPath } from "../../web/gg_autosave_core.js";

describe("shotProjectFolder", () => {
  it("same cut name in two projects -> different folder segments", () => {
    const a = shotWorkflowRelPath({
      projectName: "Alpha",
      projectId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
      cutName: "hero",
      cutNumber: 1,
    });
    const b = shotWorkflowRelPath({
      projectName: "Beta",
      projectId: "ffffffff-bbbb-cccc-dddd-eeeeeeeeeeee",
      cutName: "hero",
      cutNumber: 1,
    });
    assert.equal(shotCutFileName({ cutName: "hero" }), "hero.json");
    assert.notEqual(a, b);
    assert.match(a, /gonggan\/Alpha\/hero\.json$/);
    assert.match(b, /gonggan\/Beta\/hero\.json$/);
  });

  it("Korean-only project name -> id8 folder", () => {
    const id = "0192abcd-1234-5678-9abc-def012345678";
    const folder = shotProjectFolder({ projectName: "한글만", projectId: id });
    assert.equal(folder, projectIdFolderFallback(id));
    assert.equal(folder, "0192abcd");
  });

  it("mixed Korean and ASCII", () => {
    const folder = shotProjectFolder({ projectName: "ZZ 테스트 01", projectId: "x" });
    assert.equal(folder, "ZZ-01");
  });

  it("caps project folder at 60 chars", () => {
    const long = "a".repeat(80);
    assert.equal(shotProjectFolder({ projectName: long, projectId: "id" }).length, 60);
  });
});

describe("shotCutFileName", () => {
  it("empty cut name -> cutN", () => {
    assert.equal(shotCutFileName({ cutNumber: 3 }), "cut3.json");
  });

  it("respects 120-char file limit", () => {
    const name = "x".repeat(200);
    const file = shotCutFileName({ cutName: name });
    assert.equal(file.length, 120);
    assert.match(file, /\.json$/);
  });
});

describe("shotWorkflowRelPath safety", () => {
  it("rejects traversal in cut name after sanitize", () => {
    const p = shotWorkflowRelPath({
      projectName: "ok",
      projectId: "p1",
      cutName: "fine",
      cutNumber: 1,
    });
    assert.doesNotMatch(p, /\.\./);
    assert.equal(p.split("/").length, 3);
  });

  it("dots and spaces become safe segments", () => {
    const p = shotWorkflowRelPath({
      projectName: " my..proj ",
      projectId: "p1",
      cutName: " cut 1 ",
      cutNumber: 1,
    });
    assert.equal(p, "gonggan/my..proj/cut-1.json");
    const traversal = shotWorkflowRelPath({
      projectName: "ok",
      projectId: "p1",
      cutName: "../escape",
      cutNumber: 1,
    });
    assert.equal(traversal.split("/").length, 3);
    assert.doesNotMatch(traversal, /\/\.\.\//);
  });
});

describe("tab identity", () => {
  it("skip reload only when project and cut match", () => {
    assert.equal(
      shouldSkipShotWorkflowReload({
        cutId: "c1",
        projectId: "p1",
        lastCutId: "c1",
        lastProjectId: "p1",
        graphExtra: { projectId: "p1", cutId: "c1" },
        tabActive: true,
      }),
      true
    );
    assert.equal(
      shouldSkipShotWorkflowReload({
        cutId: "c1",
        projectId: "p2",
        lastCutId: "c1",
        lastProjectId: "p1",
        graphExtra: { projectId: "p1", cutId: "c1" },
        tabActive: true,
      }),
      false
    );
  });

  it("same cutId different projectId in graph -> no match", () => {
    assert.equal(graphExtraMatchesShot({ cutId: "c1", projectId: "p1" }, "p2", "c1"), false);
  });

  it("same basename different project -> shotTabIdentityMatches false", () => {
    assert.equal(
      shotTabIdentityMatches(
        { cutId: "c1", projectId: "p1" },
        { projectId: "p1", cutId: "c1" },
        { projectId: "p2", cutId: "c1" }
      ),
      false
    );
  });

  it("old tab without projectId never matches", () => {
    assert.equal(graphExtraMatchesShot({ cutId: "c1" }, "p1", "c1"), false);
    assert.equal(
      shotTabIdentityMatches({ cutId: "c1" }, null, { projectId: "p1", cutId: "c1" }),
      false
    );
  });
});

describe("pickFreeWorkflowPath in gonggan subfolder", () => {
  it("numbers within same folder, case-insensitive", () => {
    const existing = [
      "gonggan/myproj/cut1.json",
      "gonggan/myproj/CUT1 (2).json",
    ];
    const free = pickFreeWorkflowPath("gonggan/myproj/cut1.json", existing, { caseInsensitive: true });
    assert.equal(free, "gonggan/myproj/cut1 (3).json");
  });
});

describe("sanitizeNamePart", () => {
  it("trims leading and trailing dashes and dots", () => {
    assert.equal(sanitizeNamePart("---hello..."), "hello");
  });
});
