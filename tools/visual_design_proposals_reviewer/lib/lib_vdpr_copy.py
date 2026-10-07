#!/usr/bin/env python3
"""The tile copy store: where a card's three visible strings come from.

Copy is data first. Precedence is fixed: the manifest's own wording, then the wording the emitted
page already shows (so a round written outside the tool is not lost), then a language data file
(`copy_<lang>.md` in the review folder) loaded by the caller and handed here as a store.
"""
from __future__ import annotations

import re

FIELDS = ("title", "description", "alt")
CARD_COPY = re.compile(
    r'class="candidate[^"]*"[^>]*data-letter="(?P<id>[^"]+)"[^>]*>.*?'
    r'<h2 id="title-[a-z0-9-]+">(?P<title>.*?)</h2></div>\s*'
    r'<p class="description">(?P<desc>.*?)</p>.*?'
    r'<img src="(?P<file>[^"?#]+)(?:[^>]*alt="(?P<alt>[^"]*)")?',
    re.S)


class Store:
    """Copy keyed by entry id, read from the review's language data file."""

    def __init__(self, entries: dict, source: str = ""):
        self.entries = entries or {}
        self.source = source

    def get(self, entry_id: str) -> dict:
        return self.entries.get(entry_id, {})

    def ids(self) -> list:
        return sorted(self.entries)

    def __len__(self) -> int:
        return len(self.entries)


def resolve(entry, store: Store, page_copy: dict) -> tuple:
    """Return (title, description, alt) and which source answered each of them."""
    on_page = page_copy.get(entry.id) or {}
    from_store = store.get(entry.id)
    out, origins = {}, {}
    for field in FIELDS:
        if getattr(entry, field):
            out[field], origins[field] = getattr(entry, field), "manifest"
        elif on_page.get(field):
            out[field], origins[field] = on_page[field], "page"
        elif from_store.get(field):
            out[field], origins[field] = from_store[field], store.source or "store"
        else:
            out[field], origins[field] = "", "none"
    return (out["title"], out["description"], out["alt"]), origins


def page_copy(page: str) -> dict:
    """Read the card copy a page already shows, for a review edited outside the tool."""
    out = {}
    for match in CARD_COPY.finditer(page):
        out[match.group("id")] = {"title": match.group("title").strip(),
                                  "description": match.group("desc").strip(),
                                  "alt": (match.group("alt") or "").strip(),
                                  "file": match.group("file")}
    return out


def self_test() -> list:
    """Verdict tokens for the precedence rule, the store round trip and the page read-back."""
    class _Entry:
        def __init__(self, **values):
            for field in FIELDS:
                setattr(self, field, values.get(field, ""))
            self.id = values.get("id", "A")

    store = Store({"A": {"title": "store title", "description": "store desc",
                         "alt": "store alt"},
                   "B": {"title": "store only", "description": "", "alt": ""}}, "copy_test.md")
    page = ('<div class="candidate" data-letter="B" data-theme="g">x'
            '<h2 id="title-b">page title</h2></div>\n'
            '<p class="description">page desc</p>'
            '<img src="b.svg?v=deadbeef">')
    reads = page_copy(page)
    ok_page = reads.get("B", {}).get("title") == "page title"
    entry = _Entry(id="A")
    copy, origins = resolve(entry, store, reads)
    ok_store = copy == ("store title", "store desc", "store alt") and set(origins.values()) == {"copy_test.md"}
    entry = _Entry(id="A", title="manifest title")
    copy, origins = resolve(entry, store, reads)
    ok_manifest = copy[0] == "manifest title" and origins["title"] == "manifest"
    entry = _Entry(id="B")
    copy, origins = resolve(entry, store, page_copy(page))
    # The page's wording outranks the store's for every field it shows.
    ok_priority = (copy == ("page title", "page desc", "")
                   and origins["title"] == "page" and origins["description"] == "page")
    entry = _Entry(id="B")
    copy, origins = resolve(entry, store, {})
    # With no page and no manifest wording, the store answers and names itself as the source.
    ok_store_only = copy[0] == "store only" and origins["title"] == "copy_test.md"
    return [
        "COPY_PAGE_READ %s" % ("yes" if ok_page else "no"),
        "COPY_STORE %s" % ("yes" if ok_store else "no"),
        "COPY_MANIFEST_FIRST %s" % ("yes" if ok_manifest else "no"),
        "COPY_PRECEDENCE %s" % ("yes" if ok_priority else "no"),
        "COPY_STORE_ONLY %s" % ("yes" if ok_store_only else "no"),
    ]
