#!/usr/bin/env python3
"""Page chrome strings and the page's declared language.

The chrome lives in a per-language data file (`assets/text_<lang>.json`), never in code, so a
new review language is a data file. A review may ship its own file of the same shape to
reword the chrome without touching the tool.
"""
from __future__ import annotations

import json
import re
from pathlib import Path

ISLAND_RE = re.compile(r'lang="([A-Za-z0-9-]+)"')


class VdprTextError(Exception):
    """Raised with a CAPS token as its message."""


class Strings:
    """One language's chrome strings, with the language the page will declare."""

    def __init__(self, lang: str, table: dict, source: str):
        self.lang = lang
        self.table = table
        self.source = source

    def key(self, name: str) -> str:
        if name not in self.table:
            raise VdprTextError("TEXT_KEY_MISSING %s (%s)" % (name, self.source))
        return self.table[name]

    def text(self, name: str, **params) -> str:
        raw = self.key(name)
        try:
            return raw.format(**params) if params else raw
        except KeyError as exc:
            raise VdprTextError("TEXT_PARAM_MISSING %s %s" % (name, exc)) from exc

    def has(self, name: str) -> bool:
        return name in self.table


def load(assets_dir, lang: str, override=None) -> Strings:
    """Load `text_<lang>.json` from the tool, then the review's override on top."""
    path = assets_dir / ("text_%s.json" % lang)
    if not path.is_file():
        raise VdprTextError("TEXT_FILE_MISSING %s" % path.name)
    try:
        table = json.loads(path.read_text(encoding="utf-8"))
    except ValueError as exc:
        raise VdprTextError("TEXT_FILE_INVALID %s %s" % (path.name, exc)) from exc
    source = path.name
    if override:
        opath = override if hasattr(override, "is_file") else None
        if opath is None or not opath.is_file():
            raise VdprTextError("TEXT_OVERRIDE_MISSING %s" % override)
        try:
            extra = json.loads(opath.read_text(encoding="utf-8"))
        except ValueError as exc:
            raise VdprTextError("TEXT_OVERRIDE_INVALID %s %s" % (opath.name, exc)) from exc
        table = dict(table, **extra)
        source = "%s+%s" % (source, opath.name)
    return Strings(lang, table, source)


def review_override(settings):
    """The review folder's own chrome file, or None when it ships none."""
    path = Path(str(settings.review_folder)) / ("text_%s.json" % settings.lang)
    return path if path.is_file() else None


def declared_lang(open_tag: str) -> str:
    """Read the language out of an `<html ...>` tag."""
    match = re.search(r'<html\b[^>]*\blang="([^"]+)"', open_tag)
    return match.group(1) if match else ""


def islands(html: str, lang: str) -> list:
    """Elements that declare a language other than the page's own."""
    return sorted({value for value in ISLAND_RE.findall(html) if value != lang})


def declare(lang: str) -> str:
    """The `<html>` opener the page is allowed to carry."""
    if not re.fullmatch(r"[A-Za-z0-9-]+", lang or ""):
        raise VdprTextError("LANG_INVALID " + str(lang))
    return '<html lang="%s">' % lang
