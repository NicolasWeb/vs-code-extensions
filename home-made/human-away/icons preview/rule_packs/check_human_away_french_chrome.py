#!/usr/bin/env python3
"""The three gates this review has always enforced on its own page, kept as a rule pack.

They came from the page generator that built this review before the reviewer tool did. The tool's
own gates are universal (asset reference, card surfaces and sizes, empty files, XML well-formed,
declared language, French chrome of the tool itself); the ones below are this project's shape and
wording, so they live here, in the review folder, and run from it.

Usage: python3 check_human_away_french_chrome.py [page.html]   (default: the review's preview page)
Verdict: HUMAN_AWAY_CHROME ok, or HUMAN_AWAY_CHROME_FAIL with one line per failed expectation.
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

REVIEW_FOLDER = Path(__file__).resolve().parent.parent

# The chrome the reviewer reads, taken from the page he has been reading: if one of these labels
# disappears the page is no longer the review he knows, whatever a generic check says.
FRENCH_CHROME = [
    "Tout r\u00e9-afficher",
    "Revenir aux versions de travail",
    "Tout marquer en version finale",
    "Cacher les versions élimin\u00e9es",
    "Fond sombre",
    "Fond clair",
    "Version de travail",
    "\u00c9limin\u00e9e",
    "Triage",
]

# The shape the 2026-10-06 review asked for: three sections, one theme grid per theme in the
# design and the eliminated sections, one tile per reusable element, one counter per grid.
SHAPE = {
    "SECTIONS": (r'<section class="batch"', 3),
    "THEME_GRIDS": (r'<div class="grid" data-theme=', 10),
    "IDEA_TILES": (r'class="icard"', 3),
    "COUNT_SPANS": (r'class="tcount"', 10),
    "ICONS_FOLDER": (r'id="icons-folder"', 1),
    "TRIAGE_BAR": (r'id="triage-bar"', 1),
    "LOTS": (r'class="lots"', 1),
    "GUIDE": (r'class="guide"', 1),
    "FOOTER_TAGS": (r"<footer>", 1),
    "SCRIPT": (r"<script>", 1),
    "HTML_LANG_FR": (r'<html lang="fr"', 1),
    "LANG_EN_ATTRS": (r'lang="en"', 0),
    "CROSS_DIAGONALS": (r"linear-gradient\(45deg", 1),
}


def main() -> int:
    page = Path(sys.argv[1]) if len(sys.argv) > 1 else REVIEW_FOLDER / "preview.html"
    if not page.is_file():
        print("PAGE_MISSING %s" % page)
        return 1
    text = page.read_text(encoding="utf-8")
    failures, notes = [], []

    tiles = len(re.findall(r'<div class="candidate[" ]', text))
    badges = len(re.findall(r'<button[^>]*class="ver-badge[^"]*"[^>]*>', text))
    crosses = len(re.findall(r'<button[^>]*class="eliminate"[^>]*>\s*\u00d7\s*</button>', text))
    arias = len(re.findall(r'<button[^>]*class="eliminate"[^>]*aria-label="\u00c9liminer [A-Z0-9]+"'
                           r'[^>]*>\s*\u00d7\s*</button>', text))
    plus = len(re.findall(r'<button[^>]*class="eliminate"[^>]*>\s*\+\s*</button>', text))
    notes.append("TILES %d" % tiles)
    notes.append("BADGE_IN_BUTTON %d" % badges)
    notes.append("CROSS_GLYPH %d" % crosses)
    notes.append("ELIM_ARIA %d" % arias)
    notes.append("CROSS_PLUS %d" % plus)
    for name, got, want in (("BADGE_IN_BUTTON", badges, tiles),
                            ("CROSS_GLYPH", crosses, tiles),
                            ("ELIM_ARIA", arias, tiles),
                            ("CROSS_PLUS", plus, 0)):
        if got != want:
            failures.append("%s %d expected=%d" % (name, got, want))

    for name, (pattern, want) in SHAPE.items():
        got = len(re.findall(pattern, text))
        notes.append("%s %d" % (name, got))
        if got != want:
            failures.append("%s %d expected=%d" % (name, got, want))

    missing = [label for label in FRENCH_CHROME if label not in text]
    notes.append("FRENCH_CHROME %d/%d" % (len(FRENCH_CHROME) - len(missing), len(FRENCH_CHROME)))
    for label in missing:
        failures.append("FRENCH_CHROME_MISSING %s" % label)
    # The review is read in French all the way down: any element still claiming English reopens
    # the browser translator that rewrote the copy on screen.
    if re.search(r'lang="en"', text):
        failures.append('LANG_EN text claims lang="en"')
    if "\r" in text:
        failures.append("CR_COUNT %d" % text.count("\r"))
    if "\x00" in text:
        failures.append("NUL_COUNT %d" % text.count("\x00"))

    print("PAGE %s" % page)
    print("\n".join(notes))
    if failures:
        print("HUMAN_AWAY_CHROME_FAIL %d" % len(failures))
        print("\n".join("FAIL %s" % line for line in failures))
        return 1
    print("HUMAN_AWAY_CHROME ok")
    return 0


if __name__ == "__main__":
    sys.exit(main())
