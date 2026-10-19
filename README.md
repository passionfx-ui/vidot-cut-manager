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

## Install (dev)
`mklink /J C:\ComfyUI_windows_portable\ComfyUI\custom_nodes\comfyui-gonggan-cut C:\dev\comfyui-gonggan-cut`
