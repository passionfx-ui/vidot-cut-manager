import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import {
  driveLabel,
  folderAddressTarget,
  folderListError,
  folderListUrl,
  folderNames,
  folderPickerPlaces,
  folderPickerView,
  folderPickTarget,
  isAbsoluteFolderPath,
  joinFolderPath,
  normalizeFolderInput,
  parentFolderPath,
  RELATIVE_PATH_ERROR,
  startPathCandidates,
} from "../../web/gg_folder_pick_core.js";

const GONGGAN_JS = readFileSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../web/gonggan.js"), "utf8");

describe("folder picker address bar (0.9.101)", () => {
  it("normalizeFolderInput strips quotes, spaces and trailing slashes", () => {
    const cases = {
      '"D:\\Films\\My Film"': "D:\\Films\\My Film",
      "'D:\\Films'": "D:\\Films",
      "  D:\\Films\\\\  ": "D:\\Films",
      '"D:\\Films\\"': "D:\\Films",
      "D:/Films/": "D:/Films",
      "\\\\srv\\share\\": "\\\\srv\\share",
      "/home/a/": "/home/a",
      " \"D:\\Films\"\r\n": "D:\\Films",
      '""': "",
      "": "",
    };
    for (const [raw, want] of Object.entries(cases)) assert.equal(normalizeFolderInput(raw), want, JSON.stringify(raw));
    assert.equal(normalizeFolderInput(undefined), "");
    assert.equal(normalizeFolderInput(null), "");
  });

  it("normalizeFolderInput keeps drive roots and /", () => {
    for (const raw of ["C:\\", "C:", "C:/", "C:\\\\", '"C:\\"', " C:\\ "]) assert.equal(normalizeFolderInput(raw), "C:\\", raw);
    assert.equal(normalizeFolderInput("d:"), "d:\\");
    assert.equal(normalizeFolderInput("/"), "/");
    assert.equal(normalizeFolderInput("///"), "/");
  });

  it("folderAddressTarget: normalized full path, empty = drives, relative = inline error", () => {
    assert.deepEqual(folderAddressTarget('"D:\\Films\\"'), { path: "D:\\Films", error: "" });
    assert.deepEqual(folderAddressTarget("C:"), { path: "C:\\", error: "" });
    assert.deepEqual(folderAddressTarget("  "), { path: "", error: "" });
    for (const bad of ["Films", "Films\\A", ".\\x", "..", "C:Films"]) {
      assert.deepEqual(folderAddressTarget(bad), { path: "", error: RELATIVE_PATH_ERROR }, bad);
    }
    assert.ok(RELATIVE_PATH_ERROR.length < 40);
  });

  it("driveLabel", () => {
    assert.equal(driveLabel("C:\\"), "C:");
    assert.equal(driveLabel("n:\\"), "N:");
    assert.equal(driveLabel("D:"), "D:");
    assert.equal(driveLabel("/"), "/");
  });

  it("folderPickerPlaces: quick folders, Last used (full path, not a duplicate), drives", () => {
    const data = {
      quick: [{ name: "Home", path: "C:\\Users\\a" }, { name: "Desktop", path: "C:\\Users\\a\\Desktop" }, { name: "x" }],
      drives: ["C:\\", "D:\\", "N:\\"],
    };
    const p = folderPickerPlaces(data, "D:\\Films\\");
    assert.deepEqual(p.quick, [
      { name: "Home", path: "C:\\Users\\a" },
      { name: "Desktop", path: "C:\\Users\\a\\Desktop" },
      { name: "Last used", path: "D:\\Films" },
    ]);
    assert.deepEqual(p.drives, [
      { name: "C:", path: "C:\\" },
      { name: "D:", path: "D:\\" },
      { name: "N:", path: "N:\\" },
    ]);
    assert.equal(folderPickerPlaces(data, "c:\\users\\A\\desktop").quick.length, 2, "same as Desktop");
    assert.equal(folderPickerPlaces(data, "relative").quick.length, 2);
    assert.equal(folderPickerPlaces(data, "").quick.length, 2);
    assert.deepEqual(folderPickerPlaces(null, ""), { quick: [], drives: [] });
  });
});

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
    assert.deepEqual(startPathCandidates('"D:\\Films\\"'), ["D:\\Films", "D:\\", ""]);
    assert.equal(startPathCandidates("C:\\a\\b\\c\\d\\e\\f", 3).length, 4);
  });

  it("folderPickerView for a folder", () => {
    const v = folderPickerView({ ok: true, path: "D:\\Films", parent: "D:\\", folders: ["A", "B c"], drives: ["C:\\"], quick: [] }, "E:\\Out");
    assert.equal(v.path, "D:\\Films");
    assert.equal(v.canUp, true);
    assert.deepEqual(v.drives, [{ name: "C:", path: "C:\\" }]);
    assert.deepEqual(v.quick, [{ name: "Last used", path: "E:\\Out" }]);
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
    assert.equal(drives.path, "");
    assert.deepEqual(drives.items.map((it) => it.path), ["C:\\", "D:\\"]);
    assert.deepEqual(folderPickerView(null).items, []);
    assert.deepEqual(folderPickerView(null).drives, []);
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

describe("folder pickers list folders only (0.9.125)", () => {
  it("folderNames keeps plain folder names only", () => {
    assert.deepEqual(folderNames(["A", "", "  ", null, 3, { name: "x" }, "A", "B"], "D:\\Films"), ["A", "B"]);
    assert.deepEqual(folderNames(["sub\\file.mp4", "a/b", "ok"], "D:\\Films"), ["ok"]);
    assert.deepEqual(folderNames(["C:\\", "D:\\"], ""), ["C:\\", "D:\\"], "drive list keeps drive roots");
    assert.deepEqual(folderNames(undefined, "D:\\"), []);
  });

  it("folderPickerView ignores file entries a listing might carry", () => {
    const v = folderPickerView({ path: "D:\\Films", parent: "D:\\", folders: ["A"], files: ["clip.mp4", "notes.txt"], entries: [{ name: "x.png", type: "file" }] });
    assert.deepEqual(v.items.map((it) => it.name), ["A"]);
  });

  it("every Browse… in New Project and Project Settings opens the one folder picker", () => {
    const browseButtons = GONGGAN_JS.match(/class="gg-btn gg-modal-folder-browse"/g) || [];
    const browseHandlers = GONGGAN_JS.match(/\.gg-modal-folder-browse"\)\?\.addEventListener\("click", \(\) => \{\s*openFolderPicker\(/g) || [];
    assert.equal(browseButtons.length, 2);
    assert.equal(browseHandlers.length, 2);
    for (const name of ["openNewProjectModal", "openProjectSettingsModal"]) {
      const s = GONGGAN_JS.slice(GONGGAN_JS.indexOf(`function ${name}(`));
      const body = s.slice(0, s.indexOf("\n}\n"));
      assert.match(body, /openFolderPicker\(/, name);
      assert.ok(!/type="file"|webkitdirectory|showDirectoryPicker|showOpenFilePicker/.test(body), name);
    }
  });

  it("the folder picker lists through GET /gonggan/folder/list only", () => {
    const s = GONGGAN_JS.slice(GONGGAN_JS.indexOf("async function fetchFolderList("));
    const body = s.slice(0, s.indexOf("\n}\n"));
    assert.match(body, /api\.fetchApi\(folderListUrl\(path\)\)/);
    assert.match(body, /folderPickerView\(data, lastUsed\)/);
    assert.ok(!/webkitdirectory|showDirectoryPicker/.test(GONGGAN_JS));
    assert.equal(folderListUrl("D:\\x"), "/gonggan/folder/list?path=D%3A%5Cx");
  });
});
