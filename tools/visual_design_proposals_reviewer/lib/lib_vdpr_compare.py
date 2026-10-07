#!/usr/bin/env python3
"""The semantic comparator: what two versions of a review page must agree on.

`compare` answers `EQUIVALENT yes|no` over the semantic surface of a page and prints one
`DELTA <kind> <id>` line per difference. The bar for a migration is semantic, not a sha: the cache
token hashes every drawing, so one more proposal rewrites most lines while the review itself did
not change. `self_test` breaks two known invariants on purpose to prove the positive verdict means
something.

A card is read by walking its own `<div>` block, because a card holds nested divs; a pattern that
stops at the first closing tag would silently compare only the top of every tile.
"""
from __future__ import annotations

import html
import re

SECTION_RE = re.compile(r'<section class="batch" id="([^"]+)"')
GRID_RE = re.compile(r'<div class="grid" data-theme="([^"]+)"')
TCOUNT_RE = re.compile(r'<span class="tcount" data-theme="([^"]+)">([^<]*)</span>')
TILE_HEAD = re.compile(r'<div class="candidate([^"]*)"[^>]*>')
ELEMENT_HEAD = re.compile(r'<div class="icard"[^>]*>')
ATTR_RE = re.compile(r'([\w-]+)="([^"]*)"')
H2_RE = re.compile(r"<h2[^>]*>(.*?)</h2>", re.S)
DESC_RE = re.compile(r'<p class="description"[^>]*>(.*?)</p>', re.S)
ADAPT_RE = re.compile(r'<p class="adapt"[^>]*>(.*?)</p>', re.S)
ORIGIN_RE = re.compile(r'<p class="origins"[^>]*>(.*?)</p>', re.S)
NOTE_RE = re.compile(r'<p class="batchnote"[^>]*>(.*?)</p>', re.S)
CELL_RE = re.compile(r'<div class="(?:surface ([a-zA-Z0-9_-]+)|size)"[^>]*>\s*'
                     r'<img src="([^"]+)" width="(\d+)"')
BUTTON_RE = re.compile(r'<button[^>]*id="([^"]+)"[^>]*>(.*?)</button>', re.S)
FOOTER_RE = re.compile(r"<footer>(.*?)</footer>", re.S)
PARA_RE = re.compile(r"<p>(.*?)</p>", re.S)
TAG_RE = re.compile(r"<[^>]+>")


def text_of(fragment: str) -> str:
    """The visible text of a fragment, whitespace normalised."""
    return " ".join(html.unescape(TAG_RE.sub(" ", fragment)).split())


def attributes(open_tag: str) -> dict:
    """The attributes of one opening tag."""
    return dict(ATTR_RE.findall(open_tag))


def blocks(page: str, head_re) -> list:
    """Every block whose opening tag matches: (opening tag, inner html, start, end)."""
    out = []
    for match in head_re.finditer(page):
        end_of_tag = page.find(">", match.start())
        if end_of_tag == -1:
            continue
        depth = 1
        cursor = end_of_tag + 1
        while depth:
            opening = page.find("<div", cursor)
            closing = page.find("</div>", cursor)
            if closing == -1:
                break
            if opening != -1 and opening < closing:
                depth += 1
                cursor = opening + 4
                continue
            depth -= 1
            cursor = closing + len("</div>")
            if not depth:
                out.append((page[match.start():end_of_tag + 1],
                            page[end_of_tag + 1:closing], match.start(), cursor))
    return out


def cells(fragment: str) -> list:
    """A card's own image cells as (background or size cell, file, px), token stripped."""
    out = []
    for background, src, width in CELL_RE.findall(fragment):
        name, _, query = src.partition("?")
        out.append((background or "size", name.split("/")[-1], int(width),
                    query[2:] if query.startswith("v=") else ""))
    return out


def surface(page: str) -> dict:
    """The semantic facts a page states about its review."""
    tiles = {}
    order = []
    for open_tag, inner, _, _ in blocks(page, TILE_HEAD):
        attrs = attributes(open_tag)
        letter = attrs.get("data-letter", "")
        found = cells(inner)
        tiles[letter] = {
            "eliminated": attrs.get("data-default-eliminated") == "true",
            "final": attrs.get("data-default-final") == "true",
            "class": "eliminated" in attrs.get("class", ""),
            "base": attrs.get("data-base", ""),
            "theme": attrs.get("data-theme", ""),
            "title": text_of(next(iter(H2_RE.findall(inner)), "")),
            "description": text_of(next(iter(DESC_RE.findall(inner)), "")),
            "note": text_of(next(iter(ADAPT_RE.findall(inner)), "")),
            "cells": found,
            "files": sorted({name for _, name, _, _ in found}),
            "alt": next(iter(re.findall(r'<img src="[^"]*"[^>]*alt="([^"]*)"', inner)), ""),
            "tokens": sorted({token for _, _, _, token in found if token}),
        }
        order.append(letter)
    elements = {}
    for open_tag, inner, _, _ in blocks(page, ELEMENT_HEAD):
        key = attributes(open_tag).get("data-idea", "")
        found = cells(inner)
        elements[key] = {
            "title": text_of(next(iter(H2_RE.findall(inner)), "")),
            "description": text_of(next(iter(DESC_RE.findall(inner)), "")),
            "origins": text_of(next(iter(ORIGIN_RE.findall(inner)), "")),
            "cells": found,
            "files": sorted({name for _, name, _, _ in found}),
        }
    lang = re.search(r'<html lang="([^"]*)"', page)
    title = re.search(r"<title>(.*?)</title>", page, re.S)
    h1 = re.search(r"<h1>(.*?)</h1>", page, re.S)
    return {
        "lang": lang.group(1) if lang else "",
        "title": text_of(title.group(1)) if title else "",
        "h1": text_of(h1.group(1)) if h1 else "",
        "sections": SECTION_RE.findall(page),
        "grids": GRID_RE.findall(page),
        "counters": {gid: value for gid, value in TCOUNT_RE.findall(page)},
        "notes": [text_of(value) for value in NOTE_RE.findall(page)],
        "tiles": tiles,
        "order": order,
        "elements": elements,
        "tokens": sorted({token for tile in tiles.values() for token in tile["tokens"]}),
        "chrome": {name: text_of(value) for name, value in BUTTON_RE.findall(page)},
        "footer": [text_of(value) for value in PARA_RE.findall(
            next(iter(FOOTER_RE.findall(page)), ""))],
    }


def _field(deltas: list, kind: str, name: str, left, right) -> None:
    if left != right:
        deltas.append("DELTA %s %s" % (kind, name))


def diff(left: str, right: str) -> tuple:
    """Compare two pages; return (equivalent, [DELTA lines])."""
    a, b = surface(left), surface(right)
    deltas = []
    _field(deltas, "language", "page", a["lang"], b["lang"])
    _field(deltas, "title", "page", a["title"], b["title"])
    _field(deltas, "heading", "h1", a["h1"], b["h1"])
    _field(deltas, "section", "order", a["sections"], b["sections"])
    _field(deltas, "grid", "order", a["grids"], b["grids"])
    _field(deltas, "counter", "legends", a["counters"], b["counters"])
    _field(deltas, "note", "sections", a["notes"], b["notes"])
    _field(deltas, "footer", "sentences", a["footer"], b["footer"])
    _field(deltas, "chrome", "buttons", a["chrome"], b["chrome"])
    _field(deltas, "asset_token", "cache", a["tokens"], b["tokens"])
    _field(deltas, "element_ids", "set", sorted(a["elements"]), sorted(b["elements"]))
    for key in sorted(set(a["elements"]) & set(b["elements"])):
        _field(deltas, "element", key, a["elements"][key], b["elements"][key])
    for letter in sorted(set(a["order"]) - set(b["order"])):
        deltas.append("DELTA tile_missing %s" % letter)
    for letter in sorted(set(b["order"]) - set(a["order"])):
        deltas.append("DELTA tile_extra %s" % letter)
    shared_a = [letter for letter in a["order"] if letter in b["tiles"]]
    shared_b = [letter for letter in b["order"] if letter in a["tiles"]]
    if shared_a != shared_b:
        deltas.append("DELTA tile_order page=%s other=%s"
                      % (" ".join(shared_a), " ".join(shared_b)))
    for letter in sorted(set(a["tiles"]) & set(b["tiles"])):
        one, two = a["tiles"][letter], b["tiles"][letter]
        for name in ("theme", "base", "title", "description", "note", "cells", "files", "alt",
                     "tokens"):
            _field(deltas, name, letter, one[name], two[name])
        if one["eliminated"] != two["eliminated"]:
            deltas.append("DELTA elimination %s" % letter)
        if one["class"] != two["class"]:
            deltas.append("DELTA eliminated_class %s" % letter)
        if one["final"] != two["final"]:
            deltas.append("DELTA final_version %s" % letter)
    return (not deltas, deltas)


FIXTURE = """<html lang="fr"><head><title>Revue</title><style>
.candidate.eliminated .card::after { content:"Eliminee"; background:
  linear-gradient(45deg, transparent 47%, red 49%); }</style></head><body><main>
<section class="batch" id="design-section"><h2><span>Design</span></h2>
<p class="batchnote">note de theme</p>
<fieldset><legend><span>Porte</span> <span class="tcount" data-theme="porte">0 / 2</span>
</legend>
<div class="grid" data-theme="porte">
<div class="candidate" data-letter="A" data-default-eliminated="false" data-default-final="false"\
 data-theme="porte" data-base="a">
  <button type="button" class="eliminate" data-letter="A"></button>
  <input type="radio" name="favorite" id="a" value="A">
  <label class="card"><div class="heading"><span class="letter">A</span>\
<h2 id="title-a">Alpha</h2></div>
    <p class="description">premiere tuile</p>
    <div class="surfaces">
      <div class="surface dark"><img src="a.svg?v=tok1" width="112" height="112" alt="alt A">
        <span class="caption">sombre</span></div>
      <div class="surface light"><img src="a.svg?v=tok1" width="112" height="112" alt="">
        <span class="caption">clair</span></div>
    </div>
    <div class="sizes"><div class="size"><img src="a.svg?v=tok1" width="24" height="24" alt="">
      <span>24 px</span></div></div>
  </label>
</div>
<div class="candidate eliminated" data-letter="B" data-default-eliminated="true"\
 data-default-final="true" data-theme="porte" data-base="b">
  <button type="button" class="eliminate" data-letter="B"></button>
  <input type="radio" name="favorite" id="b" value="B">
  <label class="card"><div class="heading"><span class="letter">B</span>\
<h2 id="title-b">Beta</h2></div>
    <p class="description">seconde tuile</p>
    <p class="adapt">note de tuile</p>
    <div class="surfaces">
      <div class="surface dark"><img src="b.svg?v=tok1" width="112" height="112" alt="alt B">
        <span class="caption">sombre</span></div>
      <div class="surface light"><img src="b.svg?v=tok1" width="112" height="112" alt="">
        <span class="caption">clair</span></div>
    </div>
    <div class="sizes"><div class="size"><img src="b.svg?v=tok1" width="24" height="24" alt="">
      <span>24 px</span></div></div>
  </label>
</div>
</div></fieldset></section>
<section class="batch" id="ideas-section"><h2><span>Elements</span></h2>
<p class="batchnote">note des elements</p>
<fieldset><legend><span>Gardes</span></legend><div class="grid">
<div class="icard" lang="fr" data-idea="chapeau">
  <div class="surfaces"><div class="surface dark"><img src="hat.svg?v=tok1" width="112"
    height="112" alt=""><span class="caption">sombre</span></div></div>
  <div class="heading"><span class="letter">chapeau</span><h2>Le chapeau</h2></div>
  <p class="description">element garde</p>
  <p class="origins"><b>Extrait de :</b> <code>A</code></p>
  <div class="sizes"><div class="size"><img src="hat.svg?v=tok1" width="24" height="24" alt="">
    <span>24 px</span></div></div>
</div></div></fieldset></section>
<section class="batch" id="eliminated-section"><h2><span>Eliminees</span></h2>
<p class="batchnote">note eliminees</p>
<fieldset><legend><span>Porte</span> <span class="tcount" data-theme="porte">0 / 2</span>
</legend><div class="grid" data-theme="porte"></div></fieldset></section>
<footer><p>dossier des dessins</p></footer></main>
<div id="triage-bar"><button type="button" id="hide-elim">Cacher</button></div>
</body></html>
"""


def _sabotage_elimination(page: str) -> str:
    """Defect one: a tile the review eliminated no longer is."""
    return page.replace('data-letter="B" data-default-eliminated="true"',
                        'data-letter="B" data-default-eliminated="false"', 1)


def _sabotage_swap(page: str) -> str:
    """Defect two: two neighbouring tiles exchanged places."""
    found = blocks(page, TILE_HEAD)
    if len(found) < 2:
        return page
    (_, _, first_start, first_end), (_, _, second_start, second_end) = found[0], found[1]
    first, second = page[first_start:first_end], page[second_start:second_end]
    return page[:first_start] + second + page[first_end:second_start] + first + page[second_end:]


def self_test() -> list:
    """Tokens proving the comparator sees what it claims to see."""
    lines = []
    stable, deltas = diff(FIXTURE, FIXTURE)
    lines.append("COMPARATOR_STABLE %s" % ("yes" if stable and not deltas else "no"))
    lines += deltas
    facts = surface(FIXTURE)
    read_ok = (len(facts["tiles"]) == 2 and len(facts["elements"]) == 1
               and facts["tiles"]["A"]["cells"] and facts["tiles"]["B"]["final"])
    lines.append("COMPARATOR_READ %s tiles=%d elements=%d cells=%d"
                 % ("yes" if read_ok else "no", len(facts["tiles"]), len(facts["elements"]),
                    len(facts["tiles"].get("A", {}).get("cells", []))))
    caught = []
    for name, sabotage in (("elimination_list", _sabotage_elimination),
                           ("neighbour_swap", _sabotage_swap)):
        broken = sabotage(FIXTURE)
        if broken == FIXTURE:
            lines.append("SABOTAGE_NOT_INJECTED %s" % name)
            caught.append("no")
            continue
        equivalent, found = diff(FIXTURE, broken)
        seen = any(kind in " ".join(found) for kind in ("DELTA elimination", "DELTA tile_order"))
        lines.append("SABOTAGE %s EQUIVALENT=%s detected=%s"
                     % (name, "yes" if equivalent else "no", "yes" if seen else "no"))
        lines += found
        caught.append("yes" if (not equivalent and seen) else "no")
    ok = stable and not deltas and len(caught) == 2 and all(item == "yes" for item in caught)
    lines.append("SABOTAGE_DETECTED %s" % ("yes" if ok else "no"))
    return lines
