# ReefScan-ID

Coral reef health estimation from underwater photos with deep learning. Final project for COMP6826001 Deep Learning, BINUS University, odd semester 2026/2027.

A diver photographs the reef. ReefScan-ID finds the coral in the photo, checks points inside it as healthy, bleached or dead, and shows the percentages in a web app that runs the models in the browser.

## Status

Phase P1 of plan v2 (adopted 2026-11-12). No models have been trained yet. Team members start with [docs/handoff.md](docs/handoff.md); AI assistants with [AGENTS.md](AGENTS.md).

## How it works

| Stage | Task | Model | Data |
|---|---|---|---|
| 1 | Segment the photo into coral / substrate / other | SegFormer-B0 | Coralscapes |
| 2 | Classify points inside the coral mask as healthy / bleached / dead | EfficientNet-B0 | Patches cut from Coralscapes, plus NOAA PIFSC ESD Coral Bleaching for healthy vs bleached |

The app samples points on a grid inside the coral mask, classifies a patch around each point, and reports the share of healthy, bleached and dead points. Both models are exported to ONNX and run in the browser, so photos are not sent to a server.

## Repository layout

| Folder | Contents |
|---|---|
| `notebooks/` | Colab notebooks: EDA, training, evaluation, ONNX export |
| `src/` | Shared Python code (data loading, models, metrics) |
| `app/` | Web app (static site, ONNX models run in the browser) |
| `docs/` | Project documents, including the data licence table |

Raw data, processed data and model checkpoints are not stored in this repository. They live in Google Drive or are loaded from Hugging Face.

## Data sources and licences

| Dataset | Source | Licence |
|---|---|---|
| Coralscapes (EPFL) | [huggingface.co/datasets/EPFL-ECEO/coralscapes](https://huggingface.co/datasets/EPFL-ECEO/coralscapes) | Apache-2.0 |
| NOAA PIFSC ESD Coral Bleaching Classification Dataset v1 | [huggingface.co/datasets/NMFS-OSI/NOAA-PIFSC-ESD-CORAL-Bleaching-Dataset](https://huggingface.co/datasets/NMFS-OSI/NOAA-PIFSC-ESD-CORAL-Bleaching-Dataset) | Public Domain (NOAA Open Data) |

Details, citations and how each dataset is used: [docs/data-licenses.md](docs/data-licenses.md).

## AI usage

AI assistance is recorded in [ai-log.md](ai-log.md).
