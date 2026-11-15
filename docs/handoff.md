# ReefScan-ID: team handoff

Status report for the team, written 2026-10-15 and updated 2026-11-12 for plan v2 (the group's "Rencana Final Project ReefScan-ID, Draft v2"). Read this before starting any task.

## What we are building

ReefScan-ID estimates coral reef health from a diver's photo. It is the final project for COMP6826001 Deep Learning, built by a team of 3. Under plan v2 the system is a cascade of two models, shown in a web app that runs both models in the browser:

| Stage | Task | Model | Data |
|---|---|---|---|
| 1 | Segment the photo into coral / substrate / other | SegFormer-B0 | Coralscapes |
| 2 | Classify points inside the coral mask as healthy / bleached / dead | EfficientNet-B0 | Patches cut from Coralscapes, plus NOAA PIFSC ESD Coral Bleaching for healthy vs bleached |

What the app does with a photo:
1. Resize the photo to the model input size.
2. Stage 1 gives a coral mask.
3. Drop coral areas that are too small and split the rest into colonies.
4. Sample points on a stratified grid inside the mask and cut a patch around each, resized to 224×224.
5. Stage 2 labels each patch with a confidence.
6. Vote per colony and compute % healthy / bleached / dead over all points.
7. Show the mask overlay, coloured points, a pie chart and warnings for low confidence or too little coral.

The reef sound module from the first plan is future work.

## Where things live

| What | Where |
|---|---|
| Code, notebooks, docs | This repo: https://github.com/GilbertOwen/reefscan-id |
| Processed data and model checkpoints | Shared Google Drive folder `ReefScan-ID`, subfolders `Checkpoints` and `Processed` (capital letters). Ask Gilbert for access |
| Raw data | Coralscapes is downloaded from Hugging Face once and cached in the shared Drive folder `ReefScan-ID`, subfolder `RawData` (capital letters); the notebooks load it with `cache_dir` set to that folder. NOAA is a git clone of the Hugging Face repo, uploaded to `RawData/NOAA-PIFSC-ESD-CORAL-Bleaching-Dataset` (folders `train`, `val`, `test`; the `.git` folder is skipped by the notebooks), because loading it with `load_dataset` in Colab took about 4 hours. Raw data is never stored in the repo |
| AI usage log | Kept outside the repo; `ai-log.md` is no longer tracked (see the 2026-11-15 decision on the AI log) |
| Data licences and citations | [docs/data-licenses.md](data-licenses.md) |

## Phases and status

Plan v2 replaces the earlier phases F1 to F8 with four weeks. The plan assumes 12 November 2026 is about week 11; match the weeks to the real course week.

Done before v2: setup (repo, Drive, Colab, licence table, AI log) and section 1 of the Coralscapes EDA. As of 2026-11-12 nothing else is in the repo or the shared Drive: no model has been trained.

| Phase | Week | Model and data | App and report | Status (2026-11-12) |
|---|---|---|---|---|
| P1 | W11 | Class mapping, stage 2 patch dataset, baselines E1 and E2 | Web skeleton with dummy output; ONNX Runtime Web test with a public pretrained SegFormer | Not started |
| P2 | W12 | Main models, E3, E4; ONNX export | Port post-processing to JavaScript; report outline | Not started |
| P3 | W13 | Ablation, CAM, error analysis, real photo test | Integrate the real models, public deploy, inference time measured on a phone; report draft | Not started |
| P4 | W14 | Final numbers | Video under 5 minutes if the brief asks for one, rubric check, submit | Not started |

Each phase has a gate that must be met before moving on:
- **P1:**
  - grey-case class mapping decided and written in the README;
  - NOAA labels load correctly;
  - patch splits follow the Coralscapes site splits;
  - metrics fixed.
- **P2:**
  - best models picked on validation, then the test set used once;
  - PyTorch and ONNX outputs match on the same images;
  - Python and JavaScript post-processing match on the same images.
- **P3:** the public link works on a phone; every number in the report draft traces to a run.
- **P4:** checked against the rubric of the brief that applies.

Cut first if time is short, in this order: DINOv2, the SegFormer-B2 variant, the colour correction ablation, the click-a-point feature. E4 and the end-to-end app are not cut.

## Experiments

| Experiment | What is compared | Metrics |
|---|---|---|
| E1. Segmentation (stage 1) | Small U-Net from scratch vs pretrained SegFormer-B0 (B2 if time allows) | mIoU, IoU of the coral class |
| E2. Patch classification (stage 2) | Frozen ResNet50 + logistic regression vs fine-tuned EfficientNet-B0 (DINOv2 optional, not deployed) | Macro-F1, per-class recall, confusion matrix |
| E3. Stage 2 data source | Train on NOAA only, Coralscapes patches only, or both; evaluate on both test sets | Macro-F1 per test set |
| E4. End to end | Direct 5-class SegFormer vs the cascade, on the 392 Coralscapes test photos | Error in % healthy / bleached / dead cover per photo (MAE), point-level bleaching F1 |

If the cascade is not better in E4, the result is reported as it is, with an analysis of why.

## Results so far

Coralscapes EDA, section 1 (`notebooks/01_eda_coralscapes.ipynb`, run in Colab on a Tesla T4, 2026-10-15):

| Split | Images | Image size | Mask size |
|---|---|---|---|
| train | 1517 | 1024×2048 RGB, all images | 1024×2048 mode L, all masks |
| validation | 166 | 1024×2048 RGB, all images | 1024×2048 mode L, all masks |
| test | 392 | 1024×2048 RGB, all images | 1024×2048 mode L, all masks |

These match the dataset card.

Stage 1 mask ids and class mapping, sections 1 and 2 of `notebooks/02_stage1_segmentation.ipynb` (run in Colab, saved outputs on branch `drive-raw-data`; run date not recorded): 40 mask values found in train and validation, of which value 0 is not on the dataset card and covers 17.05% of train pixels and 13.99% of validation pixels. With the 39 to 3 mapping (value 0 ignored), the pixel shares are:

| Split | Coral | Substrate | Other | Ignored (value 0) |
|---|---|---|---|---|
| train | 25.60% | 27.53% | 29.81% | 17.05% |
| validation | 19.57% | 29.36% | 37.08% | 13.99% |

Stage 1 SegFormer-B0 training, section 5 of `notebooks/02_stage1_segmentation.ipynb` (saved outputs on branch `drive-raw-data`, commit d92416e; run date not recorded):

| Item | Value |
|---|---|
| Model | SegFormer-B0 from `nvidia/mit-b0` (3,714,915 parameters), 3 classes |
| Training | 512×512 random crops, batch 8, 190 steps per epoch, 50 epochs, AdamW, learning rate 6e-5, weighted cross-entropy (weights 1.076, 1.000, 0.924) |
| Validation | 166 photos resized to 512×1024; scored on the validation split only, the test split was not used |
| GPU of this run | NVIDIA A100-SXM4-40GB, as printed by the Setup cell of the saved notebook |
| Time per epoch | 85 to 87 seconds on that GPU |
| Best epoch (by validation mIoU) | 37: mIoU 0.6775, coral IoU 0.6284, substrate IoU 0.6733, other IoU 0.7309, train loss 0.2947 |
| Epoch 50 | mIoU 0.6680, coral IoU 0.6198, substrate IoU 0.6714, other IoU 0.7130, train loss 0.2565 |

The run resumed from a checkpoint after epoch 3, so the saved output lists epochs 4 to 50 only. The best checkpoint is `best.pt` in `Checkpoints/stage1_segformer_b0`. The time per epoch was measured on an A100 and does not carry over to a T4. No other model has been trained. The reading of these results is left to the Observation cells.

NOAA dataset check, section 1 of `notebooks/03_eda_noaa.ipynb` (run in Colab on a CPU runtime, saved outputs on branch `noaa-check`, commit 2bca141; run date not recorded). The Drive copy has 10,419 images, the same as the Hub file list, and every image gets its label from its folder name:

| Split | CORAL | CORAL_BL | Total |
|---|---|---|---|
| train | 4541 | 2751 | 7292 |
| val | 973 | 589 | 1562 |
| test | 974 | 591 | 1565 |

Three non-image files sit at the top (`.gitattributes`, `.gitignore`, `README.md`). The path comparison shows 0 paths on Drive but not on the Hub, 0 on the Hub but not on Drive, and no repeated names.

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
| 2026-11-12 | Plan v2 adopted: the system is a cascade (stage 1 coral / substrate / other, stage 2 healthy / bleached / dead on points inside coral). Replaces the separate modules A and B | Group, in plan v2; confirmed by Gilbert |
| 2026-11-12 | Dataset roles: Coralscapes is the main dataset (stage 1, stage 2 patches, end-to-end test); NOAA supports stage 2. Replaces the roles in the 2026-10-12 row | Group, in plan v2; confirmed by Gilbert |
| 2026-11-12 | Class mapping (replaces D6): 39 classes to 3 for stage 1 (coral = all alive, bleached and dead coral classes; substrate = sand, rubble, algae covered substrate, hard substrate; other = the rest) and 39 to 5 for the comparison baseline. Grey cases are still open | Group, in plan v2; confirmed by Gilbert |
| 2026-11-12 | Inference (amends D7): the app resizes the photo to the model input size instead of a sliding window; training still uses random 512×512 crops | Group, in plan v2; confirmed by Gilbert |
| 2026-11-12 | Experiments are E1 to E4 (replaces D9); class weighting or focal loss handles imbalance | Group, in plan v2; confirmed by Gilbert |
| 2026-11-12 | App and deploy (replaces D11): custom web app, both models exported to ONNX and run in the browser, on a free static host; Streamlit Community Cloud is the fallback | Group, in plan v2; confirmed by Gilbert |
| 2026-11-12 | Timeline: phases P1 to P4 (W11 to W14) replace F1 to F8 | Group, in plan v2; confirmed by Gilbert |
| 2026-11-13 | Raw data on Drive: the Coralscapes download is cached in the shared Drive folder `ReefScan-ID/RawData`, and the notebooks load it with `cache_dir` set to that folder instead of downloading it in every Colab session. Amends "Drive keeps only data and checkpoints" in the 2026-10-15 row; raw data still never goes into the repo | Group; confirmed by Gilbert |
| 2026-11-15 | NOAA raw data on Drive: the NOAA PIFSC ESD Coral Bleaching dataset is kept as a copy of the Hugging Face repo in `ReefScan-ID/RawData/NOAA-PIFSC-ESD-CORAL-Bleaching-Dataset`, and notebooks read the images from that folder, taking the split and label from the path, instead of calling `load_dataset`. Amends "NOAA is loaded from Hugging Face inside Colab" in the raw data row | Gilbert (teammates not asked) |
| 2026-11-15 | AI log and assistant rules not in the repo: `ai-log.md` and `AGENTS.md` were removed from the tracked files on `main` (pull request 2). The AI usage log is kept outside the repo and is still copied into the report. Amends D2 ("AI log is `ai-log.md` in this repo"). The earlier versions stay in the Git history | Gilbert (teammates not asked) |

Change a decision only after the group agrees, and add a new row instead of editing an old one.

## Open questions

- **Which brief applies (D1), now urgent.** The 2025/26 brief weights app 40%, report 40% and video 20%. The 2026/27 brief weights data preparation 20, model 20, analysis 20, real-world suitability 15, app 15 and AI usage 10, and has no video. Plan v2 assumes the first.
- **Image-only evaluation (D5).** If the 2026/27 brief applies, its section 17 asks for lecturer approval of any alternative to user testing.
- **Lecturer checks:**
  - Are pretrained models and non-Indonesian data accepted?
  - Does a static web app with inference in the browser count as the app deliverable?
  - What is the current course week?
- **Grey cases in the class mapping:** which stage 1 group Millepora, Turbinaria and the "other coral" classes fall into. The choice goes in the README.
- **Stage 2 patch settings:** the crop sizes to try, and the threshold for dropping patches that mix classes.
- **Reef health label (D10):** a published source exists: Keputusan Menteri Negara Lingkungan Hidup No. 04 Tahun 2001, Lampiran I, by % live coral cover: Buruk 0 to 24.9, Sedang 25 to 49.9, Baik 50 to 74.9, Baik sekali 75 to 100. Still to decide:
  - whether to use these bands or show percentages only;
  - how the app computes live coral cover from one photo. The decree's bands are for live cover of the whole area measured by line transect, not for the share of healthy points inside coral, and bleached coral is still alive.
- **Static host:** GitHub Pages, Vercel or a Hugging Face Static Space.
- **Roles:** who takes which part.

## Work that is open now

None of this is assigned yet; agree in the group who takes what. These are the P1 (W11) tasks.

1. **Coralscapes EDA, sections 2 to 6** in `notebooks/01_eda_coralscapes.ipynb`: mask values and the class id to name table; pixel counts per class per split; sample images with coloured masks. The class mapping and the patch threshold depend on these.
2. **Class mapping**, including the grey cases, written in the README.
3. **NOAA check (`notebooks/02_eda_noaa.ipynb`, not created yet):** labels load (see the gotcha below), CORAL vs CORAL_BL counts per split, image sizes, samples per class.
4. **Stage 2 patch dataset:** grid points inside coral pixels of each Coralscapes photo, label from the centre pixel, splits by dive site.
5. **Baselines:** E1 (small U-Net, then SegFormer-B0) and E2 (frozen ResNet50 + logistic regression).
6. **Web skeleton** with dummy output, and a test that ONNX Runtime Web runs a public pretrained SegFormer in a phone browser.
7. **Questions for the lecturer** listed above.

## How to start

1. Clone the repo: `git clone https://github.com/GilbertOwen/reefscan-id.git`
2. In Google Drive, open the shared `ReefScan-ID` folder and choose **Add shortcut to Drive** into My Drive. The notebooks expect it at `/content/drive/MyDrive/ReefScan-ID`.
3. In Colab: **File → Open notebook → GitHub**, pick `GilbertOwen/reefscan-id`, open the notebook, and set the runtime to T4 GPU.
4. Work on your own branch, one feature per branch. Save from Colab with **File → Save a copy in GitHub** to that branch, then open a pull request for another member to review.
5. The notebooks load Coralscapes from the Drive folder `RawData`. If that folder is empty, the first run downloads about 5.9 GB into it.

## Team rules

- **AI log:** every time an AI tool helps, add a row to the AI usage log, which is kept outside the repo: date, part, what the AI did, key prompt, and how the output was checked. The brief makes this part of the grade.
- **Real results only:** never write a metric, result, figure or test outcome that was not produced by a run. The brief treats fabricated evidence as an integrity breach.
- **Interpretation is human-written:** the **Observation** cells and every conclusion in the report are written by the team member, not by AI.
- **Data hygiene:**
  - Make decisions from train and validation data only.
  - Use the test set once, at the end.
  - Never commit data or checkpoints; `.gitignore` blocks the usual files.
- **Credits:** cite both datasets as in `docs/data-licenses.md` in the report, the README and the app.

## Dataset gotchas

- **Coralscapes is about 5.9 GB.** Load it with `cache_dir` set to the Drive folder `RawData`; without `cache_dir` it downloads again in every new Colab session.
- **NOAA labels: take them from the folder name.** The dataset card's config sets `drop_labels: true` with paths that do not match the folders `train/CORAL`, `train/CORAL_BL` and so on, and `load_dataset` printed a warning that the `images` param was ignored. Whether `load_dataset` returns the labels was not tested, because the download in Colab was stopped after hours. Notebook 03 reads the Drive copy and takes split and label from the path.
- **Google Drive can hold two files with the same name in one folder.** The first upload of the NOAA folder left 4 extra copies in `train/CORAL`, which Colab showed with a ` (1)` suffix. They were moved to the Drive trash. After a fresh mount, the Drive listing matches the Hub file list exactly.
- **The old NOAA link** `akridge/NOAA-ESD-CORAL-Bleaching-Dataset` redirects to `NMFS-OSI/NOAA-PIFSC-ESD-CORAL-Bleaching-Dataset`; cite the new one.
- **NOAA's licence (Public Domain)** is stated only in the card text, not in the Hugging Face licence field.
- **Drive subfolders are `Checkpoints`, `Processed` and `RawData`** with capital letters; Colab paths are case-sensitive.
- **NOAA has no dead coral class.** The "dead" class in stage 2 comes only from Coralscapes patches.
- **The two datasets are different kinds of photo.** Coralscapes frames are diver video of the reef scene; NOAA patches come from photo-quadrat images taken at 1 m intervals along a transect line (NOAA InPort records 59195 and 67962). Expect domain shift between them; E3 measures it.
- **Gradio and Docker Spaces on Hugging Face now need a paid plan.** Only Static Spaces are free (Hub docs, read 2026-11-12).
- **Streamlit Community Cloud apps sleep after 12 hours without traffic** (Streamlit docs, read 2026-11-12).
