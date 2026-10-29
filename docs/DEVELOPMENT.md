# comfyui-gonggan-cut

**Branding:** User-visible strings use neutral **Shots** / **Cut** wording. Internal ids (HTTP routes, storage keys, node extension names, workflow paths under `gonggan/`) are unchanged.

Rough-cut (가편집) editor inside ComfyUI for Shots projects (native and read-only imported).

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
In the **Shots** list: click selects one cut (preview + workflow load, debounced). **Ctrl/Cmd+click** toggles multi-select; **Shift+click** selects a range in on-screen scene order. **Right-click** a cut or scene header for actions (group, ungroup, add local cut, soft delete). **Delete** / menu **Delete** hides cuts from Shots, Timeline, and export; pack-local cuts move to `trash/<pid>/<stamp>/<cut_id>/` with `manifest.json` (legacy imported project files are never touched).

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
- **+ Cut** adds a pack-local shot (stored in `edits/edit_<pid>.json` as `local_cuts`, never in legacy imported project data). If the project has a template, the graph is copied to `workflows/<pid>/<cut_id>/initial.workflow.json` for that cut.

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
  (Qwen-Image 2.1 + turbo LoRA, 4 steps, ~0.25 MP, same graph as the legacy draft pipeline) and validates it against `/object_info`.
  Queues only with `{"dry_run": false, "confirm": true, "seed": <seed from the dry run>}`; the UI asks first.
- `POST /gonggan/send-output {pid, cut_id}` - copies ComfyUI's last output (in-memory `/history`, else newest file in `output/`) into the cut.
- New takes are stored in the pack's `versions/<pid>/<cut_id>/` (gitignored), never in legacy imported project data, and become the cut's pick in `edits/edit_<pid>.json`.

## Native projects (0.6.0)
Native projects live entirely in the pack folder (no legacy `_workspace.json` writes). Read-only imported projects stay **read-only** in the project list.

- **Shots** header: native projects appear first with a `[Native]` prefix; Imported entries show `(read-only)`.
- Right-click the project row (selector area): **New Project…**, **References…**, **Project Settings…**, **Rename Project…**, **Delete Project** (rename/delete only for native projects).
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
- `POST /gonggan/folder/check` `{path}` — Output folder check (empty, existing writable folder, or creatable under a writable parent; creates nothing); 400 `{ok:false, message}` otherwise
- `POST /gonggan/project/delete` `{pid}` · `POST /gonggan/project/restore` `{pid}`
- `GET /gonggan/projects` — share projects plus native (`native: true|false`)

## Work stages & progress (0.7.0)
Each shot shows **Image / Video / Best** stage pills (from `versions_list` kinds and `pick`). The Shots header shows `Image a/N · Video b/N · Best c/N` (plus `· Empty k` when any cut has no versions), a single stacked bar (Best → Video → Image → empty track), and scene headers show **n/m** (Best picks in scene / cuts in scene). Trashed cuts (`deleted_at`) are excluded from N. **Timeline** clips show a small stage dot (gray / blue / purple / green).

**Render status badge** (0.9.72, `gg_render_status_core.js`): cut card header and timeline clip show **Queued** while the cut's prompt waits in the ComfyUI queue and **Rendering NN%** (spinner; percent from `progress`) while it executes; cleared on `execution_success` / `execution_error` / `execution_interrupted`, on `status` with `queue_remaining: 0`, or when the prompt is gone from **GET** `/queue`. A prompt is linked to a cut when queued (`api.queuePrompt` reply `prompt_id`; cut from the queued workflow's `extra.gonggan` stamp, else the cut open in the active shot tab; native Regen goes through the same path) and from `localStorage` key `gonggan.jobs` (max 200). Prompts not tied to a cut of the shown project show a header indicator **Queued** / **Rendering…** (read-only). Progress events only touch badge DOM. The older live chip under the thumbnail now only shows red **Failed**; when a linked run ends the UI reloads timeline data (throttled **GET** `/gonggan/timeline`).

Events (read-only sync): Comfy `api` WebSocket types `status`, `promptQueued`, `execution_start`, `execution_cached`, `executing`, `progress`, `progress_state`, `executed`, `execution_success`, `execution_error`, `execution_interrupted`; plus **GET** `/queue` (on panel open and debounced on `status`) and **GET** `/history?max_items=30` on open. Never writes to `/queue` or `/history`.

Pure stage helpers and the live tracker live in `web/gg_progress_core.js` (`cutStage`, `projectSummary`, `formatSummary`, `createProgressTracker`).

**Runner event contract** (for a future Comfy Cloud runner): `{ promptId, cutId, projectId, state, percent, node, queuePos, error, ts }` with `state` in `queued|running|done|failed|interrupted`. Emit the same objects into `createProgressTracker().emit(evt)`.

### JS tests (no npm)
```
node --test tests/js/progress_core.test.mjs tests/js/progress_summary.test.mjs tests/js/cut_stage.test.mjs tests/js/cuts_core.test.mjs tests/js/loadimage_core.test.mjs
```
Also run `node --check web/gonggan.js` and `node --check web/gg_progress_core.js` after UI edits.

## Auto-save on cut switch (0.8.1)
Switching to another shot while the Shots workflow tab has unsaved edits **auto-saves** via ComfyUI’s workflow store (same as Ctrl+S) instead of a blocking confirm. If save fails, the switch is cancelled and the tab is left unchanged. Logic: `web/gg_autosave_core.js`.

While the Shots workflow tab is active and modified, the same save path runs at most every **2 s** (1 s poll), on **tab hide** (`visibilitychange` / `pagehide`), and still on **cut switch**. Each save stamps `extra.ggWip` (`web/gg_wip_core.js`) so reload can restore the working copy only when pick/version state matches. Opening a shot tries `workflows/gonggan/<projectId>/<cutId>.json` before embedded PNG workflow (picked image `workflow` chunk via `web/gg_wf_source_core.js`, only when the effective kind is image) and **GET** `/gonggan/cut-source-workflow` (native: version workflow by REP/switch kind, with `fallback` in the toast when a substitute source was used). Changing **Rep** on the cut whose workflow is open reloads the owned tab after autosave (`web/gg_rep_wf_core.js`; tests `tests/js/rep_wf_core.test.mjs`, `tests/test_cut_source_workflow.py`). E2E `tests/e2e/rep_workflow_test.mjs` is optional (needs ComfyUI restart for the new query param).

**Edited marker (`*`):** When widget values differ from the baseline captured at load, `localStorage` key `gg.edited` stores `{cutId: cutBaseKey}` (`web/gg_wf_source_core.js`). The star appears on the cut card title, timeline clip label, Info panel header, and shot tab label; it clears automatically when `cutBaseKey` changes (new pick/version). Unit tests: `tests/js/wf_source_core.test.mjs`. E2E: `tests/e2e/wf_marker_test.mjs` (blocks `/prompt` and `/gonggan/regen`).

## Shot workflow paths (0.8.2+)
Each shot’s ComfyUI tab copy is saved at a **stable id-based path**: `workflows/gonggan/<projectId>/<cutId>.json` (one working file per cut; reload/rename does not create `cut6 (2).json` suffixes). The tab bar still shows the display-only **Project / Cut** label from project/cut metadata, not the filename. Legacy name-based helpers remain in `web/gg_shot_names.js` for tests. E2E guard: `tests/e2e/tabfile_dedupe_test.mjs`.

## Timeline selection without tab switch (0.8.3)
Clicking a **Timeline** clip updates the selected cut and preview seek only; it does **not** load or switch the Shots workflow tab. **Shots** list clicks still open the cut workflow as before. When the canvas tab is a different cut than the selection, the Shots list shows a small **Open** marker on the open cut (`web/gg_cut_select_core.js`).

## Timeline panel toggle
**Shots** header **Timeline** button (and **T** / **Alt+T** when Shots or the Timeline panel is active) shows on/off state (`aria-pressed`, tooltip `Timeline: on (T)` / `Timeline: off (T)`). Off fully collapses the ComfyUI bottom panel via `Workspace.ToggleBottomPanelTab.gg-timeline`; on restores the previous height (`gg.timelineHeight`, min 220px, capped at ~70% viewport). Preference `gg.timelineOpen` (`1`/`0`, default on). Auto-open on Shots show or cut select respects off. Helpers: `web/gg_timeline_toggle_core.js`; unit tests `tests/js/timeline_toggle_core.test.mjs`; E2E `tests/e2e/timeline_toggle_test.mjs` (blocks `/prompt` and `/gonggan/regen`).

## Info panel tidy (0.9.1)
The selected-cut panel at the bottom of **Shots** is denser: one-line header (collapse, title, length, flags, Regen/Send), inline Length/End card/Needs redo, compact version strip, and project summary on one row (completion % + due date; stage bar only). Large in-panel preview and scene action buttons removed (**Split scene** moved to the cut context menu). Collapse state persists in `gg.panelOpen`. Pure helper: `web/gg_panel_core.js`; tests `tests/js/panel_core.test.mjs`.

## Cut header & captions (0.9.3)
Each cut row shows a single compact header (number, name, picked version summary, base vs trimmed length, Image/Video/Best dots). One **Caption** field per cut (`caption`; legacy `notes` still stored and shown via `effectiveCaption()` until you edit caption). **Info** mode shows a one-line caption summary on each card; **Caption** mode expands the field and follows timeline playback. The cut panel no longer has a separate Notes box. Placeholder is `Caption` (project setting `caption_lang` no longer changes it). **Export captions (.srt)** uses the stored `caption` field only (empty caption + legacy notes does not export). In Premiere: **File > Import** (then choose Captions). Saving `caption` needs a one-time ComfyUI restart (Python); `caption_lang` in project settings also needs a server restart. Helpers: `web/gg_caption_core.js` (`effectiveCaption`, `buildSrt`), `web/gg_playback_core.js`; tests `tests/js/caption_core.test.mjs`, `tests/js/playback_core.test.mjs`, `tests/test_cut_caption.py`.

## Caption toggle (0.9.0–0.9.2)
Shots **Info | Caption** toggle (legacy localStorage `story` → Caption). Caption mode highlights the active cut during timeline playback. **Send last ComfyUI output** attaches to the cut that queued the job when known. Pure helpers: `web/gg_story_core.js`, `web/gg_send_target_core.js`; tests `tests/js/story_core.test.mjs`, `tests/js/send_target_core.test.mjs`.

## Single shot tab and tab label (0.8.4)
Switching shots in the **Shots** list reuses **one** pack-owned Shots workflow tab: after a successful load the previous owned tab is closed (auto-save first; unsaved tabs that could not be saved are kept with a warning toast). The ComfyUI tab bar shows a **display-only** label `Project / Cut` for Shots workflow tabs (`workflow.filename` and saved paths are unchanged). Pure helpers: `web/gg_tab_close_core.js`, `web/gg_tab_label_core.js`.

## Empty cuts (contest fix)
Shots with no stored/version workflow and no draft still open the **owned** shot tab (`loadWorkflowIntoDedicatedTab`): project **template** graph when linked, otherwise a **blank** UI graph (zero nodes) stamped with `ggGongganMeta`. Switching between empty and worked cuts never spawns extra workflow tabs. **New Project** / project template **(none)** is remembered in `gonggan-cut.lastTemplate` (explicit none vs never chosen). Pure: `web/gg_empty_cut_core.js`, `web/gg_template_pick_core.js`; unit `tests/js/empty_cut_core.test.mjs`; e2e `tests/e2e/empty_cut_test.mjs` (blocks `/prompt`, `/gonggan/regen`).

## Project setup (native)
**New Project** collects name, aspect/resolution preset, FPS (24/25/30), default cut length (seconds), **Caption language** (placeholder label only), default template and an optional folder. **Project Settings…** (⚙ gear next to **Project:**, or the project right-click menu) has only **Output folder** (`settings.project_folder`, checked on Save via `POST /gonggan/folder/check`; empty = default plugin storage) and **Default template** (with **Use last**); the other values are kept as stored. Values live in the native project document as `settings: { aspect, width, height, fps, cut_seconds, caption_lang }` (legacy `default_sec` is upgraded on read). `POST /gonggan/project/create` accepts optional `settings`; `POST /gonggan/project/update` accepts `settings` or individual keys. New cuts use `cut_seconds` for their initial `sec`; existing cuts are unchanged. Timeline exposes `project.settings` for the UI. Regen/export size wiring for native projects is not hooked up yet (settings are stored for later). Pure: `web/gg_project_settings_core.js`, `gg_project/project_settings.py`; unit `tests/js/project_settings_core.test.mjs`, `tests/test_project_settings.py`; e2e `tests/e2e/project_setup_test.mjs`. Shots redo filter label: **Show redo cuts only**.

## Cut management (0.8.0)
Shots and Timeline add lightweight production tracking on top of the existing scene/cut model (English UI labels).

- **Drag reorder** in the Shots list with **per-scene cut labels** (`1-1`, `1-2`, `2-1`, …) recomputed from timeline order and scene blocks (explicit groups plus consecutive ungrouped runs).
- **Per-cut fields**: planned length (`planned_sec`), notes, **End card** flag (exempt from the short-form length rule).
- **3-second rule warning** when effective length is over 3 s (uses `planned_sec` when set, else media `sec`); End card cuts are exempt.
- **Final cut list** view: ordered picks with **total length**, copyable **file naming** display `S01_003_v02` (computed label only — pack files are never renamed).
- **Needs redo** flag per cut plus **filter** (**Show redo cuts only**) to show only flagged cuts.
- **Completion %** in the Shots header. The **Due date** field is hidden since 0.9.49 (`due_date` is still stored on native projects and left untouched).
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

- **0.9.94** — Project Settings: **Browse…** next to Output folder opens an in-app **Choose Folder** picker (drives on Windows, folders only; click highlights, double-click opens, **Up** one level, **Select** fills the path with the highlighted or open folder, **Cancel** closes; opens at the typed path or its nearest existing parent; permission / not-found errors show inline). New `GET /gonggan/folder/list?path=` (empty = drives, `parent` `""` at a drive root; folder names only, hidden folders skipped; relative path 400, permission 403, missing 404) in `gg_project/folder_list.py`. **Default template** is now one combobox (`.gg-tpl-combo`): typing filters live, arrows + Enter or click pick (links right away as before), Escape / blur closes and restores the saved ref; the separate filter input is gone (New Project modal unchanged). Logic `web/gg_folder_pick_core.js`, `web/gg_combo_core.js`, `templateComboItems`; unit `test_folder_list.py`, `folder_pick_core.test.mjs`, `template_combo_core.test.mjs`. New route — needs a ComfyUI restart (until then Browse… says so).
- **0.9.93** — The Shots toolbar **Cuts | Final cut list** toggle is hidden by `SHOW_FINAL_LIST = false` in `web/gonggan.js` (code kept; set `true` to restore). While hidden the view is forced to the scene list (`shotsViewOf` in `web/gg_cuts_core.js`, also used for keyboard navigation order), so **Export captions (.srt)**, which lives in the Final cut list, is not reachable from the UI. Unit `cuts_core.test.mjs`; e2e `cut_mgmt_test.mjs` 08 SKIPs when hidden (checks the toggle and final list are absent and the scene list shows). JS only.
- **0.9.92** — mp4 **export burns each clip's caption** into the video with the playback overlay look (white text, `black@0.65` box, centered at the bottom, size ~1/22 of the output height): drawn on the clip's own segment, so it spans exactly the clip's placed time (`start`..`start+sec`, trims included), nothing in gaps, blank captions skipped. Text is normalized like the overlay, word-wrapped (Korean counted wide, max ~45% of the height, ellipsis), written to a UTF-8 `cap_NNN.txt` and read by `drawtext` with `textfile` + `expansion=none` (ffmpeg runs in the job folder, so the text and its path need no escaping); font `malgun.ttf` on Windows (other Korean fonts on macOS/Linux, else fontconfig `Sans`). Logic `caption_text` / `wrap_caption` / `caption_filter` in `gg_export.py`; unit `test_export_captions.py` (includes a tiny real ffmpeg encode when ffmpeg is present). Python only — needs a ComfyUI restart.
- **0.9.91** — Timeline viewer overlays the current clip's **caption** centered at the bottom of the frame (white text on a dark translucent box, `.gg-v-cap`) during that clip's time span: nothing in gaps, the span is the clip's trimmed length, blank captions show nothing, hidden while previewing an export; updates live while typing a caption. Uses the stored `caption` (same text as SRT export, not legacy `notes`). Logic `captionAtTime` in `web/gg_caption_core.js` (same clip lookup as playback, `clipAtTime`); unit `caption_core.test.mjs`, e2e `caption_overlay_test.mjs` (ruler seeks; needs 40+ GB free RAM). JS/CSS only.
- **0.9.90** — Cuts in no scene are always one **Ungrouped** group at the very bottom of the Shots list (Info and Caption views): neutral dim header `Ungrouped <count>` with no fold / rename / delete / scene drag / scene menu, not counted as a scene. Cut labels follow the list (`computeCutLabels`: scenes numbered by first cut, all ungrouped cuts one last block), so imported projects whose loose cuts sit between scenes no longer number them mid-list. Native drag/move: the optimistic cut list order is laid out like the store (`listOrder`: scenes in groups order, then ungrouped) and a cut dragged down lands at the drop line, not one row past it (`dropRestIndex`); cuts drag into / out of Ungrouped like any scene, with Shots undo/redo; the timeline track is never touched. Move to scene submenu entry `No scene` is now `Ungrouped`. `shotsSections` moved to `web/gg_group_list_core.js`. Unit `group_list_core`, `cuts_core`, `reorder_core`, `tab_label_core` tests, `test_timeline_independent.py`. JS/CSS only.
- **0.9.89** — Shots **Caption** view rows show the cut thumbnail beside the caption field, using the same `.gg-cut-thumb-col` / `.gg-cut-thumb` element and CSS as the Info card (96×54, video/source badges, hover play, Open marker); rows align to the top. One `cutThumbHtml` in `web/gonggan.js` feeds both views; `captionRowContentHtml({ thumb })` in `web/gg_group_list_core.js`. Unit `group_list_core.test.mjs`. JS/CSS only.
- **0.9.88** — The lower-left cut panel slot is back as a read-only **status panel** (`SHOW_STATUS_PANEL = true`, `SHOW_CUT_PANEL` stays `false` so the old actions are kept in code but not rendered): big `<cutLabel> <CutName>`, a Queued / Rendering NN% / Failed / Done chip (from `gg_render_status_core.js`), muted `Length` (original) and `Best`/`Latest vNN`; `No cut selected` / `N cuts selected`. Bottom stack: selection bar, status panel, Timeline bar. Logic `web/gg_status_panel_core.js`; unit `status_panel_core.test.mjs`; e2e `screen_test.mjs` 05 (stacking) and 13 (status panel); screen 11/12, cut_mgmt 04/05 and `version_click_test.mjs` still SKIP (they need the old actions). JS/CSS only.
- **0.9.87** — Shots layout: a large top **Render** button (`.gg-render-btn`, same batch as before: confirm `Queue N cuts?`, native Regen path, display order, empty cuts skipped; disabled with 0 selected) sits where the Timeline button was, next to the bigger Queued/Rendering indicator and a `N / M done` counter for the last Render batch (`batchView` / `batchProgressView`, hidden with no batch); the Timeline toggle is a full-width bar at the very bottom (same state/T key); the selection bar keeps larger Group/Ungroup, no Render. Cut menu **Remove from queue** (still-queued prompts, `POST /queue {delete:[ids]}`, badge cleared) and **Re-queue** (cuts whose last prompt errored/was interrupted, shown as a **Failed** badge; queued again as a Render batch). Logic in `web/gg_render_status_core.js` / `gg_batch_render_core.js` (`queueDeleteBody`) / `gg_ctx_menu_core.js`; unit tests for each; e2e `batch_render_test.mjs`, `render_status_test.mjs` (intercept `/prompt` and `/queue`), `screen_test.mjs` 05, `timeline_toggle_test.mjs`. JS/CSS only.
- **0.9.86** — Shots **Info** and **Caption** views share one scene-group renderer (`groupedListHtml` / `cutRowShellHtml` in `web/gg_group_list_core.js`): scene headers, collapse, group/ungroup, scene and cut drag, selection, menus and undo are identical; only the row content differs (Info = the unchanged info card, Caption = just the editable caption field, saved via `POST /gonggan/cut/update`). Unit `group_list_core.test.mjs`; e2e `cut_mgmt_test.mjs` 06/10, `field_slots_test.mjs`, `project_switch_race_test.mjs`, `scene_reorder_test.mjs` cover both views. JS/CSS only.
- **0.9.85** — **Show redo cuts only** is hidden from the Shots toolbar by `SHOW_REDO_FILTER = false` in `web/gonggan.js` (code kept; set `true` to restore). While hidden the filter is forced off (`redoFilterOn` in `web/gg_cuts_core.js`), so no cut stays filtered; the Needs redo flag/badge is unchanged. Scene drag fix: dropping a scene after the last scene now lands after it even when ungrouped cuts sit earlier in the order (was put before the first ungrouped cut, so the scene could jump to the top); `sceneDropBeforeCut` in `web/gg_reorder_core.js`. Unit `cuts_core.test.mjs`, `reorder_core.test.mjs`; e2e `cut_mgmt_test.mjs` 07 and the `project_setup_test.mjs` redo label check SKIP when the option is hidden (07 still checks the badge and that all cuts stay listed); `scene_reorder_test.mjs` adds s9 (Caption list mode: drop line, whole-scene move, Ctrl+Z / Ctrl+Y) and checks that cut ids, media, versions and source workflow are unchanged after a move. JS/CSS only.
- **0.9.84** — Fix: reordering cuts in Shots still moved timeline clips on native projects whose timeline was never edited (no `project["timeline"]`, so `track_order()` fell back to the cut list order). Every cut list order change (`reorder`, `add_cut` insert, `add_scene`, `ungroup_scene`, `sync_scene_groups`, `restore_cuts`) now calls `LocalStore._keep_track_order`: if there is no stored timeline and the cut list order changed, it stores `{order: <track order before the change>, clips: {}}` so the timeline keeps its order; new/restored cuts go to the timeline end. Appending a cut at the list end leaves the timeline derived. Frontend audit: Shots reorder only touches `tl.cuts` (clips follow `track_order`), a timeline clip drag only saves via `/gonggan/edit`; only Reset and Apply order to cuts sync the two. Unit `test_timeline_independent.py` (never-edited reorder / scene reorder / insert / `apply_timeline_edit`). Python only, restart ComfyUI.
- **0.9.83** — Fix: Shots scene (and cut) drag stopped saving after 0.9.78 (`c809fb1`): `persistShotsReorder` flushed a waiting timeline save with `saveEdit()` = `editGate.run()` from inside its own gate job, so a drop within 400 ms of a timeline edit hung the gate and every later reorder/undo/timeline save until reload; now `editGate.runAfterPending` writes the waiting save inside the same job (`web/gg_edit_save_core.js`), Shots undo/redo unchanged. Faint 1px divider between cut rows in a scene (`.gg-cut + .gg-cut` top border). Unit `edit_save_core.test.mjs`, `undo_core.test.mjs` (scene move Ctrl+Z/Ctrl+Y); e2e `scene_reorder_test.mjs` s8 (scene drag right after a timeline clip move) and header drag points must hit the header (no silent skip). JS/CSS only.
- **0.9.82** — **Project Settings** modal has exactly two settings: **Output folder** (the existing `settings.project_folder`, editable path; hint says empty = default, the plugin's own `projects` folder) and **Default template** (selector + **Use last**, still applied on change). Aspect/resolution, FPS, default cut length, caption language and Name are gone from this modal; Save sends only `{project_folder}` so the other stored settings stay untouched (unchanged folder = just close). On Save a non-empty folder is checked by the new `POST /gonggan/folder/check` (`check_output_folder` in `gg_project/project_settings.py`: full path, Windows name rules, existing writable folder or creatable under the nearest existing writable parent; nothing is created); errors show inline under the field and keep the modal open (route missing before restart = "Restart ComfyUI to enable the folder check"). Nothing is written to the folder yet (organizing is planned). **Rename Project…** is back in the project right-click menu (native only; in-app prompt + `POST /gonggan/project/rename`). New Project dialog unchanged. Pure `projectSettingsModalPatch`, `folderCheckErrorText` in `web/gg_project_settings_core.js`; unit `tests/js/project_folder_setting.test.mjs`, `tests/test_project_folder.py`; e2e `project_setup_test.mjs`, `references_test.mjs`, `screen_test.mjs` 08. Python change (new route): restart ComfyUI.
- **0.9.81** — Shots **Info** cut card no longer shows a Caption box (information only: header, status line, thumbnail unchanged); captions are edited in **Caption** mode only. Cut card header is now big `<cutLabel> <CutName>` (e.g. `1-4 New cut`; `cutHeaderParts` returns `{cutLabel, name}`): the scene name and the separate small cut name are gone from the card (also from its tooltip), so the scene name shows once per group, on the Shots scene group header. The workflow tab label (`1-4 Scene1 / Project`) is unchanged. Stored `caption` data, SRT export and the timeline clip tooltip are unchanged. **Shots undo fixes:** Ctrl+Z right after a context-menu action works even though the menu (on `document.body`) left Shots neither hovered nor focused: the key scope falls back to the **last clicked panel** (Shots / Timeline; our menus, dialogs and toasts keep the panel that opened them), after hover and before focus; a click on the ComfyUI canvas (or any other ComfyUI area) hands Ctrl+Z back to ComfyUI. Text inputs, menus and dialogs are still never intercepted. Every Shots cut-list mutation is now in the Shots history: remove from / move to scene, group / ungroup / split / delete scene, new scene, **rename scene** (new), reorder (cuts and scenes), Apply order to cuts (layout snapshot, restored via `/gonggan/groups` + `/gonggan/cut/reorder`; a scene's collapsed state is kept), **rename cut** (undo/redo via `/gonggan/cut/rename`), **delete cut** (undo = `/gonggan/cut/restore` then the old layout, redo = soft delete again; the toast Undo goes through the same history step), **add cut** and **Trash restore** (undo = soft delete, redo = restore in place). The Timeline clip menu's Delete / Apply order point the fallback at Shots. Pure logic `nextUndoArea`, `shotsUndoSteps`, `shotsCounterpart` in `web/gg_undo_core.js`; e2e `undo_redo_test.mjs` covers Remove from Scene / Delete / Add Cut via the context menu. JS/CSS only.
- **0.9.80** — Caption field placeholder is now just `Caption` (was `Notes / dialogue (<Language>)`); `captionFieldPlaceholder` in `web/gg_caption_core.js`. JS only.
- **0.9.79** — **Ctrl+Z** undo, **Ctrl+Shift+Z** / **Ctrl+Y** redo (Cmd on Mac), scoped like Shots Ctrl+A: only while the pointer is over (or focus is inside) Shots or the Timeline panel; pointer wins over focus (the Timeline root keeps focus after a click). Never taken from the ComfyUI canvas, text inputs / textareas / contenteditable, menus or dialogs, so ComfyUI's own graph undo works there. **Shots** history (native projects) = cut list order + scenes before each reorder (menu, Alt+arrows, drag, scene drag, Move to scene), scene group / ungroup / delete scene and **Apply order to cuts**; restored through the existing reorder save path (`/gonggan/groups` then `/gonggan/cut/reorder`); the reorder toast **Undo** still works and is itself undoable. **Timeline** history = clip order + per-clip in/sec(/start) before each trim, move/gap, clip reorder and **Reset**; restored locally and saved via `POST /gonggan/edit`. 50 steps per scope, one project at a time (cleared on project switch), a new edit clears redo; cuts deleted/added since a snapshot are dropped/kept. Timeline panel: on the first show with no saved `gg.timelineHeight`, it opens at half of ComfyUI's default bottom panel height (still min 220px) and saves that; a saved height is used as before. JS only. Pure: `web/gg_undo_core.js` (`tests/js/undo_core.test.mjs`), `firstShowTimelineHeight` / `bottomPanelPercent` in `web/gg_timeline_toggle_core.js`; e2e `tests/e2e/undo_redo_test.mjs` (fresh profile; blocks `/prompt` and `/gonggan/regen`).
- **0.9.78** — Timeline and Shots cut list are independent (native projects). The track lives in `project.json` as `timeline: {order, clips: {cid: {in, sec, start?}}}` (`gg_project/timeline.py` `track_order` / `place_clips`); `/gonggan/timeline` keeps `cuts` in cut list order and adds `track_order` + per-cut `start`. `POST /gonggan/edit` writes only that track (pick still goes to the cut); it never changes scene `cut_order` / `loose_order`, cut numbers or the cut's own `sec`/`in`. Shots reorder now saves via new `POST /gonggan/cut/reorder`. No stored track = derived from the cut list (cut `sec`/`in`, packed), so old projects look the same; new and restored cuts go to the timeline end, deleted cuts drop out. Free placement: drag a clip to any time (gap stays behind), snapping to clip edges / playhead; dropped over another clip it goes before/after it and later clips are pushed; never overlapping (`web/gg_tl_place_core.js`). Trim changes only that clip (left edge keeps the end and stops at the previous clip; a longer right edge pushes later clips only when they would overlap). Gaps play black and count in the total; `gg_export.export_plan` renders gaps as black segments (native export itself is still off). Timeline **Reset** now works for native projects: track rebuilt from the cut list (order, in 0, original length as the cut card shows, no gaps; old track kept as a `timeline_backup` line in `journal.ndjson`). Timeline clip menu **Apply order to cuts** (confirm `Cut numbers will be renumbered. Continue?`, `POST /gonggan/timeline/apply_order`): each scene's cuts sorted by timeline position, scenes ordered by their earliest clip, ungrouped cuts (always after the scenes) sorted the same way; ids/files unchanged. Imported projects unchanged (packed slot reorder).
- **0.9.77** — Shots cut card: big `<cutLabel> <Scene>` header (`cutHeaderParts`, same `Scene` rule as the tab label) with the cut name small beside it, plus a fixed-column status line (render state `Queued #N` / `Rendering NN%` / `Done` / `Idle` · `Best|Latest vN` · kind/size · right-aligned original duration; trim length only on timeline clips); card size and thumbnail unchanged (0.9.76 skipped).
- **0.9.75** — Workflow tab label is now `<cutLabel> <Scene> / <Project>` (e.g. `1-4 Scene1 / 놀이터에서`; the word `Scene` when the cut has no scene name), dirty ` *` at the end, project shortened first; tooltip and id-based filenames unchanged (`formatShotTabLabel` in `web/gg_tab_label_core.js`).
- **0.9.74** — New cuts (first cut of a new project, Add Cut, local add) are named **New cut** instead of `cutN` (`NEW_CUT_NAME` in `gg_project/local_store.py`, `gg_data.add_local_cut`); existing cut names are unchanged; on-screen numbers come from position. Python change: needs a ComfyUI restart.
- **0.9.73** — Selection bar moved to a footer pinned at the bottom of **Shots** (always shown: `N selected` · Group · Ungroup · × · **Render**; dim/disabled with nothing selected, so the list never shifts). The lower-left cut panel is hidden by `SHOW_CUT_PANEL = false` in `web/gonggan.js` (still rendered; set `true` to restore). **Render** (and **Render selected** in the cut card menu, native projects) queues each selected cut's current workflow in Shots display order through the native Regen path, one confirm `Queue N cuts?`, known-empty cuts skipped, toast `Queued N cuts (M skipped: no workflow)`; each prompt is registered for the Queued/Rendering badges. **Ctrl/Cmd+A** selects all listed cuts while Shots has key scope (hover/focus; not in inputs, menus, modals). Pure logic `web/gg_batch_render_core.js` (+ `selectAllCutIds`, `select-all` in `gg_cut_select_core.js`); e2e `tests/e2e/batch_render_test.mjs`.
- **0.9.63** — Best (pick) is manual only: `add_version` (native store and legacy `gg_data`) no longer sets the pick (references still take the newest); with no pick the newest version is current (timeline media, workflow source). Best dot/Done/`Best c/N` need a manual pick; cut panel marks the implicit newest with a dashed outline (`gg-implicit`, no Rep badge, **Set rep** enabled). Existing picks are not migrated. Python part needs a ComfyUI restart.
- **0.9.3** — Compact cut header + traffic-light dots; Info notes vs Caption field; SRT export; video sync/error handling; native media id guard; `caption` on `POST /gonggan/cut/update` (restart); `gg_caption_core.js`, `gg_playback_core.js`, tests `caption_core`, `playback_core`, `test_cut_caption.py`, `test_native_media_guard.py`.
- **0.9.2** — Story mode: length label beside cut name; Notes textarea full width with content/viewport auto-height and scroll; `autoHeightPx` in `gg_story_core.js`.
- **0.9.1** — Denser Shots cut info panel (collapsible header, compact summary row, smaller version strip); removed in-panel preview and scene button row; **Split scene** in cut context menu; `gg_panel_core.js`, `tests/js/panel_core.test.mjs`.
- **0.9.0** — Shots **Info | Story** list toggle (reuses cut `notes`, playback follow + highlight); send-last-output targets the cut that queued the prompt; `gg_story_core.js`, `gg_send_target_core.js`, `tests/js/story_core.test.mjs`, `tests/js/send_target_core.test.mjs`.
- **0.8.4** — One Shots workflow tab per session (close previous owned tab after cut switch); display-only `Project / Cut` tab labels; `gg_tab_close_core.js`, `gg_tab_label_core.js`, `tests/js/tab_close_core.test.mjs`, `tests/js/tab_label_core.test.mjs`, e2e `tab_label_test.mjs`.
- **0.8.3** — Timeline clip click follows selection/seek only (no workflow tab switch); **Open** marker on the Shots card whose workflow is on canvas; `gg_cut_select_core.js`, `tests/js/cut_select_core.test.mjs`.
- **0.8.0** — Cut management UI (drag reorder, auto numbers, length/notes, 3 s rule + End card, Final list + total, Needs redo filter, `S01_003_v02` naming display, due date + completion %); `POST /gonggan/cut/update`, `/gonggan/project/update`; missing Load Image scan + queue guard (`gg_loadimage_core.js`, `gg_loadimage.js`); tests `cuts_core`, `loadimage_core`, e2e `cut_mgmt_test`, `loadimage_test`.
- **0.7.0** — Per-cut work stages (Image/Video/Best pills, project summary bar), live run chip, timeline stage dots; `gg_progress_core.js`; JS tests `tests/js/progress_core.test.mjs`, `tests/js/cut_stage.test.mjs`.
- **0.6.0** — Native projects stored under `projects/` with full timeline/edit/scene/cut/template APIs; Read-only imported list unchanged; project CRUD UI; send-last-output for native cuts; tests in `tests/test_project_routes.py`.
- **0.5.2** — Shot click loads API/stored workflows with a string filename (`loadApiJson` / `loadGraphData`); one pack-owned Shots canvas tab per session, renamed per cut (closes the previous tab). Reloads after the tab was closed; surfaces load errors in toast/console. Removed the "+ Cut" / "+ Scene" header buttons (use empty-area right-click Add Cut, and Group from the selection bar or menu).
- **0.5.1** — Shots multi-select bar: shown only for 2+ cuts (original styling); context menus opaque Comfy background at ~70% scale; empty Shots panel right-click (**Add Cut**, **New Scene** when cuts are selected); plugin UI strings in English. Fix: template dropdown now lists ComfyUI saved workflows (fetchApi path double /api and array response).
- **0.5.0** — Shots multi-select (Ctrl/Shift), context menus, soft delete + trash restore APIs; hidden cuts excluded from timeline/export.
- **0.4.1** — Template is a ComfyUI saved-workflow ref; Shots template dropdown; pack-local **+ Cut** with `local_cuts` and optional `initial.workflow.json` from template.
- **0.4.0** — Per-version workflow JSON under `workflows/`; generation-time save; PNG metadata backfill; `cut-source-workflow` resolver (stored → template → draft).
- **0.3.0** — Per-project workflow template (save canvas / load JSON, indicator dot). Empty cuts fall back to the project template on shot click (ordered resolver; cut workflow always wins when available).
- **0.2.2** — Shot click reuses one Shots workflow tab (no tab pile-up); debounced. Closing the Shots panel also closes the Timeline panel.
- **0.2.1** — Promote save-failure rollback + warn toast; wider trim hit zones at clip edges.
- **0.2.0** — Integration: shot click → canvas, scenes/groups, Shots → Timeline tab, promote (대표), trim cursors.
