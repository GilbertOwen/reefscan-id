# Data sources and licences

Facts below were checked on the Hugging Face dataset cards and the Hugging Face API on 2026-10-12. How the images were taken was checked on 2026-11-12 in the Coralscapes paper and in NOAA's InPort metadata records.

## Coralscapes

| Item | Value |
|---|---|
| Source | [huggingface.co/datasets/EPFL-ECEO/coralscapes](https://huggingface.co/datasets/EPFL-ECEO/coralscapes) |
| Licence | Apache License 2.0 |
| Content | 2,075 images at 1024×2048 with pixel masks, 39 benthic classes, 35 dive sites in 5 countries in the Red Sea (Djibouti, Eritrea, Sudan, Jordan, Israel) |
| How taken | Frames from GoPro Hero 10 video, recorded by divers during transect surveying campaigns (paper, section 3.1) |
| Splits | train 1,517 images (27 dive sites), validation 166 (3 sites), test 392 (5 sites) |
| Size | about 5.9 GB download (parquet) |
| Used for | Main dataset: stage 1 segmentation training, source of the stage 2 patches (healthy / bleached / dead), and the only end-to-end test set |

Citation:

> J. Sauder, V. Domazetoski, G. Banc-Prandi, G. Perna, A. Meibom and D. Tuia, "The Coralscapes Dataset: Semantic Scene Understanding in Coral Reefs," arXiv:2503.20000, 2025.

Apache-2.0 allows use and modification, provided the licence and attribution are kept and changes are stated. This project credits the dataset in the report, this repository and the app.

## NOAA PIFSC ESD Coral Bleaching Classification Dataset v1

| Item | Value |
|---|---|
| Source | [huggingface.co/datasets/NMFS-OSI/NOAA-PIFSC-ESD-CORAL-Bleaching-Dataset](https://huggingface.co/datasets/NMFS-OSI/NOAA-PIFSC-ESD-CORAL-Bleaching-Dataset) |
| Licence | Public Domain (NOAA Open Data), as stated in the dataset card text. The Hugging Face licence field is empty |
| Content | 10,419 patches at 224×224, 2 classes: CORAL (healthy hard coral) and CORAL_BL (bleached hard coral). Hawaiian Archipelago, 2014–2019 |
| How taken | Benthic photo-quadrat surveys: 30 photo-quadrat images per site, taken at 1 m intervals along a 30 m transect line (NOAA InPort records [59195](https://www.fisheries.noaa.gov/inport/item/59195) and [67962](https://www.fisheries.noaa.gov/inport/item/67962)). Patches were sampled on a 2×5 stratified grid (dataset card) |
| Splits | train 7,292, validation 1,562, test 1,565 |
| Used for | Support for stage 2: extra healthy vs bleached examples. It has no dead coral class, so "dead" comes only from Coralscapes |

Citation, as given in the dataset card:

> Pacific Islands Fisheries Science Center (2025). Ecosystem Sciences Division (ESD). NOAA ESD Coral Bleaching Classification Dataset v1.

The two datasets come from different photo domains: Coralscapes frames are diver video of the reef scene, while NOAA patches come from close-range quadrat photos of the seabed. The report treats this as a source of domain shift.

The dataset card states that the repository is a scientific product and not an official NOAA communication, and that NOAA's name or logo must not be used to imply endorsement.

## Not used

The reef soundscape recordings (Zenodo 14841479) were dropped from scope on 2026-10-14 and left as future work.
