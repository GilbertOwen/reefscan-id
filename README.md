# ReefScan-ID

Coral reef health estimation from underwater photos with deep learning. Final project for COMP6826001 Deep Learning, BINUS University, odd semester 2026/2027.

ReefScan-ID estimates how much of a reef photo is live coral, bleached coral, dead coral and substrate, and shows the result in a web app.

## Status

Setup phase. No models have been trained yet.

## Modules

| Module | Task | Dataset |
|---|---|---|
| A | Semantic segmentation and % cover per photo | Coralscapes |
| B | Healthy vs bleached coral patch classification | NOAA PIFSC ESD Coral Bleaching |

## Repository layout

| Folder | Contents |
|---|---|
| `notebooks/` | Colab notebooks: EDA, training, evaluation |
| `src/` | Shared Python code (data loading, models, metrics) |
| `app/` | Streamlit demo app |
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
