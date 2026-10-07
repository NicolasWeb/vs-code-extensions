# Worked example

This folder holds no copy of a review: a review is a folder of its own, and copying one here would
freeze a round that is still being decided.

The example this tool was generalised from is the **Human Away door-hanger icon review**, in this
repository:

```
vs-code-extensions/home-made/human-away/icons preview/
├── preview.html                 # the round a reviewer reads today
└── *.svg                        # the proposals, one file per drawing
```

Today that page is still produced by the hand-written generator it came from; its drawings and its
review state are the oracle the tool was measured against. Migrating that folder to a `review.md`
manifest is the next lot of the plan: the export that turns the generator's data into `review.md`
will live here as a script, so the example stays reproducible rather than hand-typed.

To see the tool work without touching that folder, point it at a review folder of your own:

```bash
python3 ../visual_design_proposals_reviewer.py --review /chemin/vers/ma-revue
```

`../README.md` describes the manifest; `../docs/HOW_TO_REVIEW.md` describes a round.
