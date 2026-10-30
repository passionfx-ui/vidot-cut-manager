import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  LAST_LOCATION_KEY,
  folderNotCreated,
  loadLastLocation,
  newProjectRequest,
  projectFolderName,
  projectFolderPath,
  saveLastLocation,
} from "../../web/gg_new_project_core.js";

function memStorage(init = {}) {
  const m = new Map(Object.entries(init));
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), map: m };
}

describe("New Project: last-used location", () => {
  it("empty until saved, then prefilled", () => {
    const s = memStorage();
    assert.equal(loadLastLocation(s), "");
    saveLastLocation(s, "  D:\\Films  ");
    assert.equal(s.map.get(LAST_LOCATION_KEY), "D:\\Films");
    assert.equal(loadLastLocation(s), "D:\\Films");
  });
  it("an empty location never overwrites the remembered one", () => {
    const s = memStorage({ [LAST_LOCATION_KEY]: "D:\\Films" });
    saveLastLocation(s, "   ");
    assert.equal(loadLastLocation(s), "D:\\Films");
  });
  it("missing or throwing storage is ignored", () => {
    const bad = { getItem: () => { throw new Error("x"); }, setItem: () => { throw new Error("x"); } };
    assert.equal(loadLastLocation(bad), "");
    assert.equal(loadLastLocation(null), "");
    assert.doesNotThrow(() => saveLastLocation(bad, "D:\\A"));
  });
});

describe("New Project: folder name (same rule as Python project_folder_name)", () => {
  it("keeps normal names, replaces bad characters, strips trailing dots/spaces", () => {
    assert.equal(projectFolderName("  My Film 2 "), "My Film 2");
    assert.equal(projectFolderName("박 속의 이름"), "박 속의 이름");
    assert.equal(projectFolderName('a/b\\c:d*e?f"g<h>i|j'), "a_b_c_d_e_f_g_h_i_j");
    assert.equal(projectFolderName("Film. . "), "Film");
    assert.equal(projectFolderName("x\u0001y"), "x_y");
  });
  it("empty, reserved and long names", () => {
    assert.equal(projectFolderName(" .. "), "Project");
    assert.equal(projectFolderName(null), "Project");
    assert.equal(projectFolderName("con"), "con_");
    assert.equal(projectFolderName("LPT1.txt"), "LPT1.txt_");
    assert.equal(projectFolderName("Console"), "Console");
    assert.equal(projectFolderName("x".repeat(300)).length, 120);
  });
});

describe("New Project: project folder path", () => {
  it("<location>\\<name>, one separator", () => {
    assert.equal(projectFolderPath("D:\\Films", "Night: Walk"), "D:\\Films\\Night_ Walk");
    assert.equal(projectFolderPath("D:\\Films\\", "A"), "D:\\Films\\A");
    assert.equal(projectFolderPath("C:\\", "A"), "C:\\A");
    assert.equal(projectFolderPath("/home/me/films/", "A"), "/home/me/films/A");
  });
  it("empty until both fields are filled", () => {
    assert.equal(projectFolderPath("", "A"), "");
    assert.equal(projectFolderPath("D:\\Films", "  "), "");
  });
  it("a location that already ends with the project name is used as is (no doubled folder)", () => {
    const loc = "N:\\Work\\2026_Contest_KINFA_PreventionSong";
    assert.equal(projectFolderPath(loc, "2026_Contest_KINFA_PreventionSong"), loc);
    assert.equal(projectFolderPath(`${loc}\\\\`, "2026_Contest_KINFA_PreventionSong"), loc);
    assert.equal(projectFolderPath("D:\\Films\\my film/", "My Film"), "D:\\Films\\my film");
    assert.equal(projectFolderPath("D:/Films/Night_ Walk", "Night: Walk"), "D:/Films/Night_ Walk");
    assert.equal(projectFolderPath("/home/me/films/A/", "A"), "/home/me/films/A");
  });
  it("only the whole last segment counts; POSIX paths compare case-sensitively", () => {
    assert.equal(projectFolderPath("D:\\Films\\My Film 2", "My Film"), "D:\\Films\\My Film 2\\My Film");
    assert.equal(projectFolderPath("D:\\My Film\\Out", "My Film"), "D:\\My Film\\Out\\My Film");
    assert.equal(projectFolderPath("/home/me/a", "A"), "/home/me/a/A");
    assert.equal(projectFolderPath("C:\\", "C"), "C:\\C");
  });
});

describe("New Project: request", () => {
  it("needs a name, then a location", () => {
    assert.deepEqual(newProjectRequest({ name: " ", location: "D:\\A" }), { error: "Enter a project name", field: "name" });
    assert.deepEqual(newProjectRequest({ name: "A", location: "  " }), { error: "Choose a location", field: "location" });
  });
  it("body carries name, location and the template only when one is picked", () => {
    assert.deepEqual(newProjectRequest({ name: " A ", location: " D:\\F ", template: "" }), { body: { name: "A", location: "D:\\F" } });
    assert.deepEqual(newProjectRequest({ name: "A", location: "D:\\F", template: "t.json" }).body, {
      name: "A",
      location: "D:\\F",
      template_ref: "t.json",
    });
  });
  it("no other settings are sent", () => {
    assert.deepEqual(Object.keys(newProjectRequest({ name: "A", location: "D:\\F", template: "t" }).body).sort(), ["location", "name", "template_ref"]);
  });
});

describe("New Project: server without folder support", () => {
  it("a create response without folder means ComfyUI was not restarted", () => {
    assert.equal(folderNotCreated({ id: "p", name: "A", native: true }), true);
    assert.equal(folderNotCreated({ id: "p", folder: "D:\\F\\A" }), false);
    assert.equal(folderNotCreated(null), false);
  });
});
