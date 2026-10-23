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

## Project workflow template (0.3.0)
Each project can store one ComfyUI workflow under the pack folder `templates/<project_id>.json` (gitignored in normal use).

- In the **Shots** header: **Save canvas as template** writes `app.graph.serialize()` for the selected project; **Load template file** imports a `.json` (UI graph or API-format workflow).
- A small dot next to the project picker lights up when a template exists.

## Per-version workflow store (0.4.0)
Each pack version under `versions/<pid>/<cut_id>/` can have a sidecar workflow file at `workflows/<pid>/<cut_id>/<vid>.workflow.json` (gitignored). It stores the UI graph and/or API prompt used for that take (`source`: `generated` or `png-backfill`). New SDK/send-output versions save automatically; existing PNGs can be backfilled without modifying the PNG bytes.

CLI (no server): `python -m gg_wfstore backfill [--dry-run] [--pid <project id>]` or `python tools/backfill_workflows.py …`

Shot click workflow load order: **stored version** → **project template** → **draft** (`/gonggan/workflow`). Toast shows which source was used. If the server has not been restarted yet (new routes 404), the UI falls back to the pre-0.4.0 draft→template chain.

Routes:
- `GET /gonggan/template?pid=<project id>` → `{ok, exists, workflow}`
- `POST /gonggan/template` `{pid, workflow}` → `{ok, path}`
- `GET /gonggan/version-workflow?pid=&cut=&vid=` → stored record for one version
- `GET /gonggan/cut-source-workflow?pid=&cut=` → `{ok, source, workflow, kind}` (`stored`|`template`|`draft`|null)
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

## Changelog

- **0.4.0** — Per-version workflow JSON under `workflows/`; generation-time save; PNG metadata backfill; `cut-source-workflow` resolver (stored → template → draft).
- **0.3.0** — Per-project workflow template (save canvas / load JSON, indicator dot). Empty cuts fall back to the project template on shot click (ordered resolver; cut workflow always wins when available).
- **0.2.2** — Shot click reuses one gonggan workflow tab (no tab pile-up); debounced. Closing the Shots panel also closes the Timeline panel.
- **0.2.1** — Promote save-failure rollback + warn toast; wider trim hit zones at clip edges.
- **0.2.0** — Integration: shot click → canvas, scenes/groups, Shots → Timeline tab, promote (대표), trim cursors.
