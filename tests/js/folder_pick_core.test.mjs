import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DRIVES_TITLE,
  folderListError,
  folderListUrl,
  folderPickerView,
  folderPickTarget,
  isAbsoluteFolderPath,
  joinFolderPath,
  parentFolderPath,
  startPathCandidates,
} from "../../web/gg_folder_pick_core.js";

describe("folder picker core (0.9.94)", () => {
  it("folderListUrl encodes the path; empty = drive list", () => {
    assert.equal(folderListUrl(""), "/gonggan/folder/list?path=");
    assert.equal(folderListUrl(undefined), "/gonggan/folder/list?path=");
    assert.equal(folderListUrl("D:\\My Films&x"), "/gonggan/folder/list?path=D%3A%5CMy%20Films%26x");
  });

  it("isAbsoluteFolderPath", () => {
    for (const p of ["C:\\", "c:/x", "D:\\Films\\A", "\\\\srv\\share", "/home/a"]) assert.equal(isAbsoluteFolderPath(p), true, p);
    for (const p of ["", "Films", "C:", "C:Films", ".\\x", "..", "\\\\"]) assert.equal(isAbsoluteFolderPath(p), false, p);
  });

  it("joinFolderPath", () => {
    assert.equal(joinFolderPath("", "C:\\"), "C:\\");
    assert.equal(joinFolderPath("C:\\", "Films"), "C:\\Films");
    assert.equal(joinFolderPath("C:\\Films", "My Film"), "C:\\Films\\My Film");
    assert.equal(joinFolderPath("/", "home"), "/home");
    assert.equal(joinFolderPath("/home", "a"), "/home/a");
  });

  it("parentFolderPath goes one level up, drive roots go to the drive list", () => {
    assert.equal(parentFolderPath("D:\\Films\\My Film"), "D:\\Films");
    assert.equal(parentFolderPath("D:\\Films\\"), "D:\\");
    assert.equal(parentFolderPath("D:\\Films"), "D:\\");
    assert.equal(parentFolderPath("D:\\"), "");
    assert.equal(parentFolderPath("/home/a"), "/home");
    assert.equal(parentFolderPath("/home"), "/");
    assert.equal(parentFolderPath("/"), "");
    assert.equal(parentFolderPath(""), "");
  });

  it("startPathCandidates: typed path, its parents, then drives; relative paths start at drives", () => {
    assert.deepEqual(startPathCandidates("D:\\Films\\New\\Out"), ["D:\\Films\\New\\Out", "D:\\Films\\New", "D:\\Films", "D:\\", ""]);
    assert.deepEqual(startPathCandidates("  /srv/out "), ["/srv/out", "/srv", "/", ""]);
    assert.deepEqual(startPathCandidates(""), [""]);
    assert.deepEqual(startPathCandidates("relative\\folder"), [""]);
    assert.equal(startPathCandidates("C:\\a\\b\\c\\d\\e\\f", 3).length, 4);
  });

  it("folderPickerView for a folder", () => {
    const v = folderPickerView({ ok: true, path: "D:\\Films", parent: "D:\\", folders: ["A", "B c"] });
    assert.equal(v.title, "D:\\Films");
    assert.equal(v.canUp, true);
    assert.equal(v.parent, "D:\\");
    assert.deepEqual(v.items, [
      { name: "A", path: "D:\\Films\\A" },
      { name: "B c", path: "D:\\Films\\B c" },
    ]);
  });

  it("folderPickerView for a drive root (Up = drive list) and for the drive list (no Up)", () => {
    const root = folderPickerView({ path: "C:\\", parent: "", folders: ["Users"] });
    assert.equal(root.canUp, true);
    assert.equal(root.parent, "");
    assert.equal(root.items[0].path, "C:\\Users");
    const drives = folderPickerView({ path: "", parent: null, folders: ["C:\\", "D:\\"] });
    assert.equal(drives.canUp, false);
    assert.equal(drives.title, DRIVES_TITLE);
    assert.deepEqual(drives.items.map((it) => it.path), ["C:\\", "D:\\"]);
    assert.deepEqual(folderPickerView(null).items, []);
  });

  it("folderPickTarget: highlighted folder, else the open folder, nothing on the drive list", () => {
    const v = folderPickerView({ path: "D:\\Films", parent: "D:\\", folders: ["A"] });
    assert.equal(folderPickTarget(v, 0), "D:\\Films\\A");
    assert.equal(folderPickTarget(v, -1), "D:\\Films");
    assert.equal(folderPickTarget(v, 5), "D:\\Films");
    const drives = folderPickerView({ path: "", parent: null, folders: ["C:\\"] });
    assert.equal(folderPickTarget(drives, -1), "");
    assert.equal(folderPickTarget(drives, 0), "C:\\");
    assert.equal(folderPickTarget(null, 0), "");
  });

  it("folderListError: server message (permission, relative), missing route, network", () => {
    assert.deepEqual(folderListError(403, { ok: false, message: "Permission denied: this folder cannot be opened" }), {
      message: "Permission denied: this folder cannot be opened",
      routeMissing: false,
    });
    assert.equal(folderListError(404, { message: "Folder not found" }).routeMissing, false);
    const missing = folderListError(404, {});
    assert.equal(missing.routeMissing, true);
    assert.match(missing.message, /Restart ComfyUI/);
    assert.equal(folderListError(405, null).routeMissing, true);
    assert.equal(folderListError(500, {}).message, "Could not list folders (HTTP 500)");
    assert.equal(folderListError(0, null).message, "Could not list folders");
  });
});
