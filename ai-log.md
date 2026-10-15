# AI usage log: ReefScan-ID (COMP6826001 Deep Learning)

One row per AI use. Copy into the report's AI Usage Declaration. Fill in the last column ("How the output was checked") yourselves when you check the output.

| Date | Part | What the AI did | Key prompt | How the output was checked |
|---|---|---|---|---|
| 2026-09-10 to 2026-09-25 | Topic search (superseded) | Claude (Claude Code) suggested non-Kaggle datasets and project ideas, and drafted a fruit ripeness proposal (`Proposal_Fruit_Shelf_Life.docx`). That topic was later dropped for ReefScan-ID and the draft was deleted on 2026-10-14 | "find dataset not from kaggle", "rewrite the proposal" | |
| 2026-10-12 | Project notes | Claude extracted the ReefScan-ID plan PDF into the project notes, and checked both Hugging Face dataset cards (size, classes, splits, licence) and the NOAA bleaching press release | "masukkan ke vault untuk informasinya. Extract informasi." | |
| 2026-10-14 | Development plan | Claude proposed the development phases (F0 to F8) and options for decisions D1 to D11 with a recommendation each; Gilbert accepted the recommendations except D1 (deferred) and D5 (his own choice: image-only evaluation) | "Buatkan phase pengembangan terkait aplikasi ini dong dan decision making nya." | |
| 2026-10-14 | F0 setup | Claude created the repo folders, `README.md`, `docs/data-licenses.md` (from the dataset cards checked on 2026-10-12) and `.gitignore`, and made the first local git commit | "go, Q1 hapus saja, Q2 b, Q3 tidak usah dulu" | |
| 2026-10-14 | F2 plan and EDA notebook | Claude proposed the F2 plan and wrote `notebooks/01_eda_coralscapes.ipynb` up to section 1 (Colab setup, load, split counts, image and mask sizes). The observation cell is left for the team | "go, D12 a" | |
| 2026-10-15 | Team handoff | Claude read the run notebook from Drive, copied it into the repo, wrote `docs/handoff.md` (status, decisions, open work, how to start) and `AGENTS.md` (rules for the team's AI assistants), and updated the README status | "Saya mau memberikan report terkait aplikasi ini dan progress nya ... Berikan report untuk AI mereka juga ya" | |
