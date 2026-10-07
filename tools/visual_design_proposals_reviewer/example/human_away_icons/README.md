# Worked example: the Human Away icon review

`review.md` is the manifest of the live review
`vs-code-extensions/home-made/human-away/icons preview/`: 37 proposals across 5 themes, 3 reusable
element tiles, 4 lots and the 7-letter elimination seed. It is the file the tool reads on every
build; the pages themselves are output, never input.

## Regenerate this manifest

`export_human_away_review.py` rebuilds `review.md` from the captured reference page plus the data of
the builder this review used before the migration, so the example is reproducible instead of
hand-typed:

```
python3 export_human_away_review.py \
  --generator /home/nicolas/agents/.ai_baseline/one_shot/archive/icon_gen/make_icon_gallery.py \
  --reference ../reference/preview_75bb94825b6f.txt \
  --out review.md
```

It prints `EXPORT groups=11 entries=37 elements=3 eliminations=7 tokens=f4e227ba`,
`EXPORT validate findings=0`, `MANIFEST roundtrip=yes` and `EXPORT_DONE`. Round-trip means: parse the
manifest, write it back, compare bytes - so what a reviewer edits by hand stays editable.

## Build the review

```
cd /home/nicolas/agents/vs-code-extensions/tools/visual_design_proposals_reviewer
python3 visual_design_proposals_reviewer.py --review "/home/nicolas/agents/vs-code-extensions/home-made/human-away/icons preview"
```

`--dry-run` first if the folder holds work you did not stage: the tool only writes when bytes
change, and it refuses to write at all when a gate fails.

## The fixtures in `example/reference/`

`preview_75bb94825b6f.txt` and `preview_check_cachebust.txt` are the two pages as the retired
builder last produced them (sha256 of the first is the plan's migration oracle `75bb94825b6f...`).
They carry a `.txt` suffix because they are input for `--compare`, not code the tool ships: a `.html`
file in the package invites an editor, and an editor can save a captured page back over the real
review. `preview_check_cachebust.txt` is byte-identical to the other capture; it is kept because the
project gate script stages that file next to the page.

## Why the independence scan reports `INDEP_DOCS`

The scan separates prose from code: only code hits count as a dependency, and it prints
`INDEP_CODE 0` with `STDLIB_ONLY yes` and `INDEPENDENT yes 0` for this package. The doc lines it also
lists (`INDEP_DOCS 14` measured on 2026-10-07) are documentation doing its job: the tool README naming
the archive folder the retired builder lives in, this README doing the same, and the review's own
footer link to `ai-automation-tools/plans/PLAN_HUMAN_AWAY_ICON_ACTION.md` reproduced faithfully in the
manifest and in both captured reference pages. Deleting those mentions would cost a reader the restore
recipe and would rewrite a reviewed page for a scanner cosmetic, so they stay and are reported.
