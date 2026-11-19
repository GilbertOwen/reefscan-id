# ReefScan-ID: team handoff

Status report for the team, written 2026-10-15 and updated 2026-11-12 for plan v2 and 2026-11-17 for plan v3 (the group's "Rencana Final Project ReefScan-ID, Draft v3"). Read this before starting any task.

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

Plan v3 (the group's "Rencana Final Project ReefScan-ID, Draft v3", 14 November 2026, adopted 2026-11-17) replaces the four weeks of plan v2 with three: W12 to W14. The plan assumes 14 November 2026 is about the end of W11; match the weeks to the real course week.

Done so far: setup, the Coralscapes EDA section 1, stage 1 (class mapping, SegFormer-B0 trained), the NOAA check, the stage 2 patch dataset (notebook 04) E3, the stage 2 data source comparison (notebook 05), and E2, the stage 2 baseline (notebook 06). See "Results so far".

| Week | Model and data | App and report |
|---|---|---|
| W12 | Class mapping, patch dataset, baselines and main models for E1 and E2 | Decide static or dynamic app; app skeleton with dummy output; batch upload |
| W13 | E3, E4, model export, core ablation | Integrate the real models, session summary and category, deploy; report draft |
| W14 | Error analysis, CAM, real photo test | Location and DHW if time allows, video under 5 minutes, submit |

Gates that still apply:
- best models picked on validation, then the test set used once;
- PyTorch and ONNX outputs match on the same images, and Python and JavaScript post-processing match, if the static app is used;
- the public link works; every number in the report traces to a run;
- checked against the rubric of the brief that applies (D1).

Cut first if time is short (plan v3): DHW, DINOv2, the colour correction ablation, the U-Net from scratch (replaced by a lighter baseline). E4, the per-session batch and the KepMenLH category are not cut.

## Experiments

| Experiment | What is compared | Metrics |
|---|---|---|
| E1. Segmentation (stage 1) | Small U-Net from scratch (or a lighter baseline if time is short) vs pretrained SegFormer-B0 (B2 if time allows) | mIoU, IoU of the coral class, IoU of the substrate class |
| E2. Patch classification (stage 2) | Frozen ResNet50 + logistic regression vs fine-tuned EfficientNet-B0 (DINOv2 optional, not deployed) | Macro-F1, per-class recall, confusion matrix |
| E3. Stage 2 data source | Train on NOAA only, Coralscapes patches only, or both; evaluate on both test sets | Macro-F1 per test set |
| E4. End to end | Direct 5-class SegFormer vs the cascade, on the 392 Coralscapes test photos, with the plan v3 points | MAE of live cover (T_live) and bleached share (P_bleached) per photo, and agreement of the KepMenLH category; ground truth from the true masks with the same points |

If the cascade is not better in E4, the result is reported as it is, with an analysis of why. Plan v3 adds an ablation on point density per photo (for example 30 points against more).

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

NOAA file names, section 2 of `notebooks/03_eda_noaa.ipynb` (commit c9dccd5): 1,379 of 1,385 NOAA validation patches share a site (first file name part) with train, and 1,249 share the first three parts; a random split of the same sizes gives about the same overlap. So NOAA validation is used as exploratory only (option c).

Stage 2 patches, `notebooks/04_stage2_patches.ipynb` (merged in pull request 4): 22,253 train patches (healthy 18,060, bleached 840, dead 3,353) and 2,320 Coralscapes validation patches (healthy 1,437, bleached 106, dead 777). NOAA packed into arrays: train 7,292, validation 1,562.

E3, stage 2 EfficientNet-B0, sections 3 and 4 of `notebooks/05_stage2_training.ipynb` (Colab, Tesla T4, 30 epochs per run, commits 1d0c67c, b7eb508, 87adb87, comparison 28f1feb). The best epoch of every run is picked on Coralscapes validation macro-F1; `best.pt` holds that epoch in all three runs, and all runs use the same Coralscapes validation set.

| Training data | Best epoch | Coralscapes val macro-F1 | Recall healthy | Recall bleached | Recall dead | NOAA val macro-F1 (exploratory) | Seconds per epoch |
|---|---|---|---|---|---|---|---|
| Coralscapes | 11 | 0.7713 | 0.884 | 0.585 | 0.773 | 0.572 | about 127 to 135 |
| NOAA | 15 | 0.2738 | 0.692 | 0.642 | 0.000 | 0.866 | about 51 |
| Both | 9 | 0.7743 | 0.884 | 0.689 | 0.722 | 0.856 | about 181 |

Test sets were not used. Interpretation is in Gilbert's Observation in the notebook.

E2, stage 2 baseline, `notebooks/06_stage2_baseline.ipynb` (Colab, Tesla T4, commit c620d85). Frozen ResNet50 (`IMAGENET1K_V1`, pooled 2048-d features, cached in `Processed/stage2_features/resnet50`) plus a logistic regression (`class_weight="balanced"`, standardised features), trained on the Coralscapes patches only. C was picked from 1e-4 to 1 on Coralscapes validation macro-F1 and is not at the edge of the grid. Same Coralscapes validation set as E3.

| Model | Coralscapes val macro-F1 | Recall healthy | Recall bleached | Recall dead |
|---|---|---|---|---|
| ResNet50 frozen + logistic regression, C 0.001 | 0.6641 | 0.743 | 0.651 | 0.779 |
| EfficientNet-B0 fine-tuned, 'coralscapes' run, best epoch 11 | 0.7713 | 0.884 | 0.585 | 0.773 |

Feature extraction took 76 s for train and 9 s for validation; the five logistic regression fits took about 5 minutes in total. Test sets were not used.

E1, stage 1 baseline, `notebooks/07_stage1_baseline.ipynb` (Colab, Tesla T4, 50 epochs, about 203 s per epoch, commit e9c65f1). U-Net from scratch, 4 levels, base width 32, AdamW 1e-3 with linear decay; same class mapping, crops and weighted loss as notebook 02. Both models are picked by best validation mIoU on the 166 Coralscapes validation photos resized to 512 by 1024; `best.pt` holds the best epoch for both.

| Model | Parameters | Epochs | Best epoch | mIoU | Coral IoU | Substrate IoU | Other IoU |
|---|---|---|---|---|---|---|---|
| U-Net from scratch | 1,927,075 | 50 | 39 | 0.5944 | 0.4773 | 0.5957 | 0.7102 |
| SegFormer-B0 pretrained | 3,714,915 | 50 | 37 | 0.6775 | 0.6284 | 0.6733 | 0.7309 |

Test sets were not used.

Test data, `notebooks/08_test_data.ipynb` (commits 90da88c, 16868c8), cut and saved only, nothing evaluated. Coralscapes test patches with the notebook 04 settings read from `settings.json`: 3,956 patches from 328 of 392 photos (healthy 2,926, bleached 284, dead 746), in `coralscapes_test_128.npy`, `coralscapes_test_256.npy` and `coralscapes_test_manifest.csv`; no test patch is byte-identical to a train or validation patch. NOAA test: 1,565 images (healthy 974, bleached 591) in `noaa_test_224.npy` and `noaa_test_manifest.csv`; no file name is shared with train or validation, but 1,554 test images share a site (first name part) with train, as validation does.

Direct 5-class SegFormer-B0 for E4 (a), `notebooks/09_stage1_direct5.ipynb` (Colab, NVIDIA L4, 8 loader workers, about 33 s per epoch, 50 epochs, commit d8107cd). Same optimiser, crops and weighting formula as notebook 02 (weights: healthy 0.144, bleached 3.681, dead 0.963, substrate 0.110, other 0.102). Best epoch 25 by validation mIoU; `best.pt` holds it. On the 166 validation photos resized to 512 by 1024:

| Model | Best epoch | mIoU | Healthy | Bleached | Dead | Substrate | Other |
|---|---|---|---|---|---|---|---|
| Direct 5 classes | 25 | 0.5054 | 0.5102 | 0.4030 | 0.2390 | 0.6276 | 0.7473 |

| Model | mIoU | Coral | Substrate | Other |
|---|---|---|---|---|
| Direct 5 classes, merged to 3 | 0.6518 | 0.5816 | 0.6276 | 0.7463 |
| SegFormer-B0 3 classes, stage 1 (epoch 37) | 0.6775 | 0.6284 | 0.6733 | 0.7309 |

Test sets were not used.

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
| 2026-11-17 | Plan v3 adopted (the group's Draft v3, 14 November 2026). The rows below record what it changes; the v2 rows they amend stay as written | Group, as told by Gilbert |
| 2026-11-17 | Point sampling (replaces sampling inside the coral mask only): the app and E4 put points on a stratified grid over the whole seabed (coral and substrate), after the UPT method's 30 random points per frame. Points on substrate count as substrate; only points on coral go to stage 2; "other" (fish, water, tools) is not counted | Group, in plan v3; adoption told by Gilbert |
| 2026-11-17 | Unit of analysis: one dive session, many photos uploaded together. Per-photo results are details; the main output is the session average | Group, in plan v3; adoption told by Gilbert |
| 2026-11-17 | Health label (answers D10): live cover T_live = (healthy + bleached points) / seabed points; bleached share P_bleached = bleached / (healthy + bleached), shown separately as a warning. Category by Keputusan Menteri Negara LH No. 04 Tahun 2001 on % live cover: Buruk 0 to 24.9, Sedang 25 to 49.9, Baik 50 to 74.9, Baik sekali 75 to 100. The app says this is a rough estimate, not an official survey | Group, in plan v3; adoption told by Gilbert |
| 2026-11-17 | E4 metric (amends the 2026-11-12 experiments row): MAE of T_live and P_bleached per photo plus category agreement, on the 392 Coralscapes test photos, ground truth from the true masks with the same points. E1 adds substrate IoU | Group, in plan v3; adoption told by Gilbert |
| 2026-11-17 | Deploy (amends the 2026-11-12 app and deploy row): a static web app with ONNX in the browser only if the rubric does not require a backend, API or server and one member is comfortable with JavaScript; otherwise Streamlit Community Cloud with a limit on photos per batch | Group, in plan v3; adoption told by Gilbert |
| 2026-11-17 | Timeline and cuts (replaces the W11 to W14 timeline): W12 to W14. Cut first: DHW, DINOv2, the colour correction ablation, the U-Net from scratch (lighter baseline instead). Not cut: E4, the per-session batch, the KepMenLH category. Optional: location from photo EXIF or a map, and NOAA Coral Reef Watch DHW at that location | Group, in plan v3; adoption told by Gilbert |
| 2026-11-18 | E2 data: the frozen ResNet50 + logistic regression baseline trains on Coralscapes patches only and is compared with the 'coralscapes' EfficientNet-B0 run of E3 (best epoch 11), so only the model differs; scored on Coralscapes validation, test set not used | Gilbert |
| 2026-11-18 | E1 baseline: a small U-Net from scratch, 4 levels, base width 32, against SegFormer-B0 (best epoch 37) on Coralscapes validation; same class mapping, crops and weighted loss as notebook 02. Training budget set from a T4 timing cell, at most 50 epochs, so the U-Net may train fewer epochs than SegFormer-B0's 50; the E1 table reports the epochs of each | Gilbert |
| 2026-11-19 | Direct SegFormer for E4 (a) has 5 classes: coral healthy, coral bleached, coral dead, substrate, other, using the stage 2 state map for the coral ids and the stage 1 map for the rest. Millepora and Turbinaria pixels get the ignore label (255) in training and evaluation, as in stage 2, not healthy | Gilbert |
| 2026-11-19 | E4 protocol frozen after the validation run of notebook 10 section 1: stage 2 'both' (epoch 9), stage 1 epoch 37, direct epoch 25; 30 points per photo on a 5 by 6 grid, one random point per cell, seed 0; points whose true label is ignored are dropped for the truth and both methods; the outer 128 px border is not sampled, so results describe the photo interior; metrics MAE of T_live and P_bleached plus KepMenLH category agreement, a photo counting only where truth and method both have the value. Point-density ablation: 60 points (6 by 10 grid, same rules) as a predefined secondary analysis, checked on validation first; 30 points is the primary result and no density is picked from test results. The test set is run once with this protocol | Gilbert |

Change a decision only after the group agrees, and add a new row instead of editing an old one.

## Open questions

- **Which brief applies (D1), now urgent.** The 2025/26 brief weights app 40%, report 40% and video 20%. The 2026/27 brief weights data preparation 20, model 20, analysis 20, real-world suitability 15, app 15 and AI usage 10, and has no video. Plan v3's rubric mapping (app 40%, report 40%) assumes the first.
- **Image-only evaluation (D5).** If the 2026/27 brief applies, its section 17 asks for lecturer approval of any alternative to user testing.
- **Lecturer checks:**
  - Are pretrained models and non-Indonesian data accepted?
  - Does a static web app with inference in the browser count as the app deliverable?
  - What is the current course week?
- **Static or Streamlit app:** decided by the deploy rule above (does the rubric need a backend, and is one member comfortable with JavaScript). If static: GitHub Pages, Vercel or a Hugging Face Static Space.
- **Roles:** who takes which part.

## Work that is open now

Under plan v3. Agree in the group who takes what.

1. **Stage 2 E3:** done (see "Results so far"); the test-set evaluation of E3 waits for the end, with the other test runs.
2. **Baselines:** E1 and E2 done (see "Results so far").
3. **Direct 5-class SegFormer** for E4 (a): done (see "Results so far").
4. **Test data:** done, not evaluated (see "Results so far").
5. **E4 notebook** with the plan v3 points and formulas, on the 392 test photos, used once.
6. **App:** decide static or Streamlit, then a skeleton with dummy output and batch upload; later the session summary with the KepMenLH category.
7. **Lecturer questions** listed above.

Claims in plan v3 that are not verified yet; check them before they go into the report:
- NOAA photos taken 1 m above the bottom (the NOAA InPort records say one photo every 1 m along a 30 m transect; the height was not found);
- Hadi et al. (2020), the LIPI 2019 figures;
- Razak et al. (2026), marked unchecked in v3 itself;
- "at least 82 countries exposed to bleaching-level heat";
- the UPT frame of 58 x 44 cm with 30 points in CPCe (Giyanto 2013, 2014);
- how COREMAP counts bleached coral, marked unchecked in v3 itself.

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
