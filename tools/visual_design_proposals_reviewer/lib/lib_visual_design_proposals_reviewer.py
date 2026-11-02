#!/usr/bin/env python3
"""The review model: a review folder, its Markdown manifest, and what a build must show.

`review.md` is the review's own truth: a document title, the review settings as bullets, one
`## ` section per theme holding one `### ` entry per proposal, and plain letter lists for the
eliminations. Reading the file and writing it back reproduces it byte for byte, so the only change
a review round leaves in a diff is the decision the reviewer took.

An entry's checkbox means *done AND verified*, which is the reviewer's `Version finale`; unchecked
is a work version. A checkbox therefore never means eliminated - elimination is its own letter
list, never a box - and a box in this file is never a rule-state token.
"""
from __future__ import annotations

import html
import re
from pathlib import Path

MANIFEST = "review.md"
CONF = "vdpr.conf"
REPORT_STEM = "visual_design_proposals_reviewer_report_"
PAGE_SECTIONS = 3

DEFAULT_SIZES = "24, 48, 72, 112"
DEFAULT_BACKGROUNDS = "dark, light"
DEFAULT_FORMATS = "svg"
DEFAULT_PAGE = "preview.html"
DEFAULT_PAGE_SINGLE = "preview_single.html"
DEFAULT_LANGUAGE = "fr"

LOT_IDS = ("lots",)
NOTE_IDS = ("notes",)
GUIDE_IDS = ("guide",)
ELEMENT_IDS = ("elements",)
FOOTER_IDS = ("footer",)
ELIMINATION_IDS = ("eliminations",)
BULLET_IDS = LOT_IDS + NOTE_IDS + GUIDE_IDS + FOOTER_IDS
PROSE_IDS = LOT_IDS + NOTE_IDS + GUIDE_IDS + ELEMENT_IDS + FOOTER_IDS + ELIMINATION_IDS

FIELD_ALIASES = {
    "id": "id", "identifiant": "id",
    "lang": "lang", "langue": "lang", "language": "lang",
    "sizes": "sizes", "tailles": "sizes",
    "backgrounds": "backgrounds", "fonds": "backgrounds",
    "formats": "formats", "format": "formats",
    "surface": "surface", "ref": "surface", "taille-surface": "surface",
    "preview": "preview", "fichier": "preview", "page": "preview",
    "preview_single": "preview_single", "fichier-monofichier": "preview_single",
    "single": "preview_single",
    "svg_folder": "svg_folder", "dossier-svg": "svg_folder", "dossier": "svg_folder",
    "key_prefix": "key_prefix", "prefix-local": "key_prefix",
    "folder_label": "folder_label", "label-dossier": "folder_label",
    "dossier-label": "folder_label",
    "title": "title", "titre": "title",
    "page_title": "page_title", "page-titre": "page_title", "fichier-titre": "page_title",
    "eyebrow": "eyebrow", "sur-titre": "eyebrow",
    "checks": "checks", "verifications": "checks",
    "files": "sources", "fichiers": "sources", "src": "sources", "dessin": "sources",
    "theme": "theme", "groupe": "theme",
    "name": "title",
    "note": "note", "description": "description", "desc": "description",
    "alt": "alt", "lot": "lot", "tags": "tags",
    "minutes": "minutes", "duree-min": "minutes", "duree": "minutes",
    "derived_from": "derived_from", "sous-version": "derived_from",
    "origin_from": "origin_from", "extrait-de": "origin_from", "de": "origin_from",
    "origin_into": "origin_into", "reuse-dans": "origin_into", "pour": "origin_into",
    "link_label": "link_label", "lien": "link_label",
    "link_url": "link_url", "url": "link_url",
}
REFUSED_FIELDS = {
    "eliminated": "ELIMINATED_IS_NOT_A_BOX",
    "final": "FINAL_IS_THE_CHECKBOX",
    "version-finale": "FINAL_IS_THE_CHECKBOX",
}
SETTINGS_ORDER = ("id", "lang", "sizes", "surface", "backgrounds", "formats", "preview",
                  "preview_single", "svg_folder", "key_prefix", "folder_label", "checks", "title",
                  "page_title", "eyebrow")

DOCUMENT_HEAD = re.compile(r"^#\s+(?P<text>.*?)\s*$")
GROUP_HEAD = re.compile(r"^##\s+(?P<rest>.*?)\s*$")
ENTRY_HEAD = re.compile(r"^###\s+(?:\[(?P<box>[ xX])\]\s*)?(?P<rest>.*?)\s*$")
FIELD = re.compile(r"^\s*[-*]\s*(?P<field>[^:]*?)\s*:\s?(?P<value>.*)$")
BULLET = re.compile(r"^\s*[-*]\s+(?P<value>.*?)\s*$")
LETTERS = re.compile(r"^[A-Za-z]+")
DASHES = (" — ", " - ", "\t")


class VdprError(Exception):
    """Raised with a CAPS token as its message."""


def base_of(entry_id: str) -> str:
    """The family a proposal belongs to: the letters it starts with."""
    match = LETTERS.match(entry_id or "")
    return match.group(0) if match else (entry_id or "")


def id_sort_key(entry_id: str) -> tuple:
    """Order inside a theme: family, then the bare letter, then sub-versions by digits/letters."""
    family = base_of(entry_id)
    tail = (entry_id or "")[len(family):]
    digits = re.match(r"\d+", tail)
    return (family.upper(), int(digits.group(0)) if digits else 0, tail)


def split_list(text_value: str) -> list:
    """Comma or semicolon separated values, `a = b` pairs kept whole."""
    return [item.strip() for item in re.split(r"[,;]", text_value or "") if item.strip()]


def attr(value: str) -> str:
    """Text as an HTML attribute value."""
    return html.escape(value or "", quote=True)


class Background:
    """One declared background a proposal is shown on."""

    def __init__(self, name: str, label: str = ""):
        self.name = name
        self.label = label or name

    def __repr__(self) -> str:
        return "<Background %s>" % self.name


class Entry:
    """One manifest entry: a proposal, or a line of the review's own prose."""

    def __init__(self, kind: str = "entry", ident: str = "", box=None, line: int = -1):
        self.kind = kind
        self.id = ident
        self.box = box
        self.line = line
        self.title = ""
        self.description = ""
        self.alt = ""
        self.note = ""
        self.theme = ""
        self.lot = ""
        self.minutes = ""
        self.tags = []
        self.derived_from = ""
        self.origin_from = []
        self.origin_into = []
        self.link_label = ""
        self.link_url = ""
        self.letter = ""
        self.sources = {}
        self.eliminated = False
        final = box is True
        self.final_value = final

    def add(self, field: str, value: str) -> None:
        """Set one `name: value` field; a refused field names the rule it broke."""
        name = field.strip().lower().replace(" ", "-")
        target = FIELD_ALIASES.get(name, name.replace("-", "_"))
        if target in REFUSED_FIELDS:
            raise VdprError("%s %s" % (REFUSED_FIELDS[target], self.id or self.title))
        if target == "sources":
            self.sources = parse_sources(value)
        elif target == "tags":
            self.tags = split_list(value)
        elif target in ("origin_from", "origin_into"):
            setattr(self, target, split_list(value))
        elif target == "link_label" and "|" in value:
            label, _, url = value.partition("|")
            self.link_label, self.link_url = label.strip(), url.strip()
        elif hasattr(self, target):
            setattr(self, target, value)
        else:
            raise VdprError("BAD_FIELD %s %s" % (field, self.id or self.title))

    @property
    def final(self) -> bool:
        """`Version finale`: the entry's checkbox, which is never an elimination."""
        return self.final_value

    @property
    def group(self) -> str:
        """The theme the card is shown in."""
        return self.theme

    @property
    def file(self) -> str:
        """The drawing the card leads with."""
        return next(iter(self.sources.values()), "")

    @property
    def files(self) -> list:
        return list(self.sources.values())

    @property
    def family(self) -> str:
        return base_of(self.id)

    @property
    def base(self) -> str:
        return attr(self.family)

    def base_key(self) -> str:
        return self.family.lower()

    def dom_id(self) -> str:
        return (self.id or self.title).lower().replace(" ", "-")

    def shared_file(self) -> str:
        """The one drawing a card carries for every background, when the list has no background key."""
        bare = [name for key, name in self.sources.items() if key.startswith("file")]
        return bare[0] if len(bare) == len(self.sources) and len(bare) == 1 else ""

    def file_for(self, background_name: str) -> str:
        """The drawing of this card on one background: its own key, else the shared single drawing."""
        return self.sources.get(background_name) or self.shared_file()

    def src_of(self, token: str):
        """The card's own file per background name: one shared drawing, or a declared set."""

        def resolve(entry, background_name):
            return attr(entry.file_for(background_name)) + "?v=" + token

        return resolve

    @property
    def sort_key(self) -> tuple:
        return id_sort_key(self.id)

    def __repr__(self) -> str:
        return "<Entry %s %s>" % (self.id, self.title)


class Group:
    """One `## ` section: a theme of proposals, or one of the review's prose sections."""

    def __init__(self, ident: str, title: str = "", line: int = -1):
        self.id = ident
        self.title = title or ident
        self.line = line
        self.note_lines = []
        self.entries = []

    @property
    def note(self) -> str:
        return " ".join(self.note_lines).strip()

    @property
    def is_theme(self) -> bool:
        return self.id not in PROSE_IDS

    def __repr__(self) -> str:
        return "<Group %s n=%d>" % (self.id, len(self.entries))


class Settings:
    """Sizes, backgrounds, formats and names: CLI over `vdpr.conf` over manifest over defaults."""

    def __init__(self, values: dict, review_folder, cli: dict = None, conf=None):
        folder = Path(review_folder)
        merged = dict(values or {})
        for key, value in read_conf(folder, conf).items():
            merged[key] = value
        for key, value in (cli or {}).items():
            if value is not None and key in SETTINGS_ORDER:
                merged[key] = value
        self.review_folder = folder
        self.id = merged.get("id") or folder.name
        self.lang = merged.get("lang") or DEFAULT_LANGUAGE
        self.title_text = merged.get("title") or ""
        self.page_title_text = merged.get("page_title") or ""
        self.eyebrow = merged.get("eyebrow") or ""
        self.sizes = parse_sizes(merged.get("sizes"))
        self.surface = parse_surface(merged.get("surface"), self.sizes)
        self.backgrounds = parse_backgrounds(merged.get("backgrounds"))
        self.formats = tuple(item.lstrip(".").lower()
                             for item in (split_list(merged.get("formats")) or [DEFAULT_FORMATS]))
        self.page_name = merged.get("preview") or DEFAULT_PAGE
        self.single_name = merged.get("preview_single") or DEFAULT_PAGE_SINGLE
        self.svg_folder = folder / (merged.get("svg_folder") or ".")
        self.key_prefix = merged.get("key_prefix") or ("vdpr-" + self.id.lower())
        self.checks = split_list(merged.get("checks"))
        self.folder_label = (merged.get("folder_label")
                             or ("./" if str(self.svg_folder) == str(folder)
                                 else self.svg_folder.name))
        self.ref_size = self.surface
        self.strip_sizes = [value for value in self.sizes if value != self.ref_size]

    @property
    def asset_folder(self):
        """Where the reviewed drawings live; the review folder itself unless one is declared."""
        return self.svg_folder

    @property
    def page(self):
        return self.review_folder / self.page_name

    @property
    def single_page(self):
        return self.review_folder / self.single_name


class Review:
    """A whole review: the manifest text, the model read out of it, and the path back."""

    def __init__(self, path, lines, settings: Settings, groups, problems, ended_newline=True):
        self.path = path
        self.lines = lines
        self.settings = settings
        self.groups = groups
        self.problems = problems
        self.ended_newline = ended_newline
        self.eliminatedIds = set()
        self.restoredIds = set()

    def __getattr__(self, name):
        """Settings shortcuts, so a caller can read `review.eyebrow` or `review.lang`."""
        if name.startswith("_"):
            raise AttributeError(name)
        try:
            return getattr(self.settings, name)
        except AttributeError:
            raise AttributeError(name) from None

    @property
    def themes(self) -> list:
        return [group for group in self.groups if group.is_theme and group.entries]

    @property
    def groups_by_id(self) -> dict:
        return {group.id: group for group in self.groups}

    @property
    def proposals(self) -> list:
        return [entry for group in self.themes for entry in group.entries]

    @property
    def entries(self) -> dict:
        return {entry.id: entry for entry in self.proposals}

    def group(self, ident: str) -> str:
        group = self.groups_by_id.get(ident)
        return group.title if group else ident

    @property
    def elements(self) -> list:
        return self._prose(ELEMENT_IDS)

    @property
    def elements_group(self) -> Group:
        for group in self.groups:
            if group.id in ELEMENT_IDS:
                return group
        return Group(ELEMENT_IDS[0], "elements")

    @property
    def lots(self) -> list:
        return self._prose(LOT_IDS)

    @property
    def guide(self) -> list:
        return [entry.title or entry.description for entry in self._prose(GUIDE_IDS)]

    @property
    def notes(self) -> list:
        return [entry.title or entry.description for entry in self._prose(NOTE_IDS)]

    @property
    def footers(self) -> list:
        return self._prose(FOOTER_IDS)

    def _prose(self, names: tuple) -> list:
        out = []
        for group in self.groups:
            if group.id in names:
                out.extend(group.entries)
        return out

    def h1(self, total: int, strings) -> str:
        """The header line: the manifest's own, with `{n}` filled, else the language default."""
        if self.settings.title_text:
            return self.settings.title_text.replace("{n}", str(total))
        return strings.text("h1_default", n=total)

    def page_title(self, strings) -> str:
        return self.settings.page_title_text or strings.key("page_title")

    def dumps(self) -> str:
        """The manifest text: byte for byte, unless a decision changed one box."""
        body = "\n".join(self.lines)
        return body + ("\n" if self.ended_newline and body else "")

    def set_final(self, entry_id: str, value: bool) -> None:
        """Flip one entry's checkbox in place - the only edit a tool may make to a manifest."""
        for entry in self.proposals:
            if entry.id != entry_id:
                continue
            if entry.box is None:
                raise VdprError("NO_CHECKBOX " + entry_id)
            current = "[x]" if entry.box else "[ ]"
            wanted = "[x]" if value else "[ ]"
            if current == wanted:
                return
            if self.lines[entry.line].count(current) != 1:
                raise VdprError("CHECKBOX_AMBIGUOUS " + entry_id)
            self.lines[entry.line] = self.lines[entry.line].replace(current, wanted, 1)
            entry.box = bool(value)
            entry.final_value = bool(value)
            return
        raise VdprError("UNKNOWN_ID " + entry_id)


def _add(entry: Entry, field, stripped: str, problems: list) -> None:
    """One `name: value` bullet, with the rule breach reported instead of raised."""
    try:
        entry.add(field.group("field"), field.group("value").strip())
    except VdprError as exc:
        problems.append("%s %s" % (exc, stripped))


def _prose_entry(group: Group, value: str, number: int) -> Entry:
    """A header-prose bullet: the sentence itself, with a trailing `| <url>` carrying a link.

    The bullet's text is what the reviewer wrote to be read, so it is kept whole: a sentence that
    contains a dash ("... \u2014 ...") is one sentence, not an id and a title. The split is still read
    out to name the entry, and the link keeps the text that stands before its url.
    """
    label, sep, url = value.partition(" | ")
    url = url.strip()
    ident, title = _partition(label)
    entry = Entry(group.id, ident, None, number)
    entry.title = label.strip()
    if sep and re.match(r"^(https?://|file:|\.{0,2}/)", url):
        entry.link_label, entry.link_url = (title or label).strip(), url
    return entry


def parse_sizes(value) -> list:
    """Declared pixel sizes; a malformed one is refused instead of guessed."""
    items = split_list(value) if isinstance(value, str) and value else list(
        DEFAULT_SIZES.replace(" ", "").split(","))
    sizes = []
    for item in items:
        digits = re.fullmatch(r"(\d+)\s*(?:px)?", item.strip(), re.I)
        if not digits:
            raise VdprError("BAD_SETTINGS tailles=%s" % item)
        sizes.append(int(digits.group(1)))
    return sorted(set(sizes))


def parse_surface(value, sizes: list) -> int:
    """The size a card is drawn at: the largest declared size unless the manifest names one."""
    if not value:
        return sizes[-1]
    digits = re.fullmatch(r"(\d+)\s*(?:px)?", str(value).strip(), re.I)
    if not digits:
        raise VdprError("BAD_SETTINGS surface=%s" % value)
    surface = int(digits.group(1))
    if surface not in sizes:
        raise VdprError("SURFACE_UNDECLARED %d" % surface)
    return surface


def parse_backgrounds(value: str) -> list:
    """`dark = Fond sombre, light = Fond clair`; a bare name is its own label."""
    items = split_list(value) if value else DEFAULT_BACKGROUNDS.replace(" ", "").split(",")
    out = []
    for item in items:
        name, sep, label = item.partition("=")
        out.append(Background(name.strip(), label.strip()))
    return out


def parse_sources(value: str) -> dict:
    """`fichiers:` as `background = file` pairs, or a bare file list."""
    sources = {}
    for item in split_list(value):
        name, sep, file_name = item.partition("=")
        if sep:
            sources[name.strip()] = file_name.strip()
        else:
            sources["file%d" % (len(sources) + 1)] = item
    return sources


def read_conf(review_folder, conf=None) -> dict:
    """`vdpr.conf` in the review folder: `KEY value` lines, `#` comments, manifest names allowed."""
    values = {}
    path = Path(conf) if conf else Path(review_folder) / CONF
    if not path.is_file():
        if conf:
            raise VdprError("CONF_MISSING " + str(path))
        return values
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.split("#", 1)[0].strip()
        if not line:
            continue
        key, _, value = line.partition(" ")
        key = key.strip().lower()
        name = FIELD_ALIASES.get(key, key)
        if name in SETTINGS_ORDER and value.strip():
            values[name] = value.strip()
    return values


def _partition(text_value: str) -> tuple:
    """Split `id — title` on the first dash spelling."""
    for dash in DASHES:
        if dash in text_value:
            head, _, tail = text_value.partition(dash)
            return head.strip(), tail.strip()
    return text_value.strip(), ""


def parse_manifest(path, raw: str, cli: dict = None, conf=None) -> Review:
    """The model read out of manifest *text*, keeping the raw lines for a byte-identical write back."""
    path = Path(path)
    ended_newline = raw.endswith("\n")
    lines = raw.split("\n")[:-1] if ended_newline else raw.split("\n")
    bullets = {}
    groups = []
    problems = []
    seen_ids = {}
    group = None
    entry = None
    document = ""
    for number, line in enumerate(lines):
        stripped = line.strip()
        if not group and not document and re.match(r"^#\s+\S", line):
            document = DOCUMENT_HEAD.match(line).group("text")
            continue
        head = GROUP_HEAD.match(line)
        if head:
            ident, title = _partition(head.group("rest"))
            group = Group(ident.lower(), title, number)
            groups.append(group)
            entry = None
            continue
        head = ENTRY_HEAD.match(line)
        if head:
            if group is None:
                problems.append("MANIFEST_NO_GROUP %d" % (number + 1))
                continue
            ident, title = _partition(head.group("rest"))
            box = head.group("box")
            entry = Entry("entry", ident, None if box is None else box != " ", number)
            entry.title = title
            if group.id in ELIMINATION_IDS:
                # An elimination is a letter in a list; a box there says the opposite of what it means.
                problems.append("ELIMINATED_IS_NOT_A_BOX %s" % (ident or title))
                entry = None
                continue
            if group.id in BULLET_IDS:
                # Header prose is written as plain bullets, never as a headed entry.
                problems.append("BULLET_ENTRY_EXPECTED %s %d" % (group.id, number + 1))
                continue
            if not group.is_theme:
                entry.kind = group.id
                entry.id = ident
            elif ident:
                _check_unique(ident, number, seen_ids, problems)
                entry.theme = group.id
            group.entries.append(entry)
            continue
        if group is None:
            field = FIELD.match(line)
            if field and field.group("field"):
                name = field.group("field").strip().lower()
                bullets[FIELD_ALIASES.get(name, name)] = field.group("value")
            continue
        if group is not None and group.id in ELIMINATION_IDS:
            bullet = BULLET.match(line)
            if bullet:
                _elimination_letter(bullet.group("value"), problems)
            elif stripped and not stripped.startswith("#"):
                problems.append("ELIMINATIONS_NOT_A_LIST %d" % (number + 1))
            continue
        if group is not None and group.id in BULLET_IDS:
            field = FIELD.match(line)
            if field and field.group("field").strip().lower() in FIELD_ALIASES and entry is not None:
                _add(entry, field, stripped, problems)
                continue
            bullet = BULLET.match(line)
            if bullet:
                entry = _prose_entry(group, bullet.group("value"), number)
                group.entries.append(entry)
            elif stripped and not stripped.startswith("#"):
                group.note_lines.append(stripped)
                entry = None
            continue
        if entry is not None:
            field = FIELD.match(line)
            if field and field.group("field"):
                _add(entry, field, stripped, problems)
                continue
            bullet = BULLET.match(line)
            if bullet:
                # A bare bullet under a proposal continues its copy; a card carries one description.
                if entry.description:
                    problems.append("BAD_ENTRY description+%s %s" % (stripped, entry.id))
                else:
                    entry.description = bullet.group("value")
                continue
        if group is not None and entry is None and stripped and not stripped.startswith("#") \
                and not line.lstrip().startswith(("-", "*")):
            group.note_lines.append(stripped)
    values = dict(bullets)
    values["page_title"] = values.get("page_title") or document
    settings = Settings(values, path.parent, cli, conf)
    review = Review(path, lines, settings, groups, problems, ended_newline)
    _finish(review, problems)
    return review


def load_manifest(path, cli: dict = None, conf=None) -> Review:
    """Read a review folder's `review.md` into the model."""
    path = Path(path)
    return parse_manifest(path, path.read_text(encoding="utf-8"), cli, conf)


def _check_unique(ident: str, number: int, seen: dict, problems: list) -> None:
    """One id may appear once; a repeated id cannot be selected, eliminated or restored."""
    if ident in seen:
        problems.append("DUPLICATE_ID %s lines=%d,%d" % (ident, seen[ident], number + 1))
    seen[ident] = number + 1


def _elimination_letter(value: str, problems: list) -> None:
    """Letters are collected by `_finish`; a box written in their list is refused here."""
    if value.startswith("["):
        problems.append("ELIMINATED_IS_NOT_A_BOX %s" % value)


def _finish(review: Review, problems: list) -> None:
    """Second pass: the elimination lists, family themes, sub-version order, and the rule tokens."""
    for group in review.groups:
        if group.id not in ELIMINATION_IDS:
            continue
        for offset, line in enumerate(review.lines[group.line + 1:], start=group.line + 1):
            bullet = BULLET.match(line)
            if not bullet:
                if line.strip() and not line.lstrip().startswith("#"):
                    break
                continue
            value = bullet.group("value")
            if value.startswith("+"):
                review.restoredIds.add(value[1:].strip())
            else:
                review.eliminatedIds.add(value)
    family_theme = {}
    for entry in review.proposals:
        family_theme.setdefault(entry.family, entry.theme)
        if entry.theme and review.groups_by_id.get(entry.theme) is None:
            problems.append("UNKNOWN_GROUP %s %s" % (entry.id, entry.theme))
    for entry in review.proposals:
        entry.eliminated = entry.id in review.eliminatedIds and entry.id not in review.restoredIds
        if entry.derived_from:
            known = {item.id for item in review.proposals} | set(family_theme)
            if entry.derived_from not in known:
                problems.append("UNKNOWN_DERIVED_FROM %s %s" % (entry.id, entry.derived_from))
            elif family_theme.get(entry.derived_from) or entry.theme:
                entry.theme = family_theme.get(entry.derived_from) or entry.theme
    seen_files = {}
    for entry in review.proposals:
        for name in entry.files:
            owner = seen_files.get(name)
            if not name:
                problems.append("BAD_ENTRY fichiers= vide %s" % entry.id)
            elif owner is not None and owner is not entry:
                # One drawing is one tile: a background set may repeat a file, two tiles may not.
                problems.append("DUPLICATE_FILE %s %s %s" % (name, owner.id, entry.id))
            else:
                seen_files[name] = entry
        if not entry.sources:
            problems.append("BAD_ENTRY fichiers= %s" % entry.id)
        elif not entry.title:
            problems.append("BAD_ENTRY titre= %s" % entry.id)
    for group in review.themes:
        group.entries.sort(key=lambda item: item.sort_key)
    if not review.proposals:
        problems.append("NO_ENTRIES")


def check_assets(review: Review, settings) -> list:
    """Every drawing the manifest names must be in the review's drawing folder."""
    problems = []
    for entry in review.proposals + review.elements:
        for name in entry.files:
            if not name or not (settings.svg_folder / name).is_file():
                problems.append("MISSING_ASSET %s %s" % (entry.id or entry.title, name))
    return problems


def validate(review: Review, settings) -> list:
    """All manifest rules in one pass; every failure carries its own token."""
    problems = list(review.problems)
    problems += check_assets(review, settings)
    declared = [background.name for background in settings.backgrounds]
    for entry in review.proposals + review.elements:
        # A card draws each background separately, or shares one drawing across all of them.
        keys = [key for key in entry.sources if not key.startswith("file")]
        for background in sorted(set(keys) - set(declared)):
            problems.append("BACKGROUND_UNDECLARED %s %s" % (entry.id, background))
        bare = [name for key in entry.sources if key.startswith("file")
                for name in [entry.sources[key]]]
        if len(bare) > 1:
            problems.append("FICHIERS_NON_ASSIGNES %s" % entry.id)
        if not entry.shared_file() and len(bare) < 2:
            for background in declared:
                if background not in entry.sources:
                    problems.append("BACKGROUND_MISSING %s %s" % (entry.id, background))
    if not re.fullmatch(r"[A-Za-z0-9-]+", settings.lang or ""):
        problems.append("BAD_SETTINGS langue=%s" % settings.lang)
    for value in settings.formats:
        if not re.fullmatch(r"[a-z0-9]+", value):
            problems.append("BAD_SETTINGS formats=%s" % value)
    if not settings.backgrounds:
        problems.append("BAD_SETTINGS fonds=")
    return problems


def verdict_lines(review: Review, settings, cache_token: str = "", gates: dict = None,
                  idempotence: dict = None, sizes: dict = None, roundtrip: str = "",
                  hashes: dict = None, failed: bool = False) -> list:
    """The CAPS verdict tokens of the F5 list: printed here, never rewritten anywhere else."""
    failed = failed or bool((gates or {}).get("failures"))
    tokens = ["VDPR_FAIL" if failed else "VDPR_OK", "REVIEW " + settings.id]
    tokens.append("TILES %d" % len(review.proposals))
    tokens.append("SECTIONS %d" % PAGE_SECTIONS)
    tokens.append("GROUP_GRIDS %d" % len(review.themes))
    tokens.append("ELEMENT_TILES %d" % len(review.elements))
    tokens.append("CHECKED %d" % len([e for e in review.proposals if e.final]))
    tokens.append("SEED_ELIMINATIONS %d" % len([e for e in review.proposals if e.eliminated]))
    tokens.append("LOTS %d" % len(review.lots))
    tokens.append("STRIPS %dx2" % len(settings.strip_sizes))
    tokens.append("SURFACE %dpx %s" % (settings.ref_size,
                                       " ".join(item.name for item in settings.backgrounds)))
    tokens.append("FORMATS " + " ".join(settings.formats))
    tokens.append("PAGE " + settings.page_name)
    tokens.append("PAGE_SINGLE " + settings.single_name)
    tokens.append("KEY_PREFIX " + settings.key_prefix)
    tokens.append("LANG_DECLARED " + settings.lang)
    if roundtrip:
        tokens.append("MANIFEST roundtrip=%s" % roundtrip)
    if cache_token:
        tokens.append("CACHE_TOKEN " + cache_token)
    if gates:
        tokens.append("ASSETS %d" % gates.get("assets", 0))
        tokens.append("IMAGES %d" % gates.get("images", 0))
    for name in ("preview", "preview_single"):
        if not idempotence or name not in idempotence:
            continue
        pair = (hashes or {}).get(name)
        prefix = ""
        if pair:
            prefix = "PRE_SHA256 %s=%s POST_SHA256 %s=%s " % (name, pair[0], name, pair[1])
        tokens.append(prefix + "IDEMPOTENT %s=%s" % (name, "yes" if idempotence[name] else "no"))
    if sizes and sizes.get("preview_single"):
        tokens.append("SINGLE_FILE_BUDGET %d" % ((sizes["preview_single"] + 1023) // 1024))
    if gates:
        failures = gates.get("failures") or []
        tokens.append("GATES ok" if not failures else "GATES FAIL " + " ".join(failures))
    return tokens


# The manifest this module tests itself against: every grammar shape the reader supports, once.
SELFTEST_MANIFEST = """# Comparaison des propositions de design

- id: selftest
- langue: fr
- titre: {n} propositions de test
- tailles: 24, 48, 72, 112
- fonds: dark = Fond sombre, light = Fond clair
- formats: svg
- fichier: preview.html
- fichier-monofichier: preview_single.html

## porte \u2014 Propositions portee
Un theme de test.

### [ ] A \u2014 robot de fete
- fichiers: dark = icon_a.svg, light = icon_a.svg
- description: premiere proposition.
- alt: A : robot
- lot: 1

### [x] A1 \u2014 variante
- fichiers: icon_a1.svg
- description: sous-version de A, deja verifiee.
- alt: A1 : variante
- derived_from: A

## lots
- 1 \u2014 Lot de test

## notes
- Fixture interne du tool.

## elements
### chapeau \u2014 Le chapeau
- fichiers: idea_a.svg
- de: A
- pour: A1

## eliminations
- A1
"""


def self_test() -> list:
    """Tokens proving the id order and the built-in defaults a silent manifest gets."""
    scrambled = ["L1", "O", "F2", "A", "L", "Z", "L1N", "F", "L2", "F1", "O2"]
    want = ["A", "F", "F1", "F2", "L", "L1", "L1N", "L2", "O", "O2", "Z"]
    got = sorted(scrambled, key=id_sort_key)
    tokens = ["IDSORT %s" % ("yes" if got == want else "no"),
              "IDSORT_ORDER " + " ".join(got)]
    settings = Settings({}, Path("selftest-review"))
    # Read the built-in manifest and write it back: the bytes must come out identical.
    parsed = parse_manifest(Path("selftest") / MANIFEST, SELFTEST_MANIFEST)
    tokens.append("MANIFEST roundtrip=%s"
                  % ("yes" if parsed.dumps() == SELFTEST_MANIFEST else "no"))
    tokens.append("DEFAULTS sizes=%s surface=%d strips=%d fonds=%s formats=%s page=%s/%s"
                  % (",".join(str(size) for size in settings.sizes), settings.surface,
                     len(settings.strip_sizes),
                     ",".join(item.name for item in settings.backgrounds),
                     ",".join(settings.formats), settings.page_name, settings.single_name))
    tokens.append("DEFAULTS_PREFIX " + settings.key_prefix)
    tokens.append("DEFAULTS_LANG " + settings.lang)
    return tokens
