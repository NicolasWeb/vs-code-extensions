# How to review a round

Aim: finish a round of visual proposals without ever editing the page by hand. The page is a build
product; `review.md` is the review's truth.

## 1. Open the right file

Open `preview.html` in the review folder (double-click, or serve the folder). It reads the drawings
from the folder, so the drawings must stay on disk. `preview_single.html` is the same page with the
drawings inside it: use it to send the round to someone, or to read it offline; its cache token is
already frozen, so it is never the file you edit.

Each card shows:

- one surface per declared background, at the reference size, each labelled with background and size;
- a strip of the other declared sizes, so a drawing is judged small as well as large;
- the title, the description, then the review note when the manifest carries one;
- an "eliminate" control and a "final version" badge; the badge reads *Version de travail* until the
  card is marked final;
- in the header, the review's lots, notes and guide lines, and the counters `kept / gone / final`.

## 2. Triage in the page

The page's state is your browser's, keyed by the review's `prefix-local`, so two reviews on one
machine never mix and a reload keeps your work:

- `Éliminer <id>` moves the card to the eliminated section at the bottom, with a diagonal band over
  it. `Cacher les versions éliminées` hides them while you work. The bulk buttons are scoped to the
  section you are looking at.
- The badge toggles *Version de travail* / *Version finale*. Only a final card counts in the
  `final` counter.
- Nothing here touches `review.md`. Browser state is a working view of the round, not its record.

## 3. Record the decisions in `review.md`

When the round is settled, write it down in the manifest:

- tick the entry's checkbox when its version is **finished and verified**. Unchecked means work in
  progress. A checkbox is never an elimination, and there is no `final:` field: the box is it.
- add the letter of each rejected proposal to `## eliminations`, one per line (`E`). Letters you
  reinstate go in the same list with a plus (`+K`), which reopens a card a reader had eliminated in
  the page.
- edit `description`, `note`, `lot`, `tags` freely; the manifest outranks any wording an older page
  still shows.

The letters under `## eliminations` are a **first-visit seed**, never a record of the decision.
Once the reader touches a cross, his own browser list is his truth for the rest of the round.
Neither a rebuild nor a changed seed overwrites it, and no page control re-applies the manifest.
This round ships 7 seed letters; the reviewer's own page held 17 eliminations in `localStorage`.
Making his browser list canonical is **his** arbitration, never a page or tool default.

Then rebuild:

```bash
python3 ../visual_design_proposals_reviewer.py --review .
```

Reading and writing `review.md` is byte-stable, so the only lines in your diff are the lines you
changed (`MANIFEST roundtrip=yes`).

## 4. Read the verdict

The build prints its verdict and keeps a copy in the tool's `output/` folder. What matters:

| token | read it as |
| --- | --- |
| `VDPR_OK` + `GATES ok` | the rendered candidate and applicable rule-pack checks passed; preview modes do not write review pages |
| `IDEMPOTENT preview=yes` | rebuilding again changes nothing (a `no` after a real edit is expected, the next build flips it back) |
| `SINGLE_FILE_BUDGET <kib>` | the size of the send-along page |
| `SEED_ELIMINATIONS <n>` | how many cards the manifest put in the eliminated section |
| `CHECKED <n>` | how many cards start the round already final |
| `MANIFEST roundtrip=no` | stop: the manifest did not survive a read/write cycle byte for byte; the reviewer does not write pages |
| `RULE_PACKS_PREVIEW_UNVERIFIED` | a preview target differs from the candidate, so a rule pack that reads the existing page cannot certify that candidate |
| `RULE_PACK_MISSING`, `RULE_PACK_ERROR`, `RULE_PACK_FAILED` | stop: a declared rule pack is missing, could not run, or returned nonzero |
| `MANIFEST_CHANGED_DURING_RUN`, `ASSETS_CHANGED_DURING_RUN`, `PAGE_CHANGED_DURING_PREVIEW`, `PAGE_CHANGED_AFTER_BUILD` | stop: a checked input or target changed during the run |
| `REPORT_ERROR` | stop: the report could not be saved; inspect the page-write count before retrying |
| `BROKEN_REFS`, `UNSHOWN_FILES` | a drawing is missing from the folder, or the page never shows one it holds |
| `CARD_SURFACES`, `CARD_SIZE_CELLS` | a card does not show every background or every declared size |
| `XML_FAIL`, `EMPTY_ASSET` | a drawing file is corrupt or empty |
| `VDPR_FAIL` | validation or a rule pack failed; inspect the accompanying detail tokens |

A failing gate or rule pack exits nonzero. Universal gates and rule-pack file preflight precede reviewer writes, but rule packs run after a normal build and can fail after pages have changed; inspect `BUILD written=<n>` and preserve existing pages before an authorized build.

## 5. When the page was edited outside the tool

If someone hand-edited a page (or a round came back as HTML), don't merge by eye:

```bash
python3 ../visual_design_proposals_reviewer.py --review . --compare chemin/vers/page_recue.html
```

It prints `EQUIVALENT yes|no` plus one `DELTA <kind> <id>` line per real difference, over the surface
Whitespace and comments are not differences: a probe of the shipped page (`cosmetic_probe.py`)
showed added comments, blank lines, attribute spacing inside a tag, a space after a `>` and a CSS
comment all still answer `EQUIVALENT yes`. Anything that changes a tile's own markup shape or wording
is: removing a card, swapping two neighbours, editing copy, or splitting a size strip by inserting a
space inside its markup answer `EQUIVALENT no` with a `DELTA` line (`E2E_SABOTAGE yes`).
you actually read: language, titles, order of sections and cards, the image each background shows,
eliminated class, final badge, counters. Copy wording can come back out of a received page; the
manifest still outranks it, so fold the deltas into `review.md` and rebuild rather than shipping the
received file.

## 6. Rules the tool cannot know

Icon reviews carry rules no generator can infer (a plate never over text, a hole close to the top
edge, legibility at a declared size). Those live next to the review as small checker scripts named
by the manifest's `verifications:` bullet. The tool runs them after its own gates and prints their
verdicts under `RULE_PACKS`. A layout or colour-set review simply declares no pack and is never
forced through icon rules.

## 7. Habits that keep a round cheap

- Rebuild with `--check` while you are still editing the manifest: it judges without writing any
  review file (the report is still written, so the verdict stays auditable).
- One build per decision lot, and read the tokens each time; `CACHE_TOKEN` changing tells you a
  drawing really changed.
- Never edit `preview.html` or `preview_single.html` by hand: the next build overwrites them, and
  `--compare` is how a stray edit gets absorbed instead.
- If you only need the offline page, `--single-file preview_single.html` builds just that one.
- `--export <folder>` produces a self-contained copy of the review to hand over or archive.
