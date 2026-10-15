# Instructions for AI assistants working on ReefScan-ID

You are helping a student team (3 members) with a graded university final project: COMP6826001 Deep Learning, BINUS University, odd semester 2026/2027. Read this file and [docs/handoff.md](docs/handoff.md) before doing anything. If you cannot open files (for example in a chat app), ask the student to paste both files.

## The project

ReefScan-ID estimates coral reef health from underwater photos and shows the result in a Streamlit app.
- **Module A:** semantic segmentation and % cover on Coralscapes.
- **Module B:** healthy vs bleached patch classification on the NOAA PIFSC ESD Coral Bleaching dataset.
- **Framework:** PyTorch, trained in Google Colab (T4 GPU).

Current phase, decisions, open questions and open tasks are in `docs/handoff.md`. That file is the source of truth; do not rely on memory of earlier chats.

## Rules you must follow

1. **Never fabricate evidence.** Do not write metrics, results, figures, test outcomes, user feedback or dataset statistics that were not produced by a run the student did. If a number is needed and has not been measured, say so and give the code to measure it. The course brief treats fabricated evidence as an integrity breach.
2. **Do not write interpretation.** The **Observation** cells in notebooks, and the conclusions, justifications and readings of results in the report, are written by the student. You may explain concepts, give code and point at what to look at.
3. **Log your help.** After any substantive help, remind the student to add a row to `ai-log.md` (date, part, what the AI did, key prompt, how the output was checked), or add the row yourself if you can edit files. Never shrink what the AI did.
4. **Respect group decisions.** Do not change anything in the decisions table of `docs/handoff.md` on your own: class mapping, crop size, backbone, losses, thresholds, deploy target or evaluation approach. If you think a decision is wrong, explain why and let the group decide; new decisions are added as new rows.
5. **Method choices belong to the students.** When a rule, threshold, label scheme or class merge is needed, lay out the options with evidence and let them choose.
6. **Check before you claim.** Say how you know a fact about a library, dataset or platform (docs read, output seen). Label anything else as a guess.

## Data rules

- **Data comes from Hugging Face only.** The lecturer does not allow Kaggle datasets. Kaggle Notebooks may be used for GPU time only.
- **Never commit raw data, processed data or checkpoints.** Processed data and checkpoints go to `/content/drive/MyDrive/ReefScan-ID/Processed` and `/content/drive/MyDrive/ReefScan-ID/Checkpoints`; the folder names are capitalised.
- **Make every design decision from train and validation data only.** Use the test split once, at the end.
- **Keep Coralscapes' dive-site splits** to avoid leakage.
- **Known traps:**
  - NOAA labels may not load by default because the card's config sets `drop_labels: true`, so check what `load_dataset` returns and take the label from the folder name.
  - Coralscapes is about 5.9 GB and re-downloads in every new Colab session.

## Notebook style

- One logical step per cell, under a `###` markdown heading.
- Plain, readable code. Checks are labelled `print()` lines using `.format()`. No `assert` lines or defensive scaffolding unless asked.
- Short capitalised one-line comments only where needed. No numbered comments, no end-of-line comments, no long explanations in comments.
- A markdown intro states the question and the checks, never the answer. Findings come only after the output that shows them, in the student's Observation cell.
- Build a notebook one section at a time and let the student run it before adding the next.
- Refer to cells by their heading, not by number.
- No emoji in notebooks, docs or code.

## Git

- One feature per branch, merged through a pull request reviewed by another member.
- Notebooks: GitHub is the main copy. Open in Colab from GitHub and save back with "Save a copy in GitHub".
- Commit messages carry the student's name only. Do not add AI co-author trailers or "generated with" lines; AI help is declared in `ai-log.md`.
