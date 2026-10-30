# Demo video shot list (1–2 min screen recording)

Target: 90–110 s, 1920×1080, 30 fps, ComfyUI full screen, no personal paths or usernames on screen.
Prepare beforehand: a native project "Demo — Rainy Café" with 6 cuts in 2 scenes, 2–3 takes already rendered for most cuts (record **no** live generation wait; if a Run is shown, the user presses Run and the wait is cut).

| # | Time | Screen | Action | On-screen caption |
|---|------|--------|--------|-------------------|
| 1 | 0:00–0:06 | Title card over ComfyUI | Fade in logo/name | "Shots — shot list + rough cut inside ComfyUI" |
| 2 | 0:06–0:16 | Empty ComfyUI | Open **Shots** sidebar, right-click → New Project, type name | "Plan your film as projects, scenes and cuts" |
| 3 | 0:16–0:28 | Shots list | Add Cut ×3, drag to reorder (numbers update), multi-select → Group into scene | "Drag to reorder — numbers update automatically" |
| 4 | 0:28–0:42 | Switch to prepared demo project | Click cut 001 → workflow opens; click 002 → same tab switches, label `Project / Cut` | "One click opens each cut's workflow" |
| 5 | 0:42–0:54 | Canvas | Change prompt text, (cut) render done, click **Send last output** → take appears | "Every render becomes a take on its cut" |
| 6 | 0:54–1:04 | Info panel | Compare versions, mark **Best** → dot turns green, completion % rises | "Pick the best take — progress tracked automatically" |
| 7 | 1:04–1:20 | Timeline panel | Press play: rough cut plays across cuts; drag a trim handle; show total length / 3 s warning | "Watch the whole edit, trim in place" |
| 8 | 1:20–1:32 | Caption mode | Type a line of dialogue, Export captions (.srt) | "Dialogue → SRT for Premiere / DaVinci" |
| 9 | 1:32–1:40 | Missing image guard (optional) | Workflow with missing Load Image → red outline, queue blocked | "Catches missing inputs before you queue" |
| 10 | 1:40–1:50 | End card | Repo URL, `git clone` line, GPL-3.0, #OpenSourceHiggsfield | "Open source · GPL-3.0 · runs on your local ComfyUI" |

Notes
- Record with OBS at 1080p; zoom browser to 110% so text is readable.
- Hide any toasts showing local paths; close other tabs.
- Background music: royalty-free only, keep under voice/caption.
- Screenshots for README (`docs/images/overview.png`, `shots.png`, `timeline.png`) can be grabbed from shots 4, 6 and 7.