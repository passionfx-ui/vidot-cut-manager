# Vidot Studio – Cut Manager

**Vidot Studio – Cut Manager: a ComfyUI plugin that turns a story into cuts and manages every take per cut.**

Repository: https://github.com/passionfx-ui/vidot-cut-manager

## Features

- **AI Make Cut** – paste a short story and get a cut list (name, description, duration). It runs a local Qwen3-VL 4B text model inside ComfyUI through the Comfy SDK, so no external LLM service or API key is needed.
- **Per-cut image generation** – every cut keeps its own copy of the workflow; select cuts and press **Queue** to render them one by one.
- **Image to video** – turn the selected image take into a clip with LTX-Video (`ltxv-2b-0.9.8-distilled`). The clip is added as a new take of the same cut.
- **Versions per cut** – every render or import stacks as a new version of the cut; mark the one you like as **Best**.
- **Import** – bring existing images or videos into a cut as versions.
- **Project folders** – each project lives in its own folder, with its cuts, versions and workflows.

## Requirements

- A recent ComfyUI (new frontend with sidebar tabs / bottom panel)
- Python 3.10+
- An NVIDIA GPU with enough free VRAM for the models below (about 8 GB or more recommended). CPU fallback works but is very slow.
- Comfy SDK and comfy-api-proxy (installed in a separate virtual environment, see below)
- Optional: `ffmpeg` on PATH for video posters

## Installation

1. Clone into ComfyUI's `custom_nodes` folder:

   ```bash
   cd ComfyUI/custom_nodes
   git clone https://github.com/passionfx-ui/vidot-cut-manager.git
   cd vidot-cut-manager
   ```

2. Install the Comfy SDK in its own virtual environment (ComfyUI's Python is not touched):

   ```bash
   python -m venv .venv-sdk
   .venv-sdk/Scripts/python -m pip install comfy-sdk comfy-api-proxy   # Windows
   # .venv-sdk/bin/python -m pip install comfy-sdk comfy-api-proxy     # macOS / Linux
   ```

3. Start the proxy: run `start_proxy.bat` (listens on `127.0.0.1:8189`).
4. Restart ComfyUI and reload the browser page. Open the **Cut Manager** tab.

## Models

Put these files in your ComfyUI `models` folder:

| Used for | File | Folder | Download |
| --- | --- | --- | --- |
| AI Make Cut (text model) | `qwen3vl_4b_int8_convrot.safetensors` | `models/text_encoders` | [Comfy-Org/Fibo-2.0](https://huggingface.co/Comfy-Org/Fibo-2.0/resolve/main/text_encoders/qwen3vl_4b_int8_convrot.safetensors) |
| Image to video | `ltxv-2b-0.9.8-distilled.safetensors` | `models/checkpoints` | [Lightricks/LTX-Video](https://huggingface.co/Lightricks/LTX-Video/resolve/main/ltxv-2b-0.9.8-distilled.safetensors) |
| Image to video (text encoder) | `t5xxl_fp8_e4m3fn_scaled.safetensors` | `models/text_encoders` | [comfyanonymous/flux_text_encoders](https://huggingface.co/comfyanonymous/flux_text_encoders/resolve/main/t5xxl_fp8_e4m3fn_scaled.safetensors) |
| Image generation (default template `builtin:image`, FLUX.2 klein) | `flux3_image_klein_sd_int8_convrot.safetensors` | `models/diffusion_models` | see `examples/workflows/flux3_image_klein_t2i.json` |
| Image generation (text encoder) | `qwen3vl_4b_int8_convrot.safetensors` | `models/text_encoders` | same file as AI Make Cut |
| Image generation (VAE) | `flux2-vae.safetensors` | `models/vae` | see `examples/workflows/flux3_image_klein_t2i.json` |

The two default templates ship in `examples/workflows/`: **Image (default)** = `flux3_image_klein_t2i.json`, **Video LTX (default)** = `ltxv_image_to_video.json` (image to video). `ltxv_text_to_video.json` and `z_image_turbo_t2i.json` are extra examples. You can pick any of your own saved workflows as the Image / Video template in **Project Settings**.

You can pick another text model for AI Make Cut in **Project Settings**.

## AI features and Use AI

- AI features (**AI Make Cut**, AI cut split) are **off by default**. Turn on **Use AI (Beta)** in **Project Settings** to show and use them. When it is off, nothing calls the text model.
- They run locally in ComfyUI through the Comfy SDK and `comfy-api-proxy` on `127.0.0.1:8189`. No external LLM service or API key is used.
- AI Make Cut writes the generated prompt into the cut's workflow, including prompt nodes inside subgraphs.

## Usage

1. Open the **Cut Manager** tab and create a project (choose a folder).
2. Click **AI Make Cut**, paste your story, and confirm. The cuts appear in the cut list.
3. Select cuts (click, Shift/Ctrl-click, or **Ctrl+A** to select all) and press **Queue** to render images.
4. Pick a take in the version strip, mark it **Best**, or press **Make Video** to animate the selected image with LTX-Video.
5. Use **Import** to add your own images or videos to a cut.

## Known limits

- Beta software: back up project folders you care about.
- Windows is the main tested platform; `start_proxy.bat` is Windows-only (on macOS / Linux run `comfy-api-proxy run --comfyui http://127.0.0.1:8188 --host 127.0.0.1 --port 8189` from the venv).
- The plugin's routes are meant for a ComfyUI that listens on localhost only. Do not expose ComfyUI with `--listen 0.0.0.0` on an untrusted network while using it.
- Video cuts need the LTX-Video models above; without `ffmpeg`, video posters are not generated.

More details for developers: [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md).

**Demo video:** (link coming soon)

## License

GPL-3.0. See [LICENSE](LICENSE).
