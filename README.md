# Vidot Studio – Cut Manager

**A shot list + rough-cut timeline that lives inside ComfyUI.**
Plan a short film as projects, scenes and cuts, open each cut's workflow on the canvas with one click, keep every take, pick the best one, and watch the whole edit play back on a timeline - without leaving ComfyUI.

> Built for the Comfy **Open Source Higgsfield** challenge. Everything runs locally on your own ComfyUI.

![Shots sidebar and Timeline panel](docs/images/overview.png)

## Quickstart (60 seconds)

1. Open the **Shots** tab in the left sidebar.
2. **New Project…** (project selector menu) - name the project and confirm defaults in the dialog.
3. Right-click the cut list - **Add Cut**.
4. Click a cut - its workflow opens on the canvas. Press **Run** in ComfyUI when you are ready.
5. When the render finishes, it is added to the cut as a new take (right-click > **Send last output** attaches the last render by hand). Mark one take as **Best**.
6. Open **Timeline** (header button or press **T**) to play the rough cut and trim clips.

## What it does

- **Shots sidebar tab** - projects, scenes, and cuts with thumbnails, drag-to-reorder (drag a cut, or drag a scene header to move the whole scene; **Esc** cancels), and **per-scene cut labels** (`1-1`, `1-2`, `2-1`, …) derived from scene blocks and timeline order.
- **One click, one workflow** - clicking a cut opens that cut's workflow in a single reusable canvas tab (labelled `Project / Cut`). Unsaved edits are auto-saved when you switch cuts.
- **Takes / versions** - a render queued from a cut is added to that cut as a new take when it finishes (native projects); *Send last ComfyUI output* attaches your latest render by hand. Every take is kept; until you mark one as **Best** (manual only), the newest take is shown. Click a take's thumbnail to open the workflow that made it (embedded in the image, else the saved one) in the same canvas tab; this does not change Best. Right-click a cut (or its timeline clip) > **Regen** opens the cut's current workflow and, after you confirm, queues it once; the result is added to the cut when it finishes (if that cut is already open, the open graph is queued as is).
- **Timeline bottom panel** - toggle with the **Timeline** button or **T**. All cuts in order on one track, trim handles, playback of the picked takes as a continuous rough cut.
- **Production tracking** - summary bar `Image a/N · Video b/N · Best c/N`, project completion %, *Needs redo* flag, **Show redo cuts only** filter, 3-second rule warning (with *End card* exemption).
- **Caption field** - one text area per cut for director notes and dialogue (placeholder includes the project caption language). **Info** vs **Caption** list modes change layout only; **Export captions (.srt)** uses stored caption text only, timed from cut order and lengths.
- **New project** - name, aspect/resolution preset, FPS, default cut length, default workflow template, caption language, and an optional folder path.
- **Project Settings** (the ⚙ gear next to **Project:**, or right-click the project row) - **Output folder** (a local folder for this project's results, organized by project / scene / cut; checked on Save; empty = the plugin's own storage; stored for the planned auto-organize, nothing is written there yet), **Default template** (with **Use last**), and the project **Image template** / **Video template** (see [Default templates and Image to Video](#default-templates-and-image-to-video)). Rename a project with right-click > **Rename Project…**.
- **Auto Cut Split** - in the New Project dialog: 1. Copy the prompt and paste it into your LLM together with your story. 2. Paste the LLM's result into the box to split it into scenes and cuts (with captions and a reference name list) automatically. The preview shows e.g. `3 scenes, 12 cuts, 4 references will be created`; Create stays disabled while a line has an error.
- **References** - project right-click menu > References…: Character / Place / Prop / Style / Other with category chips. **+ New** adds a name; **Generate** opens its workflow (your default template) in a ComfyUI tab; run it, then **Add last output** makes that image the reference's picture (the newest one is used). Rename / Delete as well. References stay out of the timeline and exports. Names from an Auto Cut Split `# References` section appear here automatically.
- **Rename a cut** - right-click a cut > **Rename…** (a new cut is named "New cut" until you do; on-screen numbers come from position).
- **Keyboard shortcuts** (Shots list, while the pointer is over it or focus is inside; not while typing) - **Up / Down** previous / next cut, **Enter** open the selected cut, **F2** rename, **Alt+G** group into a scene, **Alt+Shift+G** remove from scene, **Alt+N** add a cut after the selected one, **Alt+Up / Alt+Down** move cuts, **Delete** move to Trash, **Esc** clear selection, **T** toggle Timeline.
- **Project templates** - link a saved ComfyUI workflow as the starting graph for new cuts.
- **Missing Load Image guard** - highlights `Load Image` nodes whose file is missing and blocks queueing until fixed.
- **Safe by design** - all edit data is stored inside the plugin folder; it never queues a generation on its own (you press *Run* or confirm *Regen*).

![Cut list with status dots](docs/images/shots.png)

![Empty project state](docs/images/empty.png)

## Install

Requirements: a recent ComfyUI with the new frontend (sidebar tabs / bottom panel). Python 3.10+. Optional: `ffmpeg` on PATH for video posters.

### Option A - git clone (recommended)
```bash
cd ComfyUI/custom_nodes
git clone https://github.com/passionfx-ui/comfyui-gonggan-cut.git
```
Restart ComfyUI, then refresh the browser.

### Option B - download ZIP
Download the repository ZIP, extract it into `ComfyUI/custom_nodes/comfyui-gonggan-cut`, restart ComfyUI.

No extra Python packages are needed for the core plugin (it uses ComfyUI's own `aiohttp` server).

### Optional: Comfy SDK regenerate path
The *Regenerate* button for legacy imported projects uses `comfy-sdk` in an isolated venv so ComfyUI's Python is never touched:
```bash
cd ComfyUI/custom_nodes/comfyui-gonggan-cut
python -m venv .venv-sdk
.venv-sdk/Scripts/python -m pip install comfy-sdk comfy-api-proxy   # Windows
# .venv-sdk/bin/python -m pip install comfy-sdk comfy-api-proxy     # macOS / Linux
```
Then run `start_proxy.bat` (proxy on `127.0.0.1:8189`). Regenerate is a dry run until you confirm.

## Usage

1. Open the **Shots** tab in the left sidebar.
2. Open the project selector menu - **New Project…**, set name, aspect/resolution, FPS, default cut length, template, and caption language.
3. (Optional) set the Output folder or change the default template later via **Project Settings…** (the ⚙ gear next to **Project:**, or the project right-click menu); rename via **Rename Project…** in the same menu.
4. Right-click the cut list - **Add Cut**. Add as many as you need; drag to reorder; select several and **Group** them into a scene.
5. Click a cut - its workflow opens on the canvas. Edit prompts, press **Run** yourself.
6. When the render finishes, click **Send last output** to attach it as a take. Pick the **Best** take.
7. Open the **Timeline** bottom panel (**Timeline** button or **T**) to play the rough cut, trim clip edges, and check total length.
8. Use **Caption** list mode to edit notes/dialogue per cut, then **Export captions (.srt)** from the Final cut list.

![Timeline playback](docs/images/timeline.png)

## Script to cuts with LTX (local, open weights)

Turn a story into ready-to-render cuts (native projects). Use **AI Cut Split** with a local Ollama model (below), or any chat LLM yourself with copy / paste:

1. In the Shots toolbar click **Copy Cut Split Prompt**, paste it into any LLM and add your story after `STORY:`.
2. The LLM answers with a JSON array: `[{"cut": 1, "duration": 3, "description": "..."}]` — `cut` a whole number, `duration` 0.5–3 seconds, `description` one short line (max 300 characters). Older lists with `content` / `ltx_prompt` still paste (read as `description`).
3. Click **Paste Cut List**, paste the answer (code fences or extra text around the array are fine), pick the workflow (**Project Video template** by default, or the bundled LTX **Text to video** / **Image to video**) and **Create cuts**. AI Cut Split always uses the project Video template. Invalid lists are refused with one message per problem, e.g. `Item 3 (cut 3): "duration" must be between 0.5 and 3 seconds (got 4).`
4. Each new cut gets: name (first 80 characters), caption and prompt = `description`, length = `duration`, and its own copy of the workflow with `description` in its prompt node (see [Prompt node rule](#default-templates-and-image-to-video)) and the frame count set from the duration (`frames = min(round(duration × fps / 8) × 8 + 1, 73)`, fps from the workflow's save node, 24 in the examples).
5. Press **Queue** with no cut selected to render every cut in list order, one at a time through the Comfy SDK; each result is added as a new version, so the timeline fills in as it goes. Cut cards show **Waiting / Generating / Done / Failed**; press **Queue** again (it shows **Stop**) to cancel the cuts still waiting (the one generating finishes). It runs on the server, so the workflow tab does not need to be open. To render a single cut, select it and press **Queue** (or right-click > **Regen**). Nothing is queued when the cuts are created.

### AI Cut Split (local LLM)

**AI Cut Split** (Shots toolbar) sends your story with the same fixed prompt to a local [Ollama](https://ollama.com) server, checks the answer with the same rules as Paste Cut List, then asks `Create N cuts?`. The request goes through the plugin's own server route, so there are no CORS settings to change. ComfyUI's built-in LLM nodes are not used.

1. Install Ollama from [ollama.com/download](https://ollama.com/download) and start it (it listens on `http://127.0.0.1:11434`).
2. Pull a model for your GPU, e.g. `ollama pull qwen2.5:7b`:

| GPU VRAM | Recommended model |
| --- | --- |
| up to 8 GB | `qwen2.5:3b` |
| 8–12 GB | `qwen2.5:7b` |
| 16 GB or more | Gemma 4 (`gemma4`) or `qwen2.5:14b` |

3. In Shots click **AI Cut Split**, write or paste the story, pick the model and click **Split**.

**Keep LLM loaded** is off by default: the request uses `keep_alive: 0`, so Ollama unloads the model right after the split and the VRAM is free for LTX. Turn it on only if you will split several stories in a row (Ollama then keeps the model for its default time, 5 minutes).

Another Ollama address: ComfyUI **Settings › Vidot Studio › AI Cut Split › Ollama URL**, or `"ollama_url"` in `gonggan_settings.json` (default `http://127.0.0.1:11434`). If Ollama is not running, the dialog says `Ollama not running at <url>`; use **Copy Cut Split Prompt** with any LLM and **Paste Cut List** instead (the dialog has a button for it, and an answer that fails the check can be fixed there).

Workflows: [`examples/workflows/ltxv_text_to_video.json`](examples/workflows/ltxv_text_to_video.json) and [`ltxv_image_to_video.json`](examples/workflows/ltxv_image_to_video.json) (ComfyUI's LTX-Video examples; image to video starts from the `Load Image` node, pick an image per cut).

Models to install (from the loader nodes of these workflows):

| Loader node | File | ComfyUI folder |
| --- | --- | --- |
| Load Checkpoint | `ltxv-2b-0.9.8-distilled.safetensors` ([Lightricks/LTX-Video](https://huggingface.co/Lightricks/LTX-Video)) | `models/checkpoints/` |
| Load CLIP (type `ltxv`) | `t5xxl_fp8_e4m3fn_scaled.safetensors` ([comfyanonymous/flux_text_encoders](https://huggingface.co/comfyanonymous/flux_text_encoders)) | `models/text_encoders/` |

The LTX-Video weights are **not included** in this repository. Download them yourself under the [LTX-Video Open Weights License](examples/workflows/LTX-Video-Open-Weights-License-0.X.txt). Bundled workflows target `ltxv-2b-0.9.8-distilled.safetensors` plus `t5xxl_fp8_e4m3fn_scaled.safetensors` (see table above). The model is replaceable: the cut's workflow is a normal workflow, so open the cut and swap in any other model or template; Queue runs whatever the cut's workflow is.

### Settings (optional)
Copy `gonggan_settings.default.json` to `gonggan_settings.json` to point `data_root` / `uid` at an external legacy project data folder (read-only import of older projects). Leave `data_root` empty to use native projects only.

## Default templates and Image to Video

Built-in templates ship as normal ComfyUI workflows in [`examples/workflows/`](examples/workflows/) and appear at the top of every **Template** dropdown (after `(none)`):

| Template | File | Models |
| --- | --- | --- |
| **Image (default)** | `z_image_turbo_t2i.json` - Z-Image Turbo text to image, 1024×576, 8 steps, cfg 1, res_multistep / simple | `z_image_turbo_bf16.safetensors` (`models/diffusion_models/`), `qwen_3_4b.safetensors` (CLIP type `lumina2`, `models/text_encoders/`), `ae.safetensors` (`models/vae/`) |
| **Video LTX (default)** | `ltxv_image_to_video.json` - LTX-Video image to video, up to 73 frames at 24 fps, 8 steps, cfg 1 | see the LTX table above |
| **Video LTX text-to-video** | `ltxv_text_to_video.json` | see the LTX table above |

The models are replaceable: pick your own saved workflow as a template, or open a cut and swap the loaders. Model files are not included.

**Project Image / Video template.** New Project and Project Settings (⚙) have **Image template** (default `Image (default)`) and **Video template** (default `Video LTX (default)`), saved in the project settings. New cuts and Generate All use the Image template, Paste Cut List / AI Cut Split cuts use the Video template. A cut's own workflow always wins, and a linked **Default template** wins over the Image template for new cuts. If the chosen Video template is the image-to-video one, list cuts without a start image run the workflow as saved; pick **Video LTX text-to-video** for pure text-to-video lists.

**Prompt node rule.** The cut's description is written into the node titled **Prompt** (exact title, case-insensitive). Without one, it goes into the *CLIP Text Encode* that feeds the sampler's `positive` input. With neither, Paste Cut List / AI Cut Split and Image to Video stop with `Prompt node not found. Rename the prompt node to Prompt.`; an Image template without one just runs with its saved prompt.

**Start image rule.** Image to Video fills the node titled **Start Image**; without one, the workflow's only *Load Image* node. No title and several Load Image nodes (or none) stops with `Start image node not found. Rename the input node to Start Image.` Nothing is guessed.

**Image to Video** (version row button next to **Regen**, or right-click a cut > **Image to Video**): takes the cut's **Best** image version (else the version open in the workflow tab, else the newest image), copies it to ComfyUI's `input/gonggan/` folder, fills the start image node, writes the cut description into the prompt node, sets the length from the cut duration, and runs the project's Video template through the Comfy SDK path with a new seed after you confirm. No tab is opened; the video is added as a new version of the same cut.

## Where data is stored
Everything is written under the plugin folder (all gitignored): `projects/`, `edits/`, `versions/`, `workflows/`, `templates/`, `cache/`, `trash/`. Shot workflows are also saved through ComfyUI's workflow store under `user/default/workflows/gonggan/<project>/<cut>.json`. Deleting a project moves it to `trash/` first.

## Notes for judges / reviewers

- Runs **locally** against your ComfyUI instance; the plugin does not call out to the network for core Shots/Timeline features.
- Nothing is queued unless **you** press Run in ComfyUI or confirm **Regen** (legacy Regenerate also shows a dry run first).
- Project edits, versions, and cache files stay under this custom node's folder (plus ComfyUI's normal output/user workflow paths when you save or export).
- Automated tests (no GPU, no generation):
  ```bash
  node --test tests/js
  python -m unittest discover -s tests
  ```

## Development
```bash
python -m unittest discover -s tests -p "test_*.py"
node --test tests/js/*.test.mjs        # on Windows list the files explicitly
```
Headless browser checks live in `tests/e2e/` (need a running ComfyUI; they never queue generations). Detailed design notes, routes and changelog: [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md).

## License
GPL-3.0 - see [LICENSE](LICENSE). Copyright (c) 2026 passionfx-ui (GitHub org; confirm the legal holder name before public release).
