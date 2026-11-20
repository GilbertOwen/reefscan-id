# ReefScan-ID: brief for the app builder

This file is for someone who builds the ReefScan-ID app without having worked on the models. It says what the app must do, how the models expect their input, and where the code and checkpoints are. Every setting below is copied from `notebooks/10_e4_end_to_end.ipynb`, the notebook that ran the final test. For the project as a whole, read [handoff.md](handoff.md).

## What the app does

A diver uploads the photos of one dive session. For each photo the app estimates how much of the seabed is live coral and how much of that coral is bleached, and gives a reef health category. The main result is the session average; the per-photo results are the details (plan v3, 2026-11-17 decision row).

| | Shown to the user |
|---|---|
| Per photo | The coral overlay, the points coloured by label, T_live, P_bleached and the category |
| Per session | The average over the photos |
| Always | A note that the category is a rough estimate, not an official survey |

## The pipeline: the cascade

The app runs the cascade: stage 1 finds the coral, stage 2 labels each coral point. A third model (the direct 5-class SegFormer) exists only as the comparison in E4 and is not part of the app, unless the group decides otherwise.

### 1. Prepare the photo
- The models were run on Coralscapes photos of **1024 by 2048** pixels (height by width). The points and patches below are placed in that full-size photo.
- Convert to RGB, scale the pixel values to 0 to 1 (divide by 255), then normalise each channel with the ImageNet values:
  - mean `[0.485, 0.456, 0.406]`
  - std `[0.229, 0.224, 0.225]`

### 2. Stage 1: where is the coral
- Resize the photo to **512 by 1024** (bilinear), normalise as above, and run the stage 1 SegFormer-B0.
- Upsample its output (the logits) back to 1024 by 2048 with bilinear interpolation, then take the class with the highest score per pixel.
- Class order: `0 coral`, `1 substrate`, `2 other`.

### 3. Place the points
- 30 points per photo on a grid of 5 rows by 6 columns, one random point inside each cell.
- The outer **128 px** border is not sampled: the grid covers the photo minus 128 px on every side.
- The notebook uses a fixed random seed (seed 0 plus the photo's index) so the same photo always gets the same points. Whether the app keeps a fixed seed is the app builder's choice.

### 4. Stage 2: label the coral points
- Look up the stage 1 class at each point. Substrate points count as substrate, "other" points are not counted, coral points go to stage 2.
- For each coral point, cut a **128 by 128** patch centred on it from the full-size photo (before any resize), scale to 0 to 1, resize to **224 by 224** (bilinear), normalise with the same ImageNet values, and run the stage 2 EfficientNet-B0.
- Class order: `0 healthy`, `1 bleached`, `2 dead`.

### 5. Compute the scores
With the counts of healthy, bleached, dead and substrate points:
- seabed points = healthy + bleached + dead + substrate
- **T_live** (live cover) = 100 × (healthy + bleached) / seabed points
- **P_bleached** (bleached share) = 100 × bleached / (healthy + bleached)
- If there are no seabed points, T_live has no value; if there is no live coral, P_bleached has no value. Show "not enough data" instead of 0.

Example: 6 healthy, 2 bleached, 4 dead, 8 substrate gives 20 seabed points, T_live 40%, P_bleached 25%.

### 6. Give the category
From T_live, by KepMenLH No. 04/2001:

| T_live | Category |
|---|---|
| below 25 | Buruk |
| 25 to below 50 | Sedang |
| 50 to below 75 | Baik |
| 75 and above | Baik sekali |

## Checkpoints

On the shared Google Drive folder `ReefScan-ID`; ask Gilbert for access. Each file is a PyTorch dictionary; the weights are under the key `"model"`.

| Model | File | How to rebuild it before loading |
|---|---|---|
| Stage 1, SegFormer-B0, 3 classes, epoch 37 | `Checkpoints/stage1_segformer_b0/best.pt` | `SegformerForSemanticSegmentation.from_pretrained("nvidia/mit-b0", num_labels=3, ignore_mismatched_sizes=True)` |
| Stage 2, EfficientNet-B0, "both" run, epoch 9 | `Checkpoints/stage2_efficientnet_b0/both/best.pt` | torchvision `efficientnet_b0(weights=None)`, with `classifier[1]` replaced by a `Linear` layer with 3 outputs |
| Direct 5 classes, epoch 25 (comparison only) | `Checkpoints/stage1_direct5/best.pt` | as stage 1, with `num_labels=5` |

The working loading code is in the model cells of notebook 10.

## Where the code is

| What | Where |
|---|---|
| Loading the models, preparing photos and patches, placing points, the formulas | `notebooks/10_e4_end_to_end.ipynb`, section 1 |
| How stage 1 was built and trained | `notebooks/02_stage1_segmentation.ipynb` |
| How stage 2 was built and trained | `notebooks/05_stage2_training.ipynb` |
| How well each model scored | "Results so far" in [handoff.md](handoff.md) |

## Still to decide (by the group)

- **Static app or Streamlit.** The plan v3 rule: a static web app with the models in the browser (exported to ONNX) only if the course rubric does not require a backend and someone is comfortable with JavaScript; otherwise Streamlit Community Cloud with a limit on photos per batch.
- **Photos that are not 1024 by 2048.** The models were only run on Coralscapes photos of that size. Resizing an uploaded photo to 1024 by 2048 first keeps every setting above the same, but that is not decided or tested.
- **How the session average is taken:** the mean of the per-photo values, or all points of the session pooled. Not recorded.

## Checks before the app is trusted

- If the models are exported to ONNX: the PyTorch and ONNX outputs must match on the same photos.
- If the post-processing is rewritten (for example in JavaScript): its points, counts, T_live, P_bleached and category must match notebook 10 on the same photos.
- The validation photos and the files in `Processed/e4` can serve as the reference. Do not run anything new on the test photos; the test set has already been used once.
