# Demo scenario (under 2 minutes)

A live click-through for a screen recording or a talk. It uses only what is on screen; no generation wait is shown (a render is started by you and cut from the recording).
Prepare beforehand: ComfyUI running, the Shots sidebar closed, a story and a ready-made LLM answer in the clipboard (see step 2), 2-3 takes already attached on the project used in steps 6-7.

| # | Time | Click order | Caption (on screen) |
|---|------|-------------|---------------------|
| 1 | 0:00-0:10 | Open the **Shots** tab in the left sidebar. Press **T** to show the Timeline panel at the bottom. | Shots - a shot list and rough cut inside ComfyUI |
| 2 | 0:10-0:30 | Right-click the header, **New Project...**. Type a name. In *Auto Cut Split* paste the LLM answer. The preview reads e.g. "2 scenes, 6 cuts, 3 references will be created". Click **Create**. | Paste your script - scenes and cuts appear |
| 3 | 0:30-0:45 | Drag one cut above another (numbers renumber). Select two cuts, right-click, **Group into Scene**. Right-click a cut, **Rename...**, type a name. | Drag to reorder, group into scenes, name your cuts |
| 4 | 0:45-0:58 | Right-click the header, **References...**. Show the categories, click **Generate** on one reference (its workflow opens in a tab). Close. | Keep characters and places in one place |
| 5 | 0:58-1:12 | Click a cut: its workflow opens. Change the prompt. Click another cut: the same tab switches, the tab label reads `Project / Cut`. | One click opens each cut's workflow |
| 6 | 1:12-1:30 | Run (the wait is cut). Click **Send last output**: a take appears. Compare takes, mark one **Best**: the dot turns green and completion rises. | Every render is a take - pick the best |
| 7 | 1:30-1:45 | Press play on the Timeline: the rough cut plays across cuts. Switch the list to **Caption**, type a line of dialogue. | Watch the whole edit, write captions in place |
| 8 | 1:45-1:55 | Open the Final cut list, **Export captions (.srt)**. | Dialogue to SRT for Premiere or DaVinci |

## Notes
- Total about 1 min 55 s at normal speed.
- Step 2 needs the ready answer in the clipboard; use the **Copy prompt** button in the dialog to get the prompt for your LLM beforehand.
- Hide toasts or paths that show a local folder before recording.
- The README screenshots in `docs/images` are regenerated with `node tests/e2e/readme_shots.mjs` (creates and deletes a temporary demo project; no generation; the four thumbnails are synthetic gradient placeholders seeded by `tests/e2e/seed_demo_thumbs.py`, not real renders).