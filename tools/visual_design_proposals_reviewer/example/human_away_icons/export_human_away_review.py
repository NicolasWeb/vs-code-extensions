#!/usr/bin/env python3
"""Write the manifest of this review out of the data the review already carries.

The round migrated here was first built by a page generator that kept its content in plain tables:
the letter table (lot, theme, elimination, adaptation note), the card copy, the theme headings and
notes, the production lots, and the reusable-element tiles. This script reads those tables plus the
page that generator last built, and emits the `review.md` the reviewer tool builds. The migration
is then reproducible instead of hand-typed, which is the point of a worked example.

    python3 export_human_away_review.py \\
        --generator <path of the archived page generator> \\
        --reference <path of the page that generator built> \\
        --out <path of the review.md to write>

Nothing here names a folder: the generator and its page arrive as arguments. The drawing set and
the elimination seed are read out of the reference page, which already re-validates its own
generator; that seed is what the reviewer's first visit showed him, and his own browser list stays
his state. Prose in this file stays French literally: it is the reviewer's wording, not a generated
string, and a migration must not reword the page he is reading.
"""
from __future__ import annotations

import argparse
import re
import sys
from html import unescape
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "lib"))

import lib_visual_design_proposals_reviewer as vdpr  # noqa: E402
import lib_vdpr_compare as compare  # noqa: E402

# Review identity: names the page and the reviewer's stored state must keep.
REVIEW_ID = "human-away-icons"
PAGE_NAME = "preview.html"
SINGLE_NAME = "preview_single.html"
SVG_FOLDER = "./"
FOLDER_LABEL = "icons preview"
KEY_PREFIX = "human-away-preview"
EYEBROW = "Human Away / Icônes"
SIZES = "24, 48, 72, 112"
# The two backgrounds are captioned in French on this page, so the manifest gives them the labels
# the reviewer reads under each cell.
BACKGROUNDS = "dark = Fond sombre, light = Fond clair"
FORMATS = "svg"
CHECKS = "rule_packs/check_human_away_french_chrome.py"

SETTINGS = [
    ("id", REVIEW_ID),
    ("langue", "fr"),
    ("page", PAGE_NAME),
    ("single", SINGLE_NAME),
    ("dossier-svg", SVG_FOLDER),
    ("label-dossier", FOLDER_LABEL),
    ("tailles", SIZES),
    ("fonds", BACKGROUNDS),
    ("formats", FORMATS),
    ("prefix-local", KEY_PREFIX),
    ("verifications", CHECKS),
    ("sur-titre", EYEBROW),
]

TAG = re.compile(r"<[^>]+>")
FOLDER_SLOT = re.compile(r'<strong id="icons-folder">.*?</strong>', re.S)
LINK = re.compile(r'<a href="(?P<url>[^"]*)">(?P<label>.*?)</a>', re.S)


def load_generator(path: Path) -> dict:
    """The generator's tables, without running its build step (its last line builds the page)."""
    src = path.read_text(encoding="utf-8")
    if src.count("\nmain()\n") != 1:
        raise SystemExit("GENERATOR_SHAPE unknown: %s" % path.name)
    namespace = {"__file__": str(path), "__name__": "migrated_review_data"}
    exec(compile(src[: -len("main()\n")], str(path), "exec"), namespace)
    return namespace


def plain(fragment: str) -> str:
    """Visible text of an HTML fragment, for a manifest value."""
    return " ".join(unescape(TAG.sub(" ", fragment)).split())


def footer_entries(footer_html: str) -> list:
    """Footer prose is review data: one bullet per paragraph, the link carried as its own fields.

    The folder slot stays a slot, so the page prints the path in the form the reader's own system
    uses while the manifest keeps one stable label.
    """
    entries = []
    for fragment in re.findall(r"<p>(.*?)</p>", footer_html, re.S):
        url = label = ""
        match = LINK.search(fragment)
        if match:
            url, label = match.group("url"), plain(match.group("label"))
            fragment = LINK.sub("", fragment)
        text = FOLDER_SLOT.sub("{folder_slot}", fragment)
        text = plain(text)
        if label:
            # The page renders its own separator between a link and the sentence that follows it,
            # so the bullet carries only the sentence.
            text = text.lstrip("\u00b7 ").strip()
        entries.append((text, label, url))
    return entries


def lot_lines(batches: dict) -> list:
    lines = []
    for number in sorted(batches):
        title, note = batches[number]
        tail = re.sub(r"^Lot\s*\d+\s*[-\u2013\u2014]\s*", "", title).rstrip(". \u2014")
        lines.append("Lot %d : %s%s" % (number, tail, " \u2014 " + note.rstrip(". ") if note else ""))
    return lines


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--generator", required=True, help="page generator holding the review tables")
    ap.add_argument("--reference", required=True,
                    help="the page that generator last built (tile set, drawings, seed eliminations)")
    ap.add_argument("--out", required=True, help="review.md to write")
    ap.add_argument("--dry-run", action="store_true", help="report without writing")
    args = ap.parse_args()

    gen = load_generator(Path(args.generator))
    surface = compare.surface(Path(args.reference).read_text(encoding="utf-8"))
    tiles, elements = surface["tiles"], surface["elements"]
    meta, copy, themes, batches, ideas = (gen["META"], gen["COPY"], gen["THEMES"],
                                          gen["BATCHES"], gen["IDEAS"])

    def card(ident):
        """One card's three visible strings: the generator's copy, the page as the fallback."""
        if ident in copy:
            title, description, alt = copy[ident]
        else:
            title, description, alt = (tiles[ident]["title"], tiles[ident]["description"],
                                       tiles[ident]["alt"])
        note = meta.get(ident, ("", "", "", ""))[3] or tiles[ident]["note"]
        lot = meta.get(ident, (0,))[0] or 0
        return title, description, note, alt, lot

    # Settings are plain bullets under the document title: the parser only reads them there.
    out = ["# " + surface["title"], ""]
    for key, value in SETTINGS:
        out += ["- %s: %s" % (key, value), ""]
    out += ["- titre: %s" % surface["h1"], "",
            "## notes", "",
            "- Chaque tuile est montrée aux mêmes tailles sur fond clair et sur fond foncé, et "
            "aucune SVG antérieure n’a été supprimée. Les lots ne sont plus des sections de la "
            "page : ils restent enregistrés dans le générateur, et la page ne présente que thèmes "
            "et familles.", ""]

    seen = []
    for theme in surface["grids"]:
        if theme not in seen:
            seen.append(theme)
    for theme in seen:
        out += ["## %s \u2014 %s" % (theme, themes[theme][0]), ""]
        for paragraph in themes[theme][1]:
            out += [paragraph, ""]
        family = [i for i in surface["order"] if tiles[i]["theme"] == theme]
        for ident in sorted(family, key=vdpr.id_sort_key):
            title, description, note, alt, lot = card(ident)
            out += ["### [ ] %s \u2014 %s" % (ident, title), ""]
            if vdpr.base_of(ident) != ident:
                out += ["- sous-version: %s" % vdpr.base_of(ident), ""]
            out += ["- fichiers: %s" % tiles[ident]["files"][0], ""]
            out += ["- description: %s" % description, ""]
            if note:
                out += ["- note: %s" % note, ""]
            if alt:
                out += ["- alt: %s" % alt, ""]
            out += ["- lot: %d" % lot, ""]

    out += ["## elements", ""]
    for idea in ideas:
        ident, tile = idea["key"], elements[idea["key"]]
        out += ["### [ ] %s \u2014 %s" % (ident, idea["title"]), ""]
        out += ["- fichiers: %s" % tile["files"][0], ""]
        out += ["- description: %s" % idea["note"], ""]
        out += ["- alt: %s" % idea["alt"], ""]
        for source in idea["frm"]:
            out += ["- extrait-de: %s" % source, ""]
        for target in idea["reused"]:
            out += ["- pour: %s" % target, ""]
        out += [""]

    out += ["## lots", ""]
    for line in lot_lines(batches):
        out += ["- %s" % line, ""]
    out += ["## guide", ""]
    for item in gen["GUIDE"].split("<li>")[1:]:
        text = plain(item.split("</li>")[0])
        out += ["- %s" % text.replace("|", "/"), ""]
    out += ["## footer", ""]
    for text, label, url in footer_entries(gen["FOOTER"]):
        out += ["- %s" % text.replace("|", "/"), ""]
        if label:
            out += ["- lien: %s" % label, "- url: %s" % url, ""]
        else:
            out += [""]
    out += ["## eliminations", ""]
    seeds = [letter for letter in surface["order"] if tiles[letter]["eliminated"]]
    for letter in seeds:
        out += ["- %s" % letter, ""]

    text = "\n".join(out).rstrip() + "\n"
    target = Path(args.out)
    review = vdpr.parse_manifest(target, text)
    findings = vdpr.validate(review, review.settings)
    roundtrip = "yes" if review.dumps() == text else "no"
    print("MANIFEST roundtrip=%s" % roundtrip)
    print("EXPORT groups=%d entries=%d elements=%d eliminations=%d tokens=%s"
          % (len(review.groups), len(tiles), len(elements), len(seeds),
             ",".join(surface["tokens"])))
    print("EXPORT validate findings=%d" % len(findings))
    for finding in findings[:10]:
        print("FINDING %s" % finding)
    if findings or roundtrip != "yes":
        print("EXPORT_FAILED")
        return 1
    if args.dry_run:
        print("DRY_RUN written=0")
        return 0
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(text, encoding="utf-8", newline="\n")
    again = vdpr.load_manifest(target)
    print("MANIFEST roundtrip=%s" % ("yes" if again.dumps() == text else "no"))
    print("EXPORT_DONE %s" % target)
    return 0


if __name__ == "__main__":
    sys.exit(main())
