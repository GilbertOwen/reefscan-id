# ReefScan-ID: team handoff

Status report for the team, written 2026-10-15. Read this before starting any task. AI assistants: read [AGENTS.md](../AGENTS.md) as well.

## What we are building

ReefScan-ID estimates coral reef health from underwater photos. A deep learning model reports how much of a photo is live coral, bleached coral, dead coral and substrate, and a Streamlit web app shows the result. It is the final project for COMP6826001 Deep Learning, built by a team of 3.

| Module | Task | Dataset |
|---|---|---|
| A (main) | Semantic segmentation and % cover per photo | Coralscapes |
| B | Healthy vs bleached coral patch classification | NOAA PIFSC ESD Coral Bleaching |

Module C (reef sound) from the original plan is dropped and left as future work.

## Where things live

| What | Where |
|---|---|
| Code, notebooks, docs | This repo: https://github.com/GilbertOwen/reefscan-id |
| Processed data and model checkpoints | Shared Google Drive folder `ReefScan-ID`, subfolders `Checkpoints` and `Processed` (capital letters). Ask Gilbert for access |
| Raw data | Loaded from Hugging Face inside Colab; never stored in the repo or on Drive |
| AI usage log | [ai-log.md](../ai-log.md) |
| Data licences and citations | [docs/data-licenses.md](data-licenses.md) |

## Phases and status

Weeks follow the original plan, which assumed we start at week 5; shift them to the real course week.

| Phase | Week | Output | Status (2026-10-15) |
|---|---|---|---|
| F0 Confirm and set up | W5 | Repo, Drive, Colab, licence table, AI log | Done |
| F1 Proposal | W6 | 1–2 page proposal | Not started |
| F2 Data and EDA | W7 | EDA notebooks, checked loaders, processed data, class mapping | In progress: Coralscapes section 1 done; NOAA EDA not started |
| F3 Baselines | W8 | Baseline numbers for modules A and B | Not started |
| F4 Main models and experiments | W9–W10 | Best checkpoints, at least 2 experiment scenarios | Not started |
| F5 Analysis | W11 | Error analysis, domain shift, Grad-CAM | Not started |
| F6a App prototype | W8 | Local Streamlit app running the baseline model | Not started |
| F6b Final app and deploy | W12 | Best model in the app, public link | Not started |
| F7 Practical evaluation | W12–W13 | Evaluation on coral reef images | Not started |
| F8 Report and submission | W13–W14 | Report, AI log, video if required | Not started |

Each phase has a gate that must be met before moving on:
- **F2:** NOAA labels load correctly, pixel class distribution known, class mapping chosen, leakage check run.
- **F3:** metrics and splits fixed before any main model.
- **F4:** best model picked on validation, not test.
- **F5:** test set used once.

## Results so far

Coralscapes EDA, section 1 (`notebooks/01_eda_coralscapes.ipynb`, run in Colab on a Tesla T4, 2026-10-15):

| Split | Images | Image size | Mask size |
|---|---|---|---|
| train | 1517 | 1024×2048 RGB, all images | 1024×2048 mode L, all masks |
| validation | 166 | 1024×2048 RGB, all images | 1024×2048 mode L, all masks |
| test | 392 | 1024×2048 RGB, all images | 1024×2048 mode L, all masks |

These match the dataset card. No model has been trained yet.

## Decisions

| Date | Decision | Decided by |
|---|---|---|
| 2026-10-12 | Topic: ReefScan-ID | Gilbert |
| 2026-10-12 | Datasets: Coralscapes (segmentation) and NOAA PIFSC ESD Coral Bleaching (classification), both from Hugging Face | Gilbert |
| 2026-10-14 | Follow phases F0 to F8, with the app prototype starting at W8 | Gilbert, accepting Claude's proposal |
| 2026-10-14 | D1: which course brief applies is deferred; decide before F7 | Gilbert |
| 2026-10-14 | D2: AI log is `ai-log.md` in this repo, copied into the report | Gilbert, accepting Claude's proposal |
| 2026-10-14 | D3: team of 3; role assignment left for later | Gilbert |
| 2026-10-14 | D4: module C (sound) is future work | Gilbert, accepting Claude's proposal |
| 2026-10-14 | D5: no stakeholder testing; practical evaluation uses coral reef images only | Gilbert |
| 2026-10-14 | D6: class mapping (39 Coralscapes classes to broad groups) chosen after the EDA, from train and validation data only | Gilbert, accepting Claude's proposal |
| 2026-10-14 | D7: train on random 512×512 crops; predict full images with a sliding window | Gilbert, accepting Claude's proposal |
| 2026-10-14 | D8: segmentation starts with SegFormer-B0; SegFormer-B2 is the accuracy vs speed experiment | Gilbert, accepting Claude's proposal |
| 2026-10-14 | D9: cross-entropy vs weighted vs focal loss is one experiment scenario | Gilbert, accepting Claude's proposal |
| 2026-10-14 | D10: Good / Fair / Poor reef health thresholds are not invented: cite a published source or show % cover only; choose in F5 | Gilbert, accepting Claude's proposal |
| 2026-10-14 | D11: deploy target (Hugging Face Spaces or Streamlit Community Cloud) chosen in F6a by testing | Gilbert, accepting Claude's proposal |
| 2026-10-14 | D12: F2 runs in Google Colab | Gilbert, accepting Claude's proposal |
| 2026-10-15 | GitHub is the main copy of every notebook: open notebooks in Colab from GitHub and save back with "Save a copy in GitHub". Drive keeps only data and checkpoints | Gilbert, accepting Claude's proposal |

Change a decision only after the group agrees, and add a new row instead of editing an old one.

## Open questions

- **Which brief applies (D1).** The 2025/26 brief weights app 40%, report 40% and video 20%, with a week 6 proposal. The 2026/27 brief weights data preparation 20, model 20, analysis 20, real-world suitability 15, app 15 and AI usage 10, and has no video.
- **Image-only evaluation (D5).** If the 2026/27 brief applies, its section 17 asks for lecturer approval of any alternative to user testing.
- **Lecturer checks:** are pretrained models and non-Indonesian data accepted? What is the proposal template, and what is the current course week?
- **Roles:** who takes which part.

## Work that is open now

None of this is assigned yet; agree in the group who takes what.

1. **Coralscapes EDA, sections 2 to 6.** Remaining sections: mask values and the class id to name table; pixel counts per class per split; % live, bleached and dead coral per photo; sample images with coloured masks; class mapping options for D6. Gilbert is running these.
2. **NOAA EDA (`notebooks/02_eda_noaa.ipynb`, not created yet).** Planned sections:
   - Check the labels load (see the gotcha below).
   - Count CORAL vs CORAL_BL per split.
   - Check image sizes and show samples per class.
   - Check whether patches from the same source photo appear in both train and test, using the file names.
3. **F1 proposal**, 1 to 2 pages, once the template is known.
4. **Questions for the lecturer** listed above.

## How to start

1. Clone the repo: `git clone https://github.com/GilbertOwen/reefscan-id.git`
2. In Google Drive, open the shared `ReefScan-ID` folder and choose **Add shortcut to Drive** into My Drive. The notebooks expect it at `/content/drive/MyDrive/ReefScan-ID`.
3. In Colab: **File → Open notebook → GitHub**, pick `GilbertOwen/reefscan-id`, open the notebook, and set the runtime to T4 GPU.
4. Work on your own branch, one feature per branch. Save from Colab with **File → Save a copy in GitHub** to that branch, then open a pull request for another member to review.
5. Loading Coralscapes downloads about 5.9 GB into the Colab runtime, so expect a few minutes per new session.

## Team rules

- **AI log:** every time an AI tool helps, add a row to `ai-log.md`: date, part, what the AI did, key prompt, and how the output was checked. The brief makes this part of the grade.
- **Real results only:** never write a metric, result, figure or test outcome that was not produced by a run. The brief treats fabricated evidence as an integrity breach.
- **Interpretation is human-written:** the **Observation** cells and every conclusion in the report are written by the team member, not by AI.
- **Data hygiene:**
  - Make decisions from train and validation data only.
  - Use the test set once, at the end.
  - Never commit data or checkpoints; `.gitignore` blocks the usual files.
- **Credits:** cite both datasets as in `docs/data-licenses.md` in the report, the README and the app.

## Dataset gotchas

- **Coralscapes is about 5.9 GB** and downloads again in every new Colab session.
- **NOAA labels may not load by default (not tested yet).** The dataset card's config sets `drop_labels: true` with paths that do not match the folders `train/CORAL`, `train/CORAL_BL` and so on. Check what `load_dataset` returns; the label is the folder name.
- **The old NOAA link** `akridge/NOAA-ESD-CORAL-Bleaching-Dataset` redirects to `NMFS-OSI/NOAA-PIFSC-ESD-CORAL-Bleaching-Dataset`; cite the new one.
- **NOAA's licence (Public Domain)** is stated only in the card text, not in the Hugging Face licence field.
- **Drive subfolders are `Checkpoints` and `Processed`** with capital letters; Colab paths are case-sensitive.
