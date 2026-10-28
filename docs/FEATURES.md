# Feature confirmation sheet (comfyui-gonggan-cut)

Product: ComfyUI plugin — sidebar **Shots** + bottom **Timeline**. Premiere/CapCut-style **project → scene → cut** organization with **versions**, **Best/Rep** pick, **captions**, **Send last output**, **SRT** + **rough-cut MP4** (where enabled). English UI; **simple / essential only**. This document is for **user confirmation**, not an implementation backlog.

Verified against: README, `docs/CONTEXT.md`, `web/gonggan.js`, `routes.py`, `gg_project/local_store.py`, `gg_native_api.py`, `gg_sdk.py`, `gg_export.py`, UX design notes (Reference Manager, Auto Cut Split). Version ref: `0.9.30`.

**Legend:** Current = shipped today. Need = product intent. Difficulty: S / M / L.

---

## 1. Project setup

| Feature | Current | Need | User-request basis | Difficulty |
|--------|---------|------|-------------------|------------|
| Native **New Project** (name, aspect/resolution, FPS, default cut length, caption language, workflow template) | Have | Must | new-project setup v2 approved | — |
| **Project Settings** (same fields + template ref) | Have | Must | new-project setup v2 approved | — |
| Native project **rename / delete** (delete → `trash/projects/`) | Have | Must | inferred | — |
| **Due date** + completion **Best c/N** summary bar | Have (native) | Nice | inferred | — |
| Read-only **legacy imported** projects via `gonggan_settings.json` `data_root` | Have | Nice | inferred | — |
| **Auto Cut Split** (copy LLM prompt + paste import list → scenes/cuts/captions) | None | Must | Auto Cut Split approved | M |
| Optional **project folder** path (see §9) | None | Nice | local folder auto-organize (pending confirm) | M |

---

## 2. Cut / scene editing

| Feature | Current | Need | User-request basis | Difficulty |
|--------|---------|------|-------------------|------------|
| **Add Cut**, soft-delete, **Trash** restore (native) | Have | Must | inferred | — |
| Drag **reorder** cuts; **Group into Scene** / ungroup; scene **rename** | Have | Must | inferred | — |
| Per-scene labels **`1-1`, `1-2`, …** from scene order | Have | Must | inferred | — |
| Cut **caption**, **planned length**, **End card**, **Needs redo** (native `POST /gonggan/cut/update`) | Have | Must | inferred | — |
| **Cut rename** in Shots UI (store has `rename_cut`; no route/UI) | None | Must | cut rename UI approved | S |
| **Info \| Caption** list layout toggle | Have | Must | inferred | — |
| One-click **workflow** open per cut; autosave to `workflows/gonggan/<pid>/<cutId>.json` | Have | Must | inferred | — |
| **Missing Load Image** guard (block queue) | Have | Must | inferred | — |
| Legacy project: cut metadata editing in UI | None (read-only) | Not needed | inferred | — |

---

## 3. Timeline & preview

| Feature | Current | Need | User-request basis | Difficulty |
|--------|---------|------|-------------------|------------|
| **Timeline** bottom panel; toggle button + **`T`** shortcut | Have | Must | inferred | — |
| Single video track; clip length from pick + **trim**; pointer **reorder** | Have | Must | inferred | — |
| **Sequential playback** of picked takes | Have | Must | inferred | — |
| Persist order/trim/pick (`POST /gonggan/edit`; native via `LocalStore.apply_timeline_edit`) | Have | Must | inferred | — |
| **Reset** timeline edit (legacy) | Have | Nice | inferred | — |
| **Export mp4** from timeline (ffmpeg → `ComfyUI/output/gonggan/`) | Have (legacy only) | Must | inferred | M (native parity) |
| Gapless / cross-cut audio continuity | None | Nice | inferred | L |

---

## 4. Captions / subtitles / SRT export

| Feature | Current | Need | User-request basis | Difficulty |
|--------|---------|------|-------------------|------------|
| Per-cut **Caption** field (notes + dialogue combined) | Have | Must | inferred | — |
| **Export captions (.srt)** — client download; timing from order + clip lengths | Have | Must | inferred | — |
| Caption language hint on placeholder (project setting) | Have | Nice | new-project setup v2 approved | — |

---

## 5. References

| Feature | Current | Need | User-request basis | Difficulty |
|--------|---------|------|-------------------|------------|
| **Reference Manager** (project-level Character/Place/Prop/Style; Best image; inject into cut Load Image) | None | Must | Reference Manager approved | L |
| Reference rows from **Auto Cut Split** `# References` section | None | Must | Auto Cut Split + Reference Manager approved | (part of above) |

---

## 6. Generation (Send / Regen)

| Feature | Current | Need | User-request basis | Difficulty |
|--------|---------|------|-------------------|------------|
| User presses **Run** in ComfyUI (plugin never auto-queues except explicit **Regen** confirm) | Have | Must | inferred | — |
| **Send last output** → new cut version (`gg_sdk.last_output` from history or newest file under ComfyUI **output** dir; **copy** into plugin storage) | Have | Must | inferred | — |
| Queue **progress** tied to cut that opened the workflow tab | Have | Must | inferred | — |
| **Regenerate** (SDK dry-run + confirm; Qwen draft graph) | Have (legacy pid only; blocked for native) | Nice | inferred | M (if native ever needs it) |
| Contest **one-shot real generation** smoke test | Have (manual, documented in CONTEXT) | Not needed | tiny real generation check approved | — |

---

## 7. Result selection / Best

| Feature | Current | Need | User-request basis | Difficulty |
|--------|---------|------|-------------------|------------|
| Keep **all takes** per cut | Have | Must | inferred | — |
| **Set rep** / timeline representative version (UI label **Rep**; summary bars say **Best**) | Have | Must | inferred | — |
| First **Send** auto-selects pick when none set | Have | Must | inferred | — |
| **Final cut** list + filter **Show redo cuts only** | Have | Must | inferred | — |
| Read-only suggested filename `S01_003_v02` (display only) | Have | Nice | inferred | — |

---

## 8. Export

| Feature | Current | Need | User-request basis | Difficulty |
|--------|---------|------|-------------------|------------|
| **Rough-cut MP4** (480p/720p/1080p presets, optional clip audio) | Partial (legacy projects only) | Must | inferred | M |
| **SRT** captions file | Have | Must | inferred | — |
| XML / EDL / OTIO / DaVinci round-trip | None | Not needed | inferred | — |

---

## 9. Local folder auto-organize

### 9.1 Current behavior (verified)

| Topic | Behavior |
|-------|----------|
| **ComfyUI render output** | Stays under ComfyUI **`folder_paths` output directory** (typically `ComfyUI/output/`). `gg_sdk.last_output()` reads newest qualifying image/video from prompt **history**, else newest file on disk (skips `output/gonggan/` export folder). **Not moved** when sending to a cut. |
| **Plugin export MP4** | Written to **`<ComfyUI output>/gonggan/`** (`gg_export.output_dir()`). |
| **Native project media (source of truth)** | **`PACK_DIR/projects/<pid>/assets/<cutId>/<versionUuid>.<ext>`** — file name is **UUID**, not cut label. Metadata: **`projects/<pid>/versions/<cutId>/<versionUuid>.json`**. Workflow blobs: **`projects/<pid>/workflows/<sha256>.json`**. |
| **Legacy imported project media** | **`PACK_DIR/versions/<legacyPid>/<cutId>/<vid>.<ext>`** + sidecar **`<vid>.json`**; optional **`workflows/<legacyPid>/<cutId>/…`**. |
| **Send last output** | **`shutil.copy2`** from ComfyUI output path into plugin storage (`local_store.add_version` / `gg_data.add_version`). Original ComfyUI file **remains**. |
| **Human-readable tree on disk** | **None** — only ID-based paths + ComfyUI `user/default/workflows/gonggan/<pid>/<cutId>.json` for graphs. |
| **Trash** | **`trash/projects/`** for deleted native projects; cut soft-delete stays in `project.json`. |

### 9.2 Simplest proposed design (not implemented)

| Element | Proposal |
|---------|------------|
| **Project folder** | Default **`projects/<pid>/`** (internal). Optional user-chosen **Project folder** in New Project / Project Settings (display + sync target only). |
| **Readable mirror** | Regenerated on demand and after **Send**, **Best/Rep change**, **rename**: `<ProjectName>/<Scene N - name>/<label - cut name>/` with **copies** of version files named **`{cut label}_v{nn}.<ext>`**; Best marked via **`_best` suffix** or **`Best/`** subfolder (pick one in implementation). |
| **Source of truth** | Unchanged ID storage under `projects/<pid>/`; mirror is **derived**, safe to delete and rebuild. |
| **Same-drive optimization** | Prefer **hardlinks** instead of copy when mirror sits on same volume as `assets/` (fallback to copy). |
| **Risks** | Windows **MAX_PATH** / illegal characters in scene/cut names; **duplicate** sibling names; **2× disk** usage if always copying; hardlink **cross-volume** failure; mirror **out of sync** if rebuild hook missed. |
| **Difficulty** | **M** (sync hooks + sanitization + settings field; no change to ComfyUI core). |

| Feature row (summary) | Current | Need | User-request basis | Difficulty |
|----------------------|---------|------|-------------------|------------|
| Auto **human-readable folder mirror** of results | None | Must | local folder auto-organize requested (**pending confirmation**) | M |

---

## In Premiere / CapCut but **NOT needed here**

| Excluded capability | Why (simple / essential) |
|--------------------|---------------------------|
| Multi-track **audio mixing** / music bed | Rough cut preview only; one composited MP4 + optional SRT is enough. |
| **Transitions**, filters, motion presets | Generation happens in ComfyUI workflows, not in the NLE. |
| **Color grading** / scopes / LUT library | Out of scope; final grade assumed external or in-node. |
| **Keyframes** / motion graphics | Cuts are single clips with trim, not motion design. |
| **Proxy media** / ingest transcode pipeline | Local files; no large-team ingest. |
| **Collaboration**, cloud project locks, comments | Single-user ComfyUI session. |
| **Stock libraries**, text templates, auto-captions from audio | Captions are authored per cut; no ASR stack. |
| Full **NLE project exchange** (XML/EDL/OTIO) | Explicitly deferred; MP4 + SRT cover sharing. |
| **Multicam**, nested sequences | One representative take per cut on one track. |

---

## Candidates not yet approved

*(Must + None only; excludes items already approved above. **Do not implement before user confirms.**)*

- **Local folder auto-organize** — optional Project folder + regenerated readable mirror tree (§9.2).
- **Native project timeline MP4 export** — backend/UI block legacy-only export today; parity needed for native-first workflow.

---

## Summary (5 lines)

1. **Core shipped:** native projects, scenes/cuts, timeline trim/play, Send last output, version Rep/Best, captions + SRT, workflow-per-cut, Load Image guard, legacy import read-only.
2. **Approved but missing:** Auto Cut Split import, Reference Manager, cut rename UI (backend only today).
3. **Gap:** native projects cannot export timeline MP4 yet; ComfyUI output files are not auto-organized into readable folders.
4. **Storage truth:** ID-based `projects/<pid>/assets/…` with **copy** on Send; ComfyUI `output/` unchanged.
5. **Principle:** stay a lightweight shot list + rough cut inside ComfyUI—not a full NLE.
