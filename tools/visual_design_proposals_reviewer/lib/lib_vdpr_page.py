#!/usr/bin/env python3
"""The gallery page: skeleton, tiles, element tiles, sections, summary, bar, footer.

Every visible string comes from the text layer, every size and background from the review
manifest, and the page CSS and triage script come from the `assets/` templates. The page is a
projection of the review model: nothing here reads a page back.
"""
from __future__ import annotations

import base64
import html
import re

TRIAGE_START = "    /* triage-ui:start */"
TRIAGE_END = "    /* triage-ui:end */"
STYLE_CLOSE = "  </style>"
SECTION_COUNT = 3
MARKER = re.compile(r"@@([A-Z0-9_]+)@@")
CSS_SLOT = re.compile(r"\{([A-Z][A-Z0-9_]*)\}")

SURFACE_MIME = {
    "svg": "image/svg+xml", "png": "image/png", "jpg": "image/jpeg",
    "jpeg": "image/jpeg", "gif": "image/gif", "webp": "image/webp",
}

CARD = """      <div class="candidate{elim_class}" data-letter="{up}" data-default-eliminated="{pressed}"\
 data-default-final="{final}" data-theme="{theme}" data-base="{base}">
        <button type="button" class="eliminate" data-letter="{up}" title="{elim_title}"
          aria-label="{elim_aria}" aria-pressed="{pressed}">\u00d7</button>
        <button type="button" class="ver-badge {badge_class}" data-letter="{up}"\
 aria-pressed="{pressed_final}" title="{badge_title}">{badge_text}</button>
        <input type="radio" name="favorite" id="{tile_id}" value="{up}" aria-labelledby="title-{tile_id}">
        <label class="card" for="{tile_id}">
          <div class="heading"><span class="letter">{up}</span><h2 id="title-{tile_id}">{title}</h2></div>
          <p class="description">{desc}</p>
{note}          <div class="surfaces">
{surfaces}          </div>
          <div class="sizes">{sizes}</div>
          <span class="choice"><span class="unselected">{select}</span>\
<span class="selected">{selected}</span></span>
        </label>
      </div>
"""

ELEMENT_CARD = """      <div class="icard" lang="{lang}" data-idea="{key}">
        <div class="surfaces">
{surfaces}        </div>
        <div class="heading"><span class="letter">{letter}</span><h2>{title}</h2></div>
        <p class="description" lang="{lang}">{desc}</p>
        <p class="origins" lang="{lang}">{origins}</p>
        <div class="sizes">{sizes}</div>
      </div>
"""

LEGEND = ('    <fieldset>\n      <legend><span lang="{lang}">{title}</span> '
          '<span class="tcount" data-theme="{gid}">0 / {total}</span></legend>\n')


class VdprPageError(Exception):
    """Raised with a CAPS token as its message."""


def esc(value: str) -> str:
    return html.escape(value or "", quote=True)


def css_string(value: str) -> str:
    if "\x00" in value:
        raise VdprPageError("CSS_TEXT_NUL")
    return "".join(
        "\\%x " % ord(char) if char in '"\\<' or ord(char) < 32 or ord(char) == 127 else char
        for char in value
    )


def load_template(assets_dir, name: str) -> str:
    path = assets_dir / name
    if not path.is_file():
        raise VdprPageError("TEMPLATE_MISSING " + name)
    return path.read_text(encoding="utf-8")


def fill(template: str, mapping: dict, name: str) -> str:
    """Replace `@@NAME@@` and `{NAME}` markers, refusing to leave a placeholder behind."""
    for key, value in mapping.items():
        template = template.replace("@@%s@@" % key, value).replace("{%s}" % key, value)
    leftover = sorted(set(MARKER.findall(template)))
    leftover += sorted(key for key in mapping if "{" + key + "}" in template)
    if leftover:
        raise VdprPageError("TEMPLATE_SLOT_UNFILLED %s %s" % (name, " ".join(leftover)))
    return template


def fill_css(template: str, mapping: dict[str, str]) -> str:
    slots = set(CSS_SLOT.findall(template))
    missing = sorted(set(mapping) - slots)
    unknown = sorted(slots - set(mapping))
    if missing or unknown:
        raise VdprPageError("CSS_TEMPLATE_SLOTS missing=%s unknown=%s" % (missing, unknown))
    return CSS_SLOT.sub(lambda match: mapping[match.group(1)], template)


def triage_block(triage_css: str) -> str:
    """The owned CSS block, marker delimited, ready to live in the page head."""
    return TRIAGE_START + "\n" + triage_css.rstrip("\n") + "\n" + TRIAGE_END + "\n"


def inject_css(head: str, block: str) -> str:
    """Keep exactly one copy of the owned style block: markers win, else insert before </style>."""
    start, end = head.find(TRIAGE_START), head.find(TRIAGE_END)
    if start != -1 and end > start:
        return head[:start] + block + head[end + len(TRIAGE_END) + 1:]
    if STYLE_CLOSE not in head:
        raise VdprPageError("STYLE_NOT_CLOSED")
    return head.replace(STYLE_CLOSE, block + STYLE_CLOSE, 1)


def strip_css(head: str) -> str:
    """Remove the owned block, which is what makes the marker round-trip provable."""
    start, end = head.find(TRIAGE_START), head.find(TRIAGE_END)
    if start == -1 or end <= start:
        return head
    return head[:start] + head[end + len(TRIAGE_END) + 1:]


def marker_round_trip(assets_dir) -> bool:
    """Inject, strip, inject again: the marked block must come back byte for byte."""
    block = triage_block(load_template(assets_dir, "triage.css"))
    head = "<style>\n    body { margin:0; }\n" + STYLE_CLOSE + "\n</head>\n"
    once = inject_css(head, block)
    twice = inject_css(once, block)
    return twice == once and strip_css(once) == head and inject_css(strip_css(once), block) == once


def surfaces(entry, src_of, settings, strings, first_alt=True) -> str:
    """One surface per declared background, at the reference size.

    `src_of(entry, background_name)` is the review's own mapping, so a proposal drawn once shares
    its file across backgrounds while a per-background drawing set is shown file by file.
    """
    out = []
    for index, background in enumerate(settings.backgrounds):
        alt = esc(entry.alt) if (index == 0 and first_alt) else ""
        caption = esc(strings.text("surface_caption", label=background.label,
                                   size=settings.ref_size))
        out.append('            <div class="surface %s"><img src="%s" width="%d" height="%d" '
                   'alt="%s"><span class="caption">%s</span></div>\n'
                   % (esc(background.name), esc(src_of(entry, background.name)),
                      settings.ref_size, settings.ref_size, alt, caption))
    return "".join(out)


def size_strip(entry, src_of, settings, strings) -> str:
    """One image per declared size except the reference size shown on the surfaces."""
    cells = []
    strip_background = settings.backgrounds[0].name if settings.backgrounds else ""
    for px in settings.strip_sizes:
        cells.append('<div class="size"><img src="%s" width="%d" height="%d" alt="">'
                     '<span>%s</span></div>'
                     % (esc(src_of(entry, strip_background)), px, px,
                        esc(strings.text("size_caption", size=px))))
    return "".join(cells)


def render_tile(entry, settings, strings, token: str) -> str:
    """One proposal tile: controls, copy, one surface per background, one cell per size."""
    note = ('          <p class="adapt">%s</p>\n' % esc(entry.note)) if entry.note else ""
    return CARD.format(
        elim_class=" eliminated" if entry.eliminated else "",
        up=entry.id, tile_id=entry.dom_id(),
        pressed="true" if entry.eliminated else "false",
        final="true" if entry.final else "false",
        theme=entry.group, base=entry.base,
        elim_title=esc(strings.text("eliminate_title", id=entry.id)),
        elim_aria=esc(strings.text("eliminate_aria", id=entry.id)),
        badge_class="final" if entry.final else "work",
        pressed_final="true" if entry.final else "false",
        badge_title=esc(strings.text("badge_title", id=entry.id)),
        badge_text=esc(strings.key("final_text") if entry.final else strings.key("work_text")),
        title=esc(entry.title), desc=esc(entry.description),
        surfaces=surfaces(entry, entry.src_of(token), settings, strings),
        note=note,
        sizes=size_strip(entry, entry.src_of(token), settings, strings),
        select=esc(strings.text("select_label", id=entry.id)),
        selected=esc(strings.text("selected_label", id=entry.id)),
    )


def render_element(entry, review, settings, strings, token: str) -> str:
    """One reusable-element tile: the drawn element, its origins, its uses, its sizes."""

    def named(letters):
        parts = []
        for letter in letters:
            other = review.entries.get(letter)
            filing = esc(other.files[0]) if other and other.files else "?"
            parts.append("<code>%s</code> <span class=\"file\">%s</span>" % (esc(letter), filing))
        return ", ".join(parts)

    origins = "<b>%s</b> %s &nbsp;\u00b7&nbsp; " % (esc(strings.key("origins_from")),
                                                    named(entry.origin_from))
    if entry.origin_into:
        origins += "<b>%s</b> %s" % (esc(strings.key("origins_into")), named(entry.origin_into))
    else:
        origins += "<b>%s</b> %s" % (esc(strings.key("origins_into")),
                                     esc(strings.key("origins_none")))
    return ELEMENT_CARD.format(
        lang=strings.lang, key=esc(entry.dom_id()), letter=esc(entry.letter or entry.base_key()),
        surfaces=surfaces(entry, entry.src_of(token), settings, strings),
        title=esc(entry.title), desc=esc(entry.description or entry.note),
        origins=origins, sizes=size_strip(entry, entry.src_of(token), settings, strings),
    )


def legend_row(group, strings) -> str:
    return LEGEND.format(lang=strings.lang, title=esc(group.title), gid=esc(group.id),
                         total=len(group.entries))


def header_block(review, settings, strings, counts) -> str:
    """Header: eyebrow, title, delivered lots, review notes, review guide, summary."""
    bits = ['    <div class="eyebrow">%s</div>\n' % esc(review.eyebrow)]
    bits.append('    <h1>%s</h1>\n' % esc(review.h1(len(review.proposals), strings)))
    if review.lots:
        bits.append('    <p class="lotslabel" lang="%s">%s</p>\n'
                    % (strings.lang, esc(strings.key("lots_label"))))
        items = "".join("<li>%s</li>" % strings.text("lot_line", num=lot.id,
                                                     title=esc(lot.title))
                        + (" \u2014 " + esc(lot.note) if lot.note else "")
                        for lot in review.lots)
        bits.append('    <ul class="lots" lang="%s">%s</ul>\n' % (strings.lang, items))
    for note in review.notes:
        bits.append('    <p class="notes" lang="%s">%s</p>\n' % (strings.lang, esc(note)))
    if review.guide:
        bits.append('    <p class="guide-title" lang="%s">%s</p>\n'
                    % (strings.lang, esc(strings.key("guide_title"))))
        bits.append('    <ul class="guide" lang="%s">%s</ul>\n'
                    % (strings.lang, "".join("<li>%s</li>" % esc(line) for line in review.guide)))
    all_total = counts["total"]
    bits.append('  <div id="summary"><span>%s<b id="kept-count">%d</b></span>'
                '<span>%s<b id="gone-count">%d</b></span>'
                '<button type="button" id="show-all" lang="%s">%s</button>'
                '<button type="button" id="show-all-versions" lang="%s">%s</button>'
                '<button type="button" id="mark-all-final" lang="%s">%s (<b id="final-count">'
                '%d</b>)</button>'
                '<span class="scope" lang="%s">%s</span></div>\n'
                % (esc(strings.key("summary_kept")), counts["kept"],
                   esc(strings.key("summary_gone")), counts["gone"],
                   strings.lang, esc(strings.text("button_show_all", n=all_total)),
                   strings.lang, esc(strings.key("button_work_versions")),
                   strings.lang, esc(strings.key("button_mark_final")), counts["kept"],
                   strings.lang, esc(strings.key("summary_scope"))))
    return "".join(bits)


def sections_block(review, settings, strings, token: str) -> str:
    """Three sections: proposals group by group, reusable elements, and the eliminated mirror."""
    out = ['  <section class="batch" id="design-section">\n'
           '    <h2><span lang="%s">%s</span></h2>\n'
           '    <p class="batchnote" lang="%s">%s</p>\n'
           % (strings.lang, esc(strings.key("section_design")), strings.lang,
              esc(strings.key("note_design")))]
    for group in review.themes:
        out.append(legend_row(group, strings))
        out.append('      <div class="grid" data-theme="%s">\n' % esc(group.id))
        out.extend(render_tile(entry, settings, strings, token) for entry in group.entries)
        out.append("      </div>\n    </fieldset>\n")
    out.append("  </section>\n")

    out.append('  <section class="batch" id="ideas-section">\n'
               '    <h2><span lang="%s">%s</span></h2>\n'
               '    <p class="batchnote" lang="%s">%s</p>\n'
               '    <fieldset>\n      <legend><span lang="%s">%s</span> (%d)</legend>\n'
               '      <div class="grid">\n'
               % (strings.lang, esc(strings.key("section_elements")), strings.lang,
                  esc(strings.key("note_elements")), strings.lang,
                  esc(review.elements_group.title), len(review.elements)))
    out.extend(render_element(entry, review, settings, strings, token)
               for entry in review.elements)
    out.append("      </div>\n    </fieldset>\n  </section>\n")

    out.append('  <section class="batch" id="eliminated-section">\n'
               '    <h2><span lang="%s">%s</span> (<span id="elim-count">0</span>)</h2>\n'
               '    <p class="batchnote" lang="%s">%s</p>\n'
               % (strings.lang, esc(strings.key("section_eliminated")), strings.lang,
                  esc(strings.key("note_eliminated"))))
    for group in review.themes:
        out.append(legend_row(group, strings))
        out.append('      <div class="grid" data-theme="%s"></div>\n    </fieldset>\n'
                   % esc(group.id))
    out.append("  </section>\n")
    return "".join(out)


def footer_block(review, settings, strings) -> str:
    """Footer prose is review data; the folder slot and the offline note stay there whichever."""
    body = []
    slot = '<strong id="icons-folder">%s</strong>' % esc(settings.folder_label)
    used_slot = False
    for entry in review.footers:
        text = entry.description or entry.note or entry.title
        used_slot = used_slot or "{folder_slot}" in text
        line = esc(text).replace(esc("{folder_slot}"), slot)
        if entry.link_label and entry.link_url:
            line = '<a href="%s">%s</a> \u00b7 %s' % (esc(entry.link_url),
                                                      esc(entry.link_label), line)
        body.append("    <p>%s</p>\n" % line)
    if not used_slot:
        text = esc(strings.key("footer_offline")).replace("{folder_slot}", slot)
        body.append("    <p>%s</p>\n" % text)
    return "  <footer>" + "".join(body) + "</footer>\n"


def triage_bar(strings) -> str:
    return ('  <div id="triage-bar" role="toolbar" aria-label="%s">'
            '<span class="barlabel" lang="%s">%s</span>'
            '<button type="button" id="hide-elim" lang="%s">%s</button>'
            '<span class="hint" lang="%s">%s</span></div>\n'
            % (esc(strings.key("bar_aria")), strings.lang, esc(strings.key("bar_label")),
               strings.lang, esc(strings.key("bar_hide_label")),
               strings.lang, esc(strings.key("bar_hint"))))


def triage_script(assets_dir, settings, strings) -> str:
    """The triage script, filled with this review's key prefix and chrome words."""
    body = fill(load_template(assets_dir, "triage.js"), {
        "KEY_PREFIX": settings.key_prefix,
        "FINAL_TEXT": strings.key("final_text"),
        "WORK_TEXT": strings.key("work_text"),
        "FINAL_HINT": strings.key("final_hint"),
        "WORK_HINT": strings.key("work_hint"),
        "BAR_SHOW_LABEL": strings.key("bar_show_label"),
        "BAR_HIDE_LABEL": strings.key("bar_hide_label"),
        "BAR_TOGGLE_TITLE": strings.key("bar_toggle_title"),
    }, "triage.js")
    return "  <script>\n" + body.rstrip("\n") + "\n  </script>\n"


def render_page(review, settings, strings, assets_dir, token: str) -> str:
    """Assemble the folder page from the skeleton, the CSS templates and the review model."""
    skeleton = load_template(assets_dir, "page.html")
    base_css = fill(load_template(assets_dir, "base.css"),
                    {"REF_SIZE": str(settings.ref_size)}, "base.css")
    counts = {"total": len(review.proposals),
              "gone": sum(1 for entry in review.proposals if entry.eliminated),
              "kept": sum(1 for entry in review.proposals if not entry.eliminated)}
    page = fill(skeleton, {
        "LANG": strings.lang,
        "TITLE": esc(review.page_title(strings)),
        "BASE_CSS": base_css,
        "HEADER": header_block(review, settings, strings, counts),
        "SECTIONS": sections_block(review, settings, strings, token),
        "FOOTER": footer_block(review, settings, strings),
        "TRIAGE_BAR": triage_bar(strings),
        "SCRIPT": triage_script(assets_dir, settings, strings),
    }, "page.html")
    triage_css = fill_css(load_template(assets_dir, "triage.css"), {
        "EMPTY_GRID_LABEL": css_string(strings.key("empty_grid_label")),
        "ELIMINATED_LABEL": css_string(strings.key("eliminated_label")),
    })
    head, close, tail = page.partition(STYLE_CLOSE)
    page = inject_css(head + close, triage_block(triage_css)) + tail
    return page


def embed_assets(page: str, folder, formats) -> str:
    """Project the folder page onto one file: every asset request becomes a data URI.

    The key is the folder's relative path over its declared folder, so a review that keeps
    drawings in a subfolder still embeds them.
    """
    def to_data(path, suffix):
        mime = SURFACE_MIME.get(suffix)
        if not mime:
            raise VdprPageError("EMBED_MIME " + path.name)
        return "data:%s;base64,%s" % (mime, base64.b64encode(path.read_bytes()).decode("ascii"))

    def absolute(match):
        name, query = match.group(1), match.group(2) or ""
        path = (folder / name)
        if not path.is_file():
            raise VdprPageError("EMBED_ASSET_MISSING " + name)
        suffix = name.rsplit(".", 1)[-1].lower()
        return 'src="%s%s"' % (to_data(path, suffix), query)

    def relative(root, match):
        name, query = match.group(1), match.group(2) or ""
        path = root / name if root else folder / name
        if not path.is_file():
            raise VdprPageError("EMBED_ASSET_MISSING " + name)
        return "src=\"%s%s\"" % (to_data(path, name.rsplit(".", 1)[-1].lower()), query)

    suffixes = "|".join(sorted(re.escape(item) for item in formats))
    page = re.sub(r'src="(file://[^"]+?)((?:\?[^"]*)?)"', absolute, page)
    if not page.startswith("data:"):
        root = _page_root(page)
        page = re.sub(r'src="([^"?#:/\\]+\.(?:%s))((?:\?[^"]*)?)"' % suffixes,
                      lambda match: relative(root, match), page)
    return page


def _page_root(page: str):
    """The folder a page's own file:// asset paths are relative to, if the page states one."""
    from pathlib import Path, PurePosixPath  # local import keeps the module light
    import urllib.parse
    match = re.search(r'file://(/[^"\']+?\.(?:svg|png|jpe?g|gif|webp))', page)
    if not match:
        return None
    path = urllib.parse.unquote(match.group(1))
    try:
        return PurePosixPath(path).parent
    except (ValueError, OSError):
        return Path(path).parent
