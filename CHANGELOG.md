# Changelog

## 0.9.140 (beta) - 2026-11-04

> Cut Manager is still in beta. Please report issues on GitHub.

Bug-fix release on top of 0.9.139. No changes to saved project data.

### Fixes
- Queueing a cut keeps empty text inputs as an empty string (`""`) instead of dropping them, so workflows with optional text fields queue correctly (`gg_wfconvert.py`).
- Templates that use subgraphs are flattened before queueing (`flatten_subgraphs`), so subgraph-based templates such as the app templates run as cuts.
- Queue mode **Auto** follows each cut's kind (image or video) and picks the matching workflow.
- **AI Make Cut**: the menu opens in the right position, and the generated prompt is also written into prompt nodes inside subgraphs (`write_generation_prompt`).
- Saving `project.json` retries when Windows briefly locks the file (WinError 5 / 32), instead of failing the save.

### Security
- Local-only routes now check the real peer address (`request.remote` / transport peername) for loopback instead of trusting the `Host` header, which can be spoofed (`routes.py`).

### Tests
- Updated stale Python and JS tests to current behavior; tests no longer create project folders in the repo `output/` folder (`tests/conftest.py`).
- `pyproject.toml` display name uses the proper en dash; `routes.py` imports project history at module level.

### Packaging
- `pyproject.toml` no longer starts with a UTF-8 BOM (strict TOML parsers rejected it).
- Internal agent notes and scratch scripts are no longer tracked; `.gitignore` covers outputs, logs, `.env`, temp and test artifacts.

## 0.9.139 (beta) - 2026-11-02

> Cut Manager is still in beta. Please report issues on GitHub.

A large UI polish release on top of 0.9.137. No changes to saved project data; existing projects open as before.

### Layout
- Bottom panel (timeline) has a fixed, anchored height. Floating windows such as Job History no longer push or shrink it, and the timeline's horizontal scrollbar is never clipped.
- Timeline is a little taller and the bottom-panel preview is about 40% larger.
- Edit mode shows the preview over the graph area and lets the timeline take the freed space on the left.
- Opening Cut Manager docks ComfyUI's Job History; closing Cut Manager restores your previous setting.

### Projects and settings
- Settings are split into **Global** and **This Project** tabs.
- **+ New Project** now includes Generation settings (aspect ratio, resolution, seed).
- More resolution presets (384 to 2160 px short side) plus **Custom** width/height (snapped to multiples of 8).
- New Project uses Image/Video templates with an overlay template picker.
- Folder picker: single click navigates; the default location is ComfyUI's output folder.
- Esc closes the Settings and New Project dialogs without saving.

### Cuts and timeline
- Scene label on every timeline clip, with an image/video badge and tint.
- Timeline auto-scrolls at the edges and follows the playhead.
- Edit preview swaps instantly on cut change (no stale frame) and follows the playhead for video cuts.
- Queue mode Image / Video / Auto with per-cut jobs; the selected media kind picks the matching workflow.
- One workflow tab is reused for cuts; switching cuts after a queue error works again.
- New Export tab with an output folder setting.
- Cut info panel shows thumbnails and per-version info.
- New cuts are added at the end; move up/down buttons removed.
- Thin vertical Import bar next to the thumbnails.
- Expand button on the prompt and caption fields opens a larger editor.

### AI features
- AI features are labelled **Beta** and are off by default (Use AI (Beta), AI Make Cut as a wand icon).
- Scanned AI model folders are listed, with a hint for vision-language models.

### Quality
- 1,302 JavaScript tests and 563 Python tests pass.