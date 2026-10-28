# comfyui-gonggan-cut

Rough-cut (가편집) editor inside ComfyUI for 공간쉐어 shot projects.

- **Shots** sidebar tab: project picker + cut list with thumbnails.
- **Timeline** bottom panel tab: cuts in order on one video track, widths from each cut's `tl_sec`.

Day 1 is read-only: it reads `<data_root>/<uid>/_workspace.json` and the `j*_*.png/.mp4` results next to it. It never writes there.

## Settings
Copy `gonggan_settings.default.json` to `gonggan_settings.json` (gitignored) and edit `data_root` / `uid`.

## Routes
- `GET /gonggan/settings`
- `GET /gonggan/projects`
- `GET /gonggan/timeline?pid=<project id>`
- `GET /gonggan/media?id=<job id>` (restricted to `<data_root>/<uid>/`)

All routes are also available under `/api/gonggan/*`.

## Shots selection & context menu (0.5.0)
In the **Shots** list: click selects one cut (preview + workflow load, debounced). **Ctrl/Cmd+click** toggles multi-select; **Shift+click** selects a range in on-screen scene order. **Right-click** a cut or scene header for actions (group, ungroup, add local cut, soft delete). **Delete** / menu **Delete** hides cuts from Shots, Timeline, and export; pack-local cuts move to `trash/<pid>/<stamp>/<cut_id>/` with `manifest.json` (공간쉐어 files are never touched).

- `POST /gonggan/cut/delete` `{pid, cuts:[...]}` → `{ok, timeline}`
- `POST /gonggan/cut/restore` `{pid, cuts?}` → `{ok, timeline}` (omit `cuts` to restore all hidden)
- `GET /gonggan/trash?pid=` → `{ok, items}`

Hidden cut ids live in `edits/edit_<pid>.json` as `"hidden": [...]`; `save_edit` keeps `hidden` and `local_cuts`.

## Project workflow template (0.4.1)
Each project links one of ComfyUI’s saved user workflows. The pack stores only a reference in `templates/<project_id>.json`:

```json
{"workflow_ref": "sub/my-flow.json", "updated": 1730000000.0}
```

Older files that contain a full workflow graph still load. The graph is read from ComfyUI `user/default/workflows/` (same files as **GET** `/api/userdata?dir=workflows&recurse=true&split=false`).

- In the **Shots** header, **Template:** dropdown lists saved workflows; choosing one saves immediately. Pick **(none)** to clear.
- **+ Cut** adds a pack-local shot (stored in `edits/edit_<pid>.json` as `local_cuts`, never in 공간쉐어 data). If the project has a template, the graph is copied to `workflows/<pid>/<cut_id>/initial.workflow.json` for that cut.

## Per-version workflow store (0.4.0)
Each pack version under `versions/<pid>/<cut_id>/` can have a sidecar workflow file at `workflows/<pid>/<cut_id>/<vid>.workflow.json` (gitignored). It stores the UI graph and/or API prompt used for that take (`source`: `generated` or `png-backfill`). New SDK/send-output versions save automatically; existing PNGs can be backfilled without modifying the PNG bytes.

CLI (no server): `python -m gg_wfstore backfill [--dry-run] [--pid <project id>]` or `python tools/backfill_workflows.py …`

Shot click workflow load order: **stored version** → **project template** → **draft** (`/gonggan/workflow`). Toast shows which source was used. If the server has not been restarted yet (new routes 404), the UI falls back to the pre-0.4.0 draft→template chain.

Routes:
- `GET /gonggan/template?pid=<project id>` → `{ok, ref, exists, workflow}`
- `POST /gonggan/template` `{pid, ref}` (`ref` `""` clears; legacy `{pid, workflow}` still writes a full graph)
- `POST /gonggan/cut/add` `{pid, group?, after?}` → `{ok, cut, template_copied, timeline}`
- `GET /gonggan/version-workflow?pid=&cut=&vid=` → stored record for one version
- `GET /gonggan/cut-source-workflow?pid=&cut=` → `{ok, source, workflow, kind}` (`stored`|`template`|`draft`|null). Native projects also accept optional `kind=image|video` (explicit Image/Video mode or REP kind from the client) and return `kind_used` plus `fallback` (English toast detail when a lower-priority source was opened).
- `POST /gonggan/wfstore/backfill` `{pid?, dry_run?}` → `{ok, counts}`

## Install (dev)
`mklink /J C:\ComfyUI_windows_portable\ComfyUI\custom_nodes\comfyui-gonggan-cut C:\dev\comfyui-gonggan-cut`

## Comfy SDK path (local)
ComfyUI's own Python never imports the SDK. The pack calls `sdk_runner.py` in an isolated venv:

```
ComfyUI (pack routes) -> .venv-sdk\Scripts\python.exe sdk_runner.py -> comfy-sdk (COMFY_BASE_URL=http://127.0.0.1:8189)
                      -> comfy-api-proxy :8189 -> ComfyUI :8188
```

Setup (once):
```
py -3.13 -m venv .venv-sdk
.venv-sdk\Scripts\python -m pip install comfy-sdk comfy-api-proxy
start_proxy.bat        (runs comfy-api-proxy on 127.0.0.1:8189)
```
Tested with Python 3.13.6, comfy-sdk 0.5.0, comfy-api-proxy 0.1.6.

- `GET /gonggan/sdk/status` - venv + proxy health + an SDK `list_jobs` round trip (no generation).
- `POST /gonggan/regen {pid, cut_id}` - **dry run by default**: builds the draft workflow
  (Qwen-Image 2.1 + turbo LoRA, 4 steps, ~0.25 MP, same graph as 공간쉐어) and validates it against `/object_info`.
  Queues only with `{"dry_run": false, "confirm": true, "seed": <seed from the dry run>}`; the UI asks first.
- `POST /gonggan/send-output {pid, cut_id}` - copies ComfyUI's last output (in-memory `/history`, else newest file in `output/`) into the cut.
- New takes are stored in the pack's `versions/<pid>/<cut_id>/` (gitignored), never in 공간쉐어 data, and become the cut's pick in `edits/edit_<pid>.json`.

## Native projects (0.6.0)
Native projects live entirely in the pack folder (no 공간쉐어 `_workspace.json` writes). Gonggan-share projects stay **read-only** in the project list.

- **Shots** header: native projects appear first with a `[Native]` prefix; Gonggan-share entries show `(read-only)`.
- Right-click the project row (selector area): **New Project…**, **Rename Project…**, **Delete Project** (rename/delete only for native projects).
- Native projects support scenes, add cut, template dropdown, timeline edit, **Send last ComfyUI output**, and shot workflow load via `cut-source-workflow`. SDK **Regenerate** and timeline **Export mp4** are disabled for native projects (for now).

### Storage layout (native)
Under the pack directory (gitignored):

```
projects/
  index.json
  <project-uuid>/
    project.json          # scenes, cuts, trims, template_ref
    journal.ndjson
    workflows/<sha>.json  # deduped workflow blobs
    assets/<cut-id>/<version-id>.png|mp4|…
    versions/<cut-id>/<version-id>.json
trash/projects/<project-uuid>_<stamp>/   # deleted native projects
```

Routes (in addition to existing `/gonggan/*`):

- `POST /gonggan/project/create` `{name, template_ref?}`
- `POST /gonggan/project/rename` `{pid, name}`
- `POST /gonggan/project/delete` `{pid}` · `POST /gonggan/project/restore` `{pid}`
- `GET /gonggan/projects` — share projects plus native (`native: true|false`)

## Work stages & progress (0.7.0)
Each shot shows **Image / Video / Best** stage pills (from `versions_list` kinds and `pick`). The Shots header shows a summary line (`Done N/T · Video … · Image …`) and a segmented bar. **Timeline** clips show a small stage dot (gray / blue / purple / green).

**Live run chip** (only for jobs linked to a cut): pulsing dot + percent while running, `Queued #n` in queue, red **Failed** on error. Stage pills stay visible; the live chip hides when the run ends and the UI reloads timeline data (throttled **GET** `/gonggan/timeline`). Jobs started from the Gonggan shot workflow tab are linked via `api.queuePrompt` and `localStorage` key `gonggan.jobs` (max 200). Unmapped ComfyUI jobs appear as **Other job running** / **Other jobs: N running, M queued** in the Shots header (read-only).

Events (read-only sync): Comfy `api` WebSocket types `status`, `execution_start`, `execution_cached`, `executing`, `progress`, `progress_state`, `executed`, `execution_success`, `execution_error`, `execution_interrupted`; plus **GET** `/queue` (on panel open and debounced on `status`) and **GET** `/history?max_items=30` on open. Never writes to `/queue` or `/history`.

Pure stage helpers and the live tracker live in `web/gg_progress_core.js` (`cutStage`, `projectSummary`, `formatSummary`, `createProgressTracker`).

**Runner event contract** (for a future Comfy Cloud runner): `{ promptId, cutId, projectId, state, percent, node, queuePos, error, ts }` with `state` in `queued|running|done|failed|interrupted`. Emit the same objects into `createProgressTracker().emit(evt)`.

### JS tests (no npm)
```
node --test tests/js/progress_core.test.mjs tests/js/cut_stage.test.mjs tests/js/cuts_core.test.mjs tests/js/loadimage_core.test.mjs
```
Also run `node --check web/gonggan.js` and `node --check web/gg_progress_core.js` after UI edits.

## Auto-save on cut switch (0.8.1)
Switching to another shot while the Gonggan workflow tab has unsaved edits **auto-saves** via ComfyUI’s workflow store (same as Ctrl+S) instead of a blocking confirm. If save fails, the switch is cancelled and the tab is left unchanged. Logic: `web/gg_autosave_core.js`.

While the Gonggan shot tab is active and modified, the same save path runs at most every **2 s** (1 s poll), on **tab hide** (`visibilitychange` / `pagehide`), and still on **cut switch**. Each save stamps `extra.ggWip` (`web/gg_wip_core.js`) so reload can restore the working copy only when pick/version state matches. Opening a shot tries `workflows/gonggan/<projectId>/<cutId>.json` before embedded PNG workflow (picked image `workflow` chunk via `web/gg_wf_source_core.js`, only when the effective kind is image) and **GET** `/gonggan/cut-source-workflow` (native: version workflow by REP/switch kind, with `fallback` in the toast when a substitute source was used). Changing **Rep** on the cut whose workflow is open reloads the owned tab after autosave (`web/gg_rep_wf_core.js`; tests `tests/js/rep_wf_core.test.mjs`, `tests/test_cut_source_workflow.py`). E2E `tests/e2e/rep_workflow_test.mjs` is optional (needs ComfyUI restart for the new query param).

**Edited marker (`*`):** When widget values differ from the baseline captured at load, `localStorage` key `gg.edited` stores `{cutId: cutBaseKey}` (`web/gg_wf_source_core.js`). The star appears on the cut card title, timeline clip label, Info panel header, and shot tab label; it clears automatically when `cutBaseKey` changes (new pick/version). Unit tests: `tests/js/wf_source_core.test.mjs`. E2E: `tests/e2e/wf_marker_test.mjs` (blocks `/prompt` and `/gonggan/regen`).

## Shot workflow paths (0.8.2+)
Each shot’s ComfyUI tab copy is saved at a **stable id-based path**: `workflows/gonggan/<projectId>/<cutId>.json` (one working file per cut; reload/rename does not create `cut6 (2).json` suffixes). The tab bar still shows the display-only **Project / Cut** label from project/cut metadata, not the filename. Legacy name-based helpers remain in `web/gg_shot_names.js` for tests. E2E guard: `tests/e2e/tabfile_dedupe_test.mjs`.

## Timeline selection without tab switch (0.8.3)
Clicking a **Timeline** clip updates the selected cut and preview seek only; it does **not** load or switch the Gonggan shot workflow tab. **Shots** list clicks still open the cut workflow as before. When the canvas tab is a different cut than the selection, the Shots list shows a small **Open** marker on the open cut (`web/gg_cut_select_core.js`).

## Info panel tidy (0.9.1)
The selected-cut panel at the bottom of **Shots** is denser: one-line header (collapse, title, length, flags, Regen/Send), inline Length/End card/Needs redo, compact version strip, and project summary on one row (completion % + due date; stage bar only). Large in-panel preview and scene action buttons removed (**Split scene** moved to the cut context menu). Collapse state persists in `gg.panelOpen`. Pure helper: `web/gg_panel_core.js`; tests `tests/js/panel_core.test.mjs`.

## Cut header & captions (0.9.3)
Each cut row shows a single compact header (number, name, picked version summary, base vs trimmed length, Image/Video/Best dots). **Info** mode: per-cut **Notes** (`notes`, synced with the cut panel). **Caption** mode: per-cut **Dialogue / caption** (`caption`, separate field for Premiere). **Export captions (.srt)** on the Final cut list uses timeline order and each cut's `sec`. In Premiere: **File > Import** (then choose Captions). Saving `caption` needs a one-time ComfyUI restart (Python); the UI keeps unsaved caption text until reload if the server is older. Helpers: `web/gg_caption_core.js`, `web/gg_playback_core.js`; tests `tests/js/caption_core.test.mjs`, `tests/js/playback_core.test.mjs`, `tests/test_cut_caption.py`.

## Caption toggle (0.9.0–0.9.2)
Shots **Info | Caption** toggle (legacy localStorage `story` → Caption). Caption mode highlights the active cut during timeline playback. **Send last ComfyUI output** attaches to the cut that queued the job when known. Pure helpers: `web/gg_story_core.js`, `web/gg_send_target_core.js`; tests `tests/js/story_core.test.mjs`, `tests/js/send_target_core.test.mjs`.

## Single shot tab and tab label (0.8.4)
Switching shots in the **Shots** list reuses **one** Gonggan-owned workflow tab: after a successful load the previous owned tab is closed (auto-save first; unsaved tabs that could not be saved are kept with a warning toast). The ComfyUI tab bar shows a **display-only** label `Project / Cut` for Gonggan shot tabs (`workflow.filename` and saved paths are unchanged). Pure helpers: `web/gg_tab_close_core.js`, `web/gg_tab_label_core.js`.

## Empty cuts (contest fix)
Shots with no stored/version workflow and no draft still open the **owned** shot tab (`loadWorkflowIntoDedicatedTab`): project **template** graph when linked, otherwise a **blank** UI graph (zero nodes) stamped with `ggGongganMeta`. Switching between empty and worked cuts never spawns extra workflow tabs. **New Project** / project template **(none)** is remembered in `gonggan-cut.lastTemplate` (explicit none vs never chosen). Pure: `web/gg_empty_cut_core.js`, `web/gg_template_pick_core.js`; unit `tests/js/empty_cut_core.test.mjs`; e2e `tests/e2e/empty_cut_test.mjs` (blocks `/prompt`, `/gonggan/regen`).

## Cut management (0.8.0)
Shots and Timeline add lightweight production tracking on top of the existing scene/cut model (English UI labels).

- **Drag reorder** in the Shots list with **auto cut numbers** (`001`, `002`, …) after drops.
- **Per-cut fields**: planned length (`planned_sec`), notes, **End card** flag (exempt from the short-form length rule).
- **3-second rule warning** when effective length is over 3 s (uses `planned_sec` when set, else media `sec`); End card cuts are exempt.
- **Final cut list** view: ordered picks with **total length**, copyable **file naming** display `S01_003_v02` (computed label only — pack files are never renamed).
- **Needs redo** flag per cut plus **filter** to show only flagged cuts.
- **Project due date** and **completion %** in the Shots header (`due_date` on native projects; share projects when present in timeline payload).
- Routes: `POST /gonggan/cut/update` `{pid, cut_id, fields}` · `POST /gonggan/project/update` `{pid, fields}` (Python route changes need a ComfyUI restart).

Pure helpers: `web/gg_cuts_core.js`. Headless UI checks: `tests/e2e/cut_mgmt_test.mjs`, `tests/e2e/reorder_real_test.mjs` (not run automatically).

### Missing Load Image guard (0.8.0)
When a workflow is loaded (including shot workflow load), **Load Image** / **Load Image Mask** nodes are checked against the combo file list and, if needed, `GET`/`HEAD` `/api/view?filename=…&type=input`. Missing files get a **red canvas outline** (not serialized) and toast `Missing image: <file> (node <title>)`. **Queue** is blocked with `Cannot queue: missing image …`, the node is selected, and the canvas centers on it. No auto-replace of filenames. Logic: `web/gg_loadimage_core.js`; wiring: `web/gg_loadimage.js`. E2E: `tests/e2e/loadimage_test.mjs`.

## Tests
```
python -m unittest discover -s tests -p test_*.py
node --test tests/js/cut_stage.test.mjs tests/js/progress_core.test.mjs tests/js/cuts_core.test.mjs tests/js/loadimage_core.test.mjs
```
Headless Chrome scenarios live under `tests/e2e/` (manual / CI optional).

**Edit persistence** (`tests/e2e/edit_persist_test.mjs`): WIP autosave every 2s (plus on tab hide) stamps `extra.ggWip` on `workflows/gonggan/<pid>/<cutId>.json`; opening a shot restores that file when `ggWip.baseKey` still matches the cut’s pick/version state (`web/gg_wip_core.js`). Scenarios S1 (report-only), S2–S6 (SIGKILL/graceful/switch — must persist), S7 (mock timeline version bump — must load source, not stale WIP). Unit tests: `tests/js/wip_core.test.mjs`. Requires ComfyUI on `8188`, 40+ GB free RAM; blocks `/prompt` and `/gonggan/regen`.

## Changelog

- **0.9.3** — Compact cut header + traffic-light dots; Info notes vs Caption field; SRT export; video sync/error handling; native media id guard; `caption` on `POST /gonggan/cut/update` (restart); `gg_caption_core.js`, `gg_playback_core.js`, tests `caption_core`, `playback_core`, `test_cut_caption.py`, `test_native_media_guard.py`.
- **0.9.2** — Story mode: length label beside cut name; Notes textarea full width with content/viewport auto-height and scroll; `autoHeightPx` in `gg_story_core.js`.
- **0.9.1** — Denser Shots cut info panel (collapsible header, compact summary row, smaller version strip); removed in-panel preview and scene button row; **Split scene** in cut context menu; `gg_panel_core.js`, `tests/js/panel_core.test.mjs`.
- **0.9.0** — Shots **Info | Story** list toggle (reuses cut `notes`, playback follow + highlight); send-last-output targets the cut that queued the prompt; `gg_story_core.js`, `gg_send_target_core.js`, `tests/js/story_core.test.mjs`, `tests/js/send_target_core.test.mjs`.
- **0.8.4** — One Gonggan shot workflow tab per session (close previous owned tab after cut switch); display-only `Project / Cut` tab labels; `gg_tab_close_core.js`, `gg_tab_label_core.js`, `tests/js/tab_close_core.test.mjs`, `tests/js/tab_label_core.test.mjs`, e2e `tab_label_test.mjs`.
- **0.8.3** — Timeline clip click follows selection/seek only (no workflow tab switch); **Open** marker on the Shots card whose workflow is on canvas; `gg_cut_select_core.js`, `tests/js/cut_select_core.test.mjs`.
- **0.8.0** — Cut management UI (drag reorder, auto numbers, length/notes, 3 s rule + End card, Final list + total, Needs redo filter, `S01_003_v02` naming display, due date + completion %); `POST /gonggan/cut/update`, `/gonggan/project/update`; missing Load Image scan + queue guard (`gg_loadimage_core.js`, `gg_loadimage.js`); tests `cuts_core`, `loadimage_core`, e2e `cut_mgmt_test`, `loadimage_test`.
- **0.7.0** — Per-cut work stages (Image/Video/Best pills, project summary bar), live run chip, timeline stage dots; `gg_progress_core.js`; JS tests `tests/js/progress_core.test.mjs`, `tests/js/cut_stage.test.mjs`.
- **0.6.0** — Native projects stored under `projects/` with full timeline/edit/scene/cut/template APIs; Gonggan-share list unchanged (read-only); project CRUD UI; send-last-output for native cuts; tests in `tests/test_project_routes.py`.
- **0.5.2** — Shot click loads API/stored workflows with a string filename (`loadApiJson` / `loadGraphData`); one Gonggan-owned canvas tab per session, renamed per cut (closes the previous tab). Reloads after the tab was closed; surfaces load errors in toast/console. Removed the "+ Cut" / "+ Scene" header buttons (use empty-area right-click Add Cut, and Group from the selection bar or menu).
- **0.5.1** — Shots multi-select bar: shown only for 2+ cuts (original styling); context menus opaque Comfy background at ~70% scale; empty Shots panel right-click (**Add Cut**, **New Scene** when cuts are selected); plugin UI strings in English. Fix: template dropdown now lists ComfyUI saved workflows (fetchApi path double /api and array response).
- **0.5.0** — Shots multi-select (Ctrl/Shift), context menus, soft delete + trash restore APIs; hidden cuts excluded from timeline/export.
- **0.4.1** — Template is a ComfyUI saved-workflow ref; Shots template dropdown; pack-local **+ Cut** with `local_cuts` and optional `initial.workflow.json` from template.
- **0.4.0** — Per-version workflow JSON under `workflows/`; generation-time save; PNG metadata backfill; `cut-source-workflow` resolver (stored → template → draft).
- **0.3.0** — Per-project workflow template (save canvas / load JSON, indicator dot). Empty cuts fall back to the project template on shot click (ordered resolver; cut workflow always wins when available).
- **0.2.2** — Shot click reuses one gonggan workflow tab (no tab pile-up); debounced. Closing the Shots panel also closes the Timeline panel.
- **0.2.1** — Promote save-failure rollback + warn toast; wider trim hit zones at clip edges.
- **0.2.0** — Integration: shot click → canvas, scenes/groups, Shots → Timeline tab, promote (대표), trim cursors.
