#!/usr/bin/env python3
"""Asset inventory, cache token, and the universal gates every review must pass.

Nothing here knows what a review is about: the checks are about files, references, card
geometry, page structure and the declared language. A review's own business rules run outside
this module, as a rule pack the review folder declares (`run_rule_packs` below).

Every gate reads its expectations out of the emitted page itself, never back out of the review
model, so a gate stays a check and cannot repeat a builder bug.
"""
from __future__ import annotations

import hashlib
import re
import stat
import subprocess
import sys
import xml.etree.ElementTree as ET

IMG_SRC = re.compile(r'<img src="([^"]+)"')
SURFACE_CELL = re.compile(r'<div class="surface ([^" ]+)"><img src="([^"?]+)')
SIZE_CELL = re.compile(r'<div class="size"><img src="([^"?]+)')
CARD_START = re.compile(r'<div class="(?:candidate[^"]*|icard)"')
SIGNATURES = {
    "png": b"\x89PNG\r\n\x1a\n", "gif": b"GIF8", "webp": b"RIFF",
}
RETIRED_IDS = ("work-section", "hide-work", "reset-triage")
MIN_TEXT_SLACK = 8
SECTION_IDS = ("design-section", "ideas-section", "eliminated-section")
COUNTER_IDS = ("kept-count", "gone-count", "final-count", "elim-count")
RULE_PACK_TIMEOUT = 300


class VdprAssetError(Exception):
    """Raised with a CAPS token as its message."""


def relative_name(folder, path) -> str:
    """A file's name inside the review folder, with forward slashes, or empty if outside it."""
    try:
        return path.relative_to(folder).as_posix()
    except ValueError:
        return ""


def safe_child(folder, name: str):
    """The folder's own file for a name the manifest declared, refused if it escapes the folder."""
    if not name or name.startswith(("/", "\\")) or ".." in name.replace("\\", "/").split("/"):
        raise VdprAssetError("BAD_ASSET_NAME " + name)
    path = folder / name
    if not relative_name(folder, path):
        raise VdprAssetError("BAD_ASSET_NAME " + name)
    return path


def inventory(folder, formats) -> list:
    """The proposal files the folder holds, in the accepted formats only."""
    names = []
    for path in sorted(folder.rglob("*")):
        if path.is_file() and path.suffix[1:].lower() in formats and relative_name(folder, path):
            names.append(relative_name(folder, path))
    return names


def blob_sha(data: bytes) -> str:
    """Full sha256 of a blob, the form the idempotence verdict prints."""
    return hashlib.sha256(data).hexdigest()


def asset_state(folder, formats) -> tuple[str, dict[str, str]]:
    digest = hashlib.sha256()
    files = {}
    for name in inventory(folder, formats):
        data = (folder / name).read_bytes()
        digest.update(name.encode("utf-8"))
        digest.update(data)
        files[name] = blob_sha(data)
    return digest.hexdigest()[:8], files


def asset_token(folder, formats) -> str:
    """Stamp that only changes when an asset's bytes change, so a stale cache cannot be judged."""
    return asset_state(folder, formats)[0]


def check_one(folder, name: str, formats) -> str:
    """One file's own validity: XML for svg, a signature for the raster formats."""
    try:
        path = safe_child(folder, name)
    except VdprAssetError as exc:
        return str(exc)
    if not path.is_file():
        return "MISSING_ASSET %s" % name
    data = path.read_bytes()
    if not data:
        return "EMPTY_ASSET %s" % name
    suffix = name.rsplit(".", 1)[-1].lower()
    if suffix == "svg":
        try:
            ET.fromstring(data)
        except ET.ParseError as exc:
            return "XML_FAIL %s %s" % (name, exc)
        return ""
    magic = SIGNATURES.get(suffix)
    if magic and not data.startswith(magic):
        return "FORMAT_FAIL %s" % name
    if suffix in ("jpg", "jpeg") and not data.startswith(b"\xff\xd8"):
        return "FORMAT_FAIL %s" % name
    return ""


def check_all(folder, formats) -> list:
    """Per-file verdicts for the whole inventory."""
    return [problem for problem in
            (check_one(folder, name, formats) for name in inventory(folder, formats)) if problem]


def source_map(page: str) -> list:
    """Every img request as (bare file name, token carried), data URIs excluded."""
    out = []
    for src in IMG_SRC.findall(page):
        if src.startswith("data:"):
            continue
        name, _, query = src.partition("?")
        out.append((name, query.startswith("v=")))
    return out


def card_blocks(page: str) -> list:
    """One slice of page per card, so a card's own cells can be judged together."""
    starts = [match.start() for match in CARD_START.finditer(page)]
    starts.append(len(page))
    return [page[starts[index]:starts[index + 1]]
            for index in range(len(starts) - 1) if starts[index] != starts[index + 1]]


def requested_pairs(page: str) -> set:
    """Every card image as (file, background).

    A surface cell names its own background; a size-strip cell carries no name, so it takes the
    background of the tile's first surface, which is where the small drawings come from.
    """
    pairs = set()
    for block in card_blocks(page):
        surfaces = SURFACE_CELL.findall(block)
        first = surfaces[0][0] if surfaces else ""
        pairs.update(surfaces)
        pairs.update((name, first) for name in SIZE_CELL.findall(block))
    return {(name, background) for name, background in pairs if not name.startswith("data:")}


def backgrounds_of(page: str) -> list:
    """The background labels the page shows, which are the ones a declaration must cover."""
    return sorted({match.group(1) for match in re.finditer(r'<div class="surface ([^" ]+)">', page)})


def check_refs(page: str, folder, formats) -> list:
    """Broken references, assets no tile shows, missing cache tokens, size strips that change file."""
    problems = []
    present = set(inventory(folder, formats))
    used = source_map(page)
    broken = sorted({name for name, _ in used if name not in present})
    if broken:
        problems.append("BROKEN_REFS " + " ".join(broken))
    unshown = sorted(present - {name for name, _ in used})
    if unshown:
        problems.append("UNSHOWN_FILES %d %s" % (len(unshown), " ".join(unshown)))
    untokenned = sorted({name for name, token in used if not token})
    if untokenned:
        problems.append("IMG_UNTOKENNED " + " ".join(untokenned))
    for index, block in enumerate(card_blocks(page)):
        per_background = {}
        for background, name in SURFACE_CELL.findall(block):
            per_background.setdefault(background, set()).add(name)
        first = next(iter(sorted(per_background)), "")
        for name in SIZE_CELL.findall(block):
            per_background.setdefault(first, set()).add(name)
        thin = sorted(background for background, names in per_background.items() if len(names) > 1)
        if thin:
            problems.append("SIZE_STRIP_MIXED_FILES tile%d %s" % (index + 1, " ".join(thin)))
    return problems


def px(text: str, pattern: str) -> list:
    """Pixel values a pattern captures, as ints."""
    return [int(value) for value in re.findall(pattern, text)]


def layout_gate(css: str, base_css: str) -> list:
    """Card geometry the CSS must keep: text never runs under the control column."""
    problems = []
    # Whitespace carries no meaning in CSS, so one pattern shape reads both the rule and its media override.
    flat = " ".join(css.split())
    flat_base = " ".join(base_css.split())
    gutters = px(flat, r"\.candidate\s*\{\s*--bw:(\d+)px")
    if not gutters:
        return ["LAYOUT_NO_GUTTER"]
    controls = px(flat, r"\.eliminate\s*\{[^}]*width:(\d+)px") + px(flat_base, r"input\s*\{[^}]*width:(\d+)px")
    pads = px(flat, r"\.candidate \.heading, \.candidate \.description, \.candidate \.adapt \{\s*padding-right:(\d+)px")
    if len(pads) < len(gutters):
        problems.append("LAYOUT_NO_TEXT_PAD")
    for index, gutter in enumerate(gutters):
        reserved = gutter + max(controls or [0])
        if index >= len(pads):
            problems.append("LAYOUT_NO_TEXT_PAD %dpx" % gutter)
            continue
        if pads[index] - reserved < MIN_TEXT_SLACK:
            problems.append("LAYOUT_TEXT_UNDER_CONTROLS %dpx>%dpx" % (reserved, pads[index]))
    if "width:var(--bw)" not in css:
        problems.append("LAYOUT_BADGE_NOT_ON_GUTTER")
    return problems


def language_gate(page: str, lang: str) -> list:
    """The page declares one language and no element claims another."""
    problems = []
    if page.count('<html lang="%s">' % lang) != 1:
        problems.append("LANG_DECLARED_FAIL " + lang)
    foreign = sorted({value for value in re.findall(r'lang="([^"]+)"', page) if value != lang})
    if foreign:
        problems.append("LANG_ISLANDS " + " ".join(foreign))
    return problems


def structure_gate(page: str) -> list:
    """The invariants of the three-section layout, counted on the bytes just written."""
    grids = page.count('<div class="grid" data-theme=')
    counts = {
        '<section class="batch"': 3,
        "<html lang=": 1,
        "<script>": 1,
        "</main>": 1,
        "<footer>": 1,
        'id="triage-bar"': 1,
        "triage-ui:start": 1,
        "linear-gradient(45deg": 1,
        'id="icons-folder"': 1,
        '<div class="grid">': 1,
    }
    counts.update(dict.fromkeys(
        ['id="%s"' % value for value in SECTION_IDS]
        + ['id="%s"' % value for value in COUNTER_IDS], 1))
    problems = []
    for needle, want in sorted(counts.items()):
        got = page.count(needle)
        if got != want:
            problems.append("STRUCT_COUNT %s want=%d got=%d" % (needle, want, got))
    if grids % 2:
        problems.append("STRUCT_ODD_GRIDS %d" % grids)
    if grids != page.count('class="tcount"'):
        problems.append("STRUCT_LEGEND_GRIDS %d!=%d" % (grids, page.count('class="tcount"')))
    pairs = (("class=\"lots\"", "class=\"lotslabel\"", "STRUCT_LOTS_LABEL"),
             ("class=\"guide\"", "class=\"guide-title\"", "STRUCT_GUIDE_TITLE"))
    for left, right, token_value in pairs:
        if page.count(left) != page.count(right):
            problems.append("%s %d!=%d" % (token_value, page.count(left), page.count(right)))
    # A review holds whatever proposals it holds - parity proved nothing. What the layout does
    # require is that a tile is placed exactly once, carrying its own id, so the counters, the
    # radio group and the triage keys all speak about one card.
    tiles = page.count('class="candidate')
    letters = re.findall(r'<div class="candidate[^"]*"[^>]*data-letter="([^"]*)"', page)
    if len(letters) != tiles:
        problems.append("STRUCT_TILE_ID_MISSING %d of %d" % (len(letters), tiles))
    doubled = sorted({value for value in letters if letters.count(value) > 1})
    if doubled:
        problems.append("STRUCT_TILE_ID_DOUBLED %s" % " ".join(doubled))
    for retired in RETIRED_IDS:
        if ('id="%s"' % retired) in page:
            problems.append("RETIRED_ID " + retired)
    return problems


def card_cell_gate(page: str, backgrounds: list, strip_sizes: list) -> list:
    """Every card shows every declared background and the whole declared size strip.

    A missing declaration is refused before the build, so a card that cannot show what was
    declared is a real defect: small sizes get judged instead of remembered, and a background is
    never silently borrowed from another file.
    """
    problems = []
    want_surfaces = len(backgrounds)
    want_sizes = len(strip_sizes)
    shown = set(backgrounds)
    for index, block in enumerate(card_blocks(page)):
        cells = SURFACE_CELL.findall(block)
        names = sorted({name for name, _ in cells})
        if len(names) != want_surfaces:
            problems.append("CARD_SURFACES tile%d want=%d got=%d"
                            % (index + 1, want_surfaces, len(names)))
        foreign = sorted(set(names) - shown)
        if foreign:
            problems.append("CARD_BACKGROUND_UNKNOWN tile%d %s" % (index + 1, " ".join(foreign)))
        sizes = len(SIZE_CELL.findall(block))
        if sizes != want_sizes:
            problems.append("CARD_SIZE_CELLS tile%d want=%d got=%d"
                            % (index + 1, want_sizes, sizes))
    return problems


def run_gates(page: str, settings, review, assets_dir) -> dict:
    """All universal gates over the emitted page; the verdict is the failure list."""
    failures = []
    failures += ["NUL_BYTE"] if "\x00" in page else []
    failures += ["CARRIAGE_RETURN"] if "\r" in page else []
    folder = settings.asset_folder
    failures += check_all(folder, settings.formats)
    failures += check_refs(page, folder, settings.formats)
    from lib_vdpr_page import load_template  # the page owns its own templates
    css = load_template(assets_dir, "triage.css")
    base = load_template(assets_dir, "base.css")
    failures += layout_gate(css, base)
    failures += language_gate(page, review.lang)
    failures += structure_gate(page)
    return {
        "failures": failures,
        "assets": len(inventory(folder, settings.formats)),
        "images": len(source_map(page)),
        "backgrounds": backgrounds_of(page),
    }


def inspect_rule_packs(review, settings) -> list[str]:
    failures = []
    for name in review.checks:
        if not name or any(ord(char) < 32 or ord(char) == 127 for char in name):
            failures.append("RULE_PACK_INVALID_NAME")
            continue
        path = settings.review_folder / name
        try:
            mode = path.stat().st_mode
        except FileNotFoundError:
            failures.append("RULE_PACK_MISSING " + name)
        except (OSError, ValueError) as exc:
            failures.append("RULE_PACK_ERROR %s %s: %s" % (name, exc.__class__.__name__, exc))
        else:
            if not stat.S_ISREG(mode):
                failures.append("RULE_PACK_NOT_FILE " + name)
    return failures


def run_rule_packs(review, settings) -> tuple[list[str], list[str]]:
    """Run the review folder's own checkers (ARB-R5); their tokens join the build verdict."""
    lines, failures = [], []
    if not review.checks:
        return ["RULE_PACKS none"], failures
    lines.append("RULE_PACKS " + ",".join(review.checks))
    for name in review.checks:
        path = settings.review_folder / name
        if not path.is_file():
            failure = "RULE_PACK_MISSING " + name
            lines.append(failure)
            failures.append(failure)
            continue
        try:
            completed = subprocess.run(
                [sys.executable, str(path)] if path.suffix == ".py" else [str(path)],
                cwd=str(settings.review_folder), capture_output=True, text=True,
                input="", timeout=RULE_PACK_TIMEOUT)
        except (OSError, UnicodeError, subprocess.TimeoutExpired) as exc:
            failure = "RULE_PACK_ERROR %s %s: %s" % (name, exc.__class__.__name__, exc)
            lines.append(failure)
            failures.append(failure)
            continue
        for line in (completed.stdout or "").splitlines():
            if line.strip():
                lines.append("RULE_PACK_OUT %s %s" % (name, line.strip()))
        for line in (completed.stderr or "").splitlines():
            if line.strip():
                lines.append("RULE_PACK_ERR %s %s" % (name, line.strip()))
        lines.append("RULE_PACK_RC %s %d" % (name, completed.returncode))
        if completed.returncode:
            failures.append("RULE_PACK_FAILED %s rc=%d" % (name, completed.returncode))
    return lines, failures
