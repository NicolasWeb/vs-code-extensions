# Visual design proposals reviewer

Builds a visual-design review page out of a Markdown manifest, so a review of drawings (icons,
screens, layout variants, color sets) is one folder the reviewer can edit, diff and rebuild.

The tool was generalised out of one hand-written gallery generator and keeps that page's behaviour:
each proposal is shown on every declared background at the reference size, plus a strip of the
other declared sizes, with a two-state triage (eliminate / mark final) that survives a reload and a
cache token so a stale drawing can never be judged.

## Quick start

```bash
python3 visual_design_proposals_reviewer.py --review /path/to/review-folder
python3 visual_design_proposals_reviewer.py --review /path/to/review-folder --check
python3 visual_design_proposals_reviewer.py --self-test
python3 check_independence.py
```

A review folder holds `review.md` and the drawings it names:

```
my-review/
├── review.md              # the review: settings, one section per theme, one entry per proposal
├── vdpr.conf              # optional, same settings as bullets, outranks the manifest
└── svg/                   # the drawings (folder name is the `dossier-svg` setting)
    ├── icon_a_party.svg
    └── ...
```

The build writes the two pages next to `review.md`:

| file | what it is |
| --- | --- |
| `preview.html` | the working page, drawings read by reference |
| `preview_single.html` | the same page with every drawing embedded as a data URI, to send or open offline |

## Options

| option | effect |
| --- | --- |
| `--review FOLDER` | the review to build (required) |
| `--page NAME` | name of the reference page (default `preview.html`), and builds only it |
| `--single-file NAME` | name of the embedded page (default `preview_single.html`), and builds only it |
| `--sizes LIST` | override the declared sizes (px, comma separated) |
| `--formats LIST` | override the accepted drawing formats |
| `--conf FILE` | use this conf file instead of the folder's `vdpr.conf` |
| `--report-dir DIR` | where the report goes (default this tool's `output/`) |
| `--check` | render and judge, write nothing |
| `--dry-run` | print what would be written, write nothing at all (no report either) |
| `--self-test` | run the tool's own regression guards |
| `--compare PAGE` | judge another page against what this manifest now renders |
| `--export FOLDER` | write a self-contained offline copy of the review there |
| `--version` | print the tool name |

Configuration precedence is `CLI` over `vdpr.conf` over the manifest bullets over the built-in
defaults. The tool never reads stdin and every external call is bounded. `--check` and `--dry-run`
write no review file; `--dry-run` is the one mode that writes nothing at all, not even a report.

## The manifest

`review.md` is Markdown the reviewer already reads. A title line, then settings as bullets, then
one `## <theme>` section per group (an optional leading line under the heading is the group's
note), then `### ` entries whose fields are `name: value` sub-bullets.

```markdown
# Comparaison des propositions de design — {n} propositions

- id: human-away-icons
- langue: fr
- sur-titre: Human Away
- tailles: 24, 48, 72, 112
- fonds: dark = Fond sombre, light = Fond clair
- formats: svg
- fichier: preview.html
- fichier-monofichier: preview_single.html
- dossier-svg: svg
- prefix-local: human-away
- checks: check_icon_layout.py

## porte — Porte et crochets
Un thème, sa note facultative.

### [x] F — portemanteau simple
- fichiers: dark = icon_f_dark.svg, light = icon_f_light.svg
- description: Une phrase sur la proposition.
- alt: F : portemanteau simple
- lot: 1
- duree-min: 25
- tags: crochet, simple
- derived_from: L

## lots
- 1 — Premier lot livré

## notes
- Ce que la revue retient pour l'instant.

## guide
- Cocher une entrée quand sa version est finie et vérifiée.

## elements
### chapeau — Le chapeau de fête
- fichiers: idea_a_party_hat.svg
- de: F
- pour: F1

## eliminations
- E
- +K
```

- The entry **checkbox** means *done AND verified* (the page's `Version finale`). Unchecked is
  `Version de travail`. A checkbox never means eliminated, and `final:` / `eliminated:` fields are
  refused (`FINAL_IS_THE_CHECKBOX`, `ELIMINATED_IS_NOT_A_BOX`).
- Elimination and restore are plain letter lists under `## eliminations`: `E` eliminates, `+K`
  restores a letter a reader had eliminated in the page.
- `fichiers:` is either one drawing shared by all backgrounds, or one per background as
  `dark = a.svg, light = b.svg`. A list that is neither is refused (`FICHIERS_NON_ASSIGNES`,
  `BACKGROUND_MISSING`, `BACKGROUND_UNDECLARED`).
- `lots`, `notes`, `guide`, `elements` and `footer` are entries too, written as plain bullets. A
  footer line may carry a link as `Label | <url>`, and `{folder_slot}` marks where the drawing
  folder's path is printed.
- Settings keys accept the French spelling or the English one (`tailles`/`sizes`, `fonds`/
  `backgrounds`, `fichier`/`preview`, `fichier-monofichier`/`preview_single`, `dossier-svg`/
  `svg_folder`, `prefix-local`/`key_prefix`, `verifications`/`checks`, `titre`/`title`,
  `page-titre`/`page_title`, `sur-titre`/`eyebrow`, `langue`/`lang`).
- Defaults: `tailles: 24, 48, 72, 112`, one surface at the largest declared size, all other sizes
  as the strip, `fonds: dark, light`, `formats: svg`, `fichier: preview.html`,
  `fichier-monofichier: preview_single.html`, `langue: fr`, `prefix-local: vdpr-<id>`.

Reading the manifest and writing it back reproduces the file **byte for byte**, so a diff of
`review.md` only ever contains the change that was intended (`MANIFEST roundtrip=yes`).

## What a build does

Load the manifest → refuse it on any rule break (`VDPR_FAIL`, one token per problem) → render both
pages → write only when the bytes change → judge what was emitted with the universal gates → run the
review's own rule packs → print the verdict tokens, and keep them in
`output/visual_design_proposals_reviewer_report_<YYYYMMDD-HHMMSS>.txt`, echoed to stdout. Exit is
non-zero with the reason printed whenever a gate fails.

Verdict tokens, printed by one function so this file, the CLI and the report agree word for word:

```
VDPR_OK | REVIEW <id> | TILES <n> | SECTIONS 3 | GROUP_GRIDS <n> | ELEMENT_TILES <n>
CHECKED <n> | SEED_ELIMINATIONS <n> | LOTS <n> | STRIPS <n>x2 | SURFACE <px> <fonds...>
FORMATS <list> | PAGE <name> | PAGE_SINGLE <name> | KEY_PREFIX <prefix> | LANG_DECLARED <lang>
MANIFEST roundtrip=yes|no | CACHE_TOKEN <hex> | ASSETS <n> | IMAGES <n>
PRE_SHA256 <page>=<hex|absent> POST_SHA256 <page>=<hex> IDEMPOTENT <page>=yes|no (per emitted page)
SINGLE_FILE_BUDGET <kib>
GATES ok | GATES FAIL <tokens...> | BUILD written=<n> | RULE_PACKS <names>
```

The gates are judged on the emitted page, never back out of the model, so a gate stays a check and
cannot repeat a builder bug: asset validity (`XML_FAIL`, `EMPTY_ASSET`, `FORMAT_FAIL`), references
and coverage (`BROKEN_REFS`, `UNSHOWN_FILES`, `IMG_UNTOKENNED`, `SIZE_STRIP_MIXED_FILES`), card
cells (`CARD_SURFACES`, `CARD_BACKGROUND_UNKNOWN`, `CARD_SIZE_CELLS`), structure (`STRUCT_COUNT`,
`STRUCT_ODD_TILES`, `RETIRED_ID`, …), card geometry (`LAYOUT_*`), language (`LANG_DECLARED_FAIL`,
`LANG_ISLANDS`) and bytes (`NUL_BYTE`, `CARRIAGE_RETURN`).

A review keeps its own business rules out of the tool: `checks:` names checker scripts in
the review folder, which run after the universal gates (`RULE_PACKS <names>`, then each verdict).

## Comparing a page

`--compare <page>` judges another page against what this manifest renders now, over the surface the
reviewer reads (language, titles, section and tile order, per-background images, eliminated class,
final badge, counters, chrome, footer). It prints `EQUIVALENT yes|no` plus one `DELTA <kind> <id>`
line per difference. `--self-test` proves the comparator is not decorative: it injects two defects
(a tile missing from the elimination list, two neighbours swapped) and must report
`SABOTAGE_DETECTED yes`.

## Layout of the tool

| file | role |
| --- | --- |
| `visual_design_proposals_reviewer.py` | thin entry point: options, build order, tokens, report |
| `lib/lib_visual_design_proposals_reviewer.py` | the review model: `review.md` read/write, settings and precedence, validation, `id_sort_key`, the verdict tokens |
| `lib/lib_vdpr_page.py` | page model (tiles, sections, legends, header, footer) and the asset embedding |
| `lib/lib_vdpr_assets.py` | inventory, cache token, universal gates, rule packs |
| `lib/lib_vdpr_copy.py` | card copy precedence: manifest, then page, then a copy store |
| `lib/lib_vdpr_compare.py` | the semantic comparator of the F4 surface |
| `lib/lib_vdpr_text.py` | page chrome strings, one data file per language |
| `assets/` | `base.css`, `triage.css`, `triage.js`, `page.html`, `text_fr.json` |
| `check_independence.py` | static proof of independence, stdlib-only |
| `docs/HOW_TO_REVIEW.md` | how a reviewer works through a round |
| `example/README.md` | pointer to the worked example this tool was generalised from |

## The worked example (`example/human_away_icons/`)

The Human Away icon review is the review this tool was generalised from, and it is now built by the
tool itself: `review.md` is that review's manifest, and it lives with the review it describes, in
`vs-code-extensions/home-made/human-away/icons preview/`, next to that review's own `rule_packs/`
and `text_fr.json`.

```
python3 visual_design_proposals_reviewer.py --review "/home/nicolas/agents/vs-code-extensions/home-made/human-away/icons preview"
```

`example/reference/preview_75bb94825b6f.txt` and `example/reference/preview_check_cachebust.txt`
are the reference captures of the page as the retired builder last produced it (action step 6.2),
kept with a `.txt` suffix because they are comparator data, not shipped code.
`example/human_away_icons/export_human_away_review.py` regenerates the manifest from the captured
page plus the archived builder's data, so the example is reproducible rather than hand-typed.

## Restoring the archived one-shot builder

`make_icon_gallery.py` (1079 lines, sha256 `622f893b6da8...`) sits at
`.ai_baseline/one_shot/archive/icon_gen/make_icon_gallery.py`: moved there on 2026-10-07 under
action step 9.4, nothing deleted. To go back: copy it into `.ai_baseline/one_shot/icon_gen/` and
run it once

```
python3 .ai_baseline/one_shot/icon_gen/make_icon_gallery.py
```

(or `bash .ai_baseline/one_shot/icon_gen/verify_gallery.sh` for build plus gates), then check the
printed `SECTIONS` / `IMG_TOTAL` tokens. A production round must not use it: it rebuilds the page
from data frozen inside the builder, while `review.md` is what a review round now changes.

## Independence

The package is stdlib-only and uses nothing from any shared automation layer: no import, no wrapper
command, no shared configuration, no path naming one. `check_independence.py` proves it and prints
`STDLIB_ONLY yes` and `INDEPENDENT yes <hits>`; a mention inside a Markdown file is reported
separately (`INDEP_DOCS <n>`) and never counted as a dependency.

`docs/HOW_TO_REVIEW.md` is written in English; the pages it produces carry the review's own
language, which the manifest declares.
