#!/usr/bin/env python3
"""Visual design proposals reviewer — build a review page from its Markdown manifest.

`--review <folder>` holds `review.md` and the proposals it names. A build renders the folder page
and the single-file page, writes only when bytes change, re-reads what it wrote, and judges the
result with its own gates. Every verdict is a CAPS token, printed and kept in the report.
"""
from __future__ import annotations

import argparse
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent / "lib"))

import lib_vdpr_assets as assets  # noqa: E402
import lib_vdpr_compare as compare  # noqa: E402
import lib_vdpr_copy as copy  # noqa: E402
import lib_vdpr_page as page  # noqa: E402
import lib_vdpr_text as textlib  # noqa: E402
from lib_visual_design_proposals_reviewer import (  # noqa: E402
    MANIFEST, REPORT_STEM, SETTINGS_ORDER, VdprError, load_manifest, self_test, validate,
    verdict_lines)

ASSETS_DIR = Path(__file__).resolve().parent / "assets"
REPORT_COLLISION_WAIT = 2.0
# CLI option -> manifest setting name, so one override path serves every flag.
CLI_KEYS = {"page": "preview", "single_file": "preview_single", "sizes": "sizes",
            "formats": "formats"}


class Build:
    """One review build: the manifest read once, then both pages judged from what was emitted."""

    def __init__(self, args):
        self.args = args
        self.folder = Path(args.review).resolve()
        cli = {CLI_KEYS[name]: getattr(args, name) for name in CLI_KEYS
               if getattr(args, name) is not None}
        self.review = load_manifest(self.folder / MANIFEST, cli=cli, conf=args.conf)
        self.settings = self.review.settings
        self.token, self.asset_snapshot = assets.asset_state(
            self.settings.asset_folder, self.settings.formats)
        self.pages = self._targets()

    def _targets(self) -> dict:
        """Which pages this run emits: the single file alone when only it was asked for."""
        if self.args.single_file and not self.args.page:
            return {"preview_single": self.settings.single_page}
        if self.args.page and not self.args.single_file:
            return {"preview": self.settings.page}
        return {"preview": self.settings.page, "preview_single": self.settings.single_page}

    def _emit(self, rendered: str, single: str) -> list:
        """The pages this run emits, in name order: both by default, one when only one was asked."""
        wanted = []
        if "preview" in self.pages:
            wanted.append(("preview", rendered, self.settings.page))
        if "preview_single" in self.pages:
            wanted.append(("preview_single", single, self.settings.single_page))
        return wanted

    def strings(self):
        """The chrome of the review's language, with the review's own wording on top.

        A review may ship `text_<lang>.json` beside its manifest to reword one sentence of
        the tool's table. A migration must not rewrite prose the reviewer is reading, so
        the page he read stays the page he gets until he edits that wording himself.
        """
        return textlib.load(ASSETS_DIR, self.settings.lang,
                            textlib.review_override(self.settings))

    def run(self) -> tuple:
        """Validate and judge rendered pages, then write changes and run the review's rule packs."""
        problems = validate(self.review, self.settings)
        if problems:
            return ["VDPR_FAIL MANIFEST_FAIL"] + problems, 2
        strings = self.strings()
        rendered = page.render_page(self.review, self.settings, strings, ASSETS_DIR, self.token)
        single = page.embed_assets(rendered, self.settings.asset_folder, self.settings.formats)
        idempotence, sizes, hashes, pending, before = {}, {}, {}, [], {}
        emitted = [(which, text.encode("utf-8"), path)
                   for which, text, path in self._emit(rendered, single)]
        for which, data, path in emitted:
            old = path.read_bytes() if path.is_file() else None
            before[which] = old
            idempotence[which] = old == data
            sizes[which] = len(data)
            if old != data:
                pending.append((path, data))
            # PRE is what was on disk before, POST what the build produced.
            hashes[which] = (assets.blob_sha(old) if old is not None else "absent",
                             assets.blob_sha(data))
        judged = rendered
        gates = assets.run_gates(judged, self.settings, self.review, ASSETS_DIR)
        gates["failures"] += assets.card_cell_gate(judged, assets.backgrounds_of(judged),
                                                  self.settings.strip_sizes)
        roundtrip = self._roundtrip()
        if roundtrip != "yes":
            gates["failures"].append("MANIFEST_NOT_ROUNDTRIP")
        written = 0
        if gates["failures"]:
            pack_lines, run_failures = ["RULE_PACKS skipped: universal gate failure"], []
        elif missing_packs := assets.inspect_rule_packs(self.review, self.settings):
            pack_lines = ["RULE_PACKS preflight failed"] + missing_packs
            run_failures = missing_packs
        else:
            if not (self.args.dry_run or self.args.check):
                for path, data in pending:
                    path.parent.mkdir(parents=True, exist_ok=True)
                    path.write_bytes(data)
                    written += 1
            pack_lines, run_failures = assets.run_rule_packs(self.review, self.settings)
            if (self.args.dry_run or self.args.check) and self.review.checks and pending:
                run_failures.append("RULE_PACKS_PREVIEW_UNVERIFIED")
            try:
                manifest = (self.folder / MANIFEST).read_bytes()
            except OSError as exc:
                run_failures.append("MANIFEST_READ_ERROR %s: %s"
                                    % (exc.__class__.__name__, exc))
            else:
                if manifest != self.review.dumps().encode("utf-8"):
                    run_failures.append("MANIFEST_CHANGED_DURING_RUN")
            try:
                _, asset_snapshot = assets.asset_state(
                    self.settings.asset_folder, self.settings.formats)
            except OSError as exc:
                run_failures.append("ASSET_READ_ERROR %s: %s" % (exc.__class__.__name__, exc))
            else:
                if asset_snapshot != self.asset_snapshot:
                    run_failures.append("ASSETS_CHANGED_DURING_RUN")
            for which, data, path in emitted:
                try:
                    actual = path.read_bytes()
                except FileNotFoundError:
                    actual = None
                except OSError as exc:
                    run_failures.append("PAGE_READ_ERROR %s %s: %s"
                                        % (which, exc.__class__.__name__, exc))
                    continue
                preview = self.args.dry_run or self.args.check
                expected = before[which] if preview else data
                if actual != expected:
                    run_failures.append(("PAGE_CHANGED_DURING_PREVIEW " if preview else
                                         "PAGE_CHANGED_AFTER_BUILD ") + which)
                if not preview:
                    hashes[which] = (hashes[which][0],
                                     assets.blob_sha(actual) if actual is not None else "absent")
        failed = bool(gates["failures"] or run_failures)
        lines = verdict_lines(self.review, self.settings, self.token, gates, idempotence, sizes,
                              roundtrip=roundtrip, hashes=hashes, failed=failed)
        lines.append(("CHECK failed" if failed else "CHECK ok") if self.args.check else
                     ("DRY_RUN written=0" if self.args.dry_run else
                      "BUILD written=%d" % written))
        # The verdict function owns the one GATES token; each failure also gets its own detail line.
        lines += ["GATE " + failure for failure in gates["failures"]]
        lines += pack_lines
        lines += [failure for failure in run_failures if failure not in pack_lines]
        return lines, 1 if failed else 0

    def _roundtrip(self) -> str:
        """Reading the manifest and writing it back must reproduce it byte for byte."""
        path = self.folder / MANIFEST
        return "yes" if path.read_bytes() == self.review.dumps().encode("utf-8") else "no"


def exported(review, settings, target) -> int:
    """A self-contained offline copy: the manifest, both pages, and every drawing they read."""
    strings = textlib.load(ASSETS_DIR, settings.lang,
                           textlib.review_override(settings))
    rendered = page.render_page(review, settings, strings, ASSETS_DIR,
                                assets.asset_token(settings.asset_folder, settings.formats))
    files = {MANIFEST: review.dumps().encode("utf-8"),
             settings.page_name: rendered.encode("utf-8"),
             settings.single_name: page.embed_assets(rendered, settings.asset_folder,
                                                     settings.formats).encode("utf-8")}
    for source in sorted(settings.asset_folder.rglob("*")):
        name = assets.relative_name(settings.asset_folder, source)
        if source.is_file() and source.suffix[1:].lower() in settings.formats:
            files[name] = source.read_bytes()
    folder = Path(target)
    for name, data in sorted(files.items()):
        into = assets.safe_child(folder, name)
        into.parent.mkdir(parents=True, exist_ok=True)
        into.write_bytes(data)
    return len(files)


def check_parser(prog: str) -> argparse.ArgumentParser:
    """POSIX-style long options only; the tool never reads stdin."""
    parser = argparse.ArgumentParser(prog=prog, description=__doc__.splitlines()[0])
    parser.add_argument("--review", help="folder holding review.md and the proposals (required)")
    parser.add_argument("--page", help="name of the page that reads the drawings by reference")
    parser.add_argument("--single-file", dest="single_file",
                        help="name of the embedded page; alone, builds only that page")
    parser.add_argument("--sizes", help="override the declared sizes, comma separated px")
    parser.add_argument("--formats", help="override the accepted drawing formats")
    parser.add_argument("--conf", help="alternative conf file instead of the folder's vdpr.conf")
    parser.add_argument("--report-dir", dest="report_dir",
                        help="where the report goes (default: this tool's output folder)")
    parser.add_argument("--check", action="store_true", help="judge without writing anything")
    parser.add_argument("--dry-run", dest="dry_run", action="store_true",
                        help="report what would be written, write nothing")
    parser.add_argument("--self-test", dest="self_test", action="store_true",
                        help="run the tool's own regression guards")
    parser.add_argument("--compare", metavar="PAGE", help="judge another page against the current build")
    parser.add_argument("--export", metavar="FOLDER", help="write an offline copy of the review there")
    parser.add_argument("--version", action="store_true", help="print the tool name and stop")
    return parser


def write_report(lines: list, report_dir) -> Path:
    """Report file plus stdout echo: the same words in both, so a reader never has to choose."""
    path = Path(report_dir) if report_dir else Path(__file__).resolve().parent / "output"
    path.mkdir(parents=True, exist_ok=True)
    deadline = time.monotonic() + REPORT_COLLISION_WAIT
    while True:
        full = path / (REPORT_STEM + time.strftime("%Y%m%d-%H%M%S") + ".txt")
        try:
            with full.open("x", encoding="utf-8", newline="\n") as report:
                report.write("\n".join(lines) + "\n")
            return full
        except FileExistsError as exc:
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                raise OSError("REPORT_NAME_COLLISION " + str(full)) from exc
            time.sleep(min(0.05, remaining))


def compare_pair(build, other) -> list:
    """`compare`: another page against the page this manifest now renders, over the F4 surface."""
    path = Path(other)
    if not path.is_file():
        raise VdprError("COMPARE_SOURCE_MISSING " + str(path))
    strings = build.strings()
    mine = page.render_page(build.review, build.settings, strings, ASSETS_DIR, build.token)
    equivalent, deltas = compare.diff(mine, path.read_text(encoding="utf-8"))
    return ["EQUIVALENT " + ("yes" if equivalent else "no")] + deltas


# A guard that never reports its own failure would silently pass: absence of the pass token is a failure.
SELF_TEST_WANT = ("SABOTAGE_DETECTED yes", "MANIFEST roundtrip=yes", "MARKER roundtrip=yes")


def self_test_failed(lines: list) -> list:
    """Any guard answering `no` fails the run; a sabotage line answers `no` by design."""
    bad = []
    for line in lines:
        if line.startswith("SABOTAGE "):
            if "detected=no" in line:
                bad.append(line)
            continue
        if any(field == "no" or field.endswith("=no") for field in line.split()[1:]):
            bad.append(line)
    return bad + [line for line in SELF_TEST_WANT if line not in lines]


def main(argv=None) -> int:
    args = check_parser("visual_design_proposals_reviewer.py").parse_args(argv)
    try:
        if args.version:
            print("TOOL visual_design_proposals_reviewer")
            return 0
        if args.self_test:
            lines = self_test() + compare.self_test() + copy.self_test()
            lines.append("MARKER roundtrip=%s"
                         % ("yes" if page.marker_round_trip(ASSETS_DIR) else "no"))
            failed = self_test_failed(lines)
            lines.append("SELF_TEST_FAIL " + " | ".join(failed) if failed else "SELF_TEST ok")
            try:
                write_report(lines, args.report_dir)
            except OSError as exc:
                lines[-1] = "SELF_TEST_FAIL REPORT_ERROR %s: %s" % (exc.__class__.__name__, exc)
                print("\n".join(lines))
                return 1
            print("\n".join(lines))
            return 1 if failed else 0
        if not args.review:
            raise VdprError("REVIEW_FOLDER_MISSING --review")
        build = Build(args)
        if args.compare:
            lines = ["REVIEW " + build.settings.id] + compare_pair(build, args.compare)
            code = 1 if lines[1] == "EQUIVALENT no" else 0
        elif args.export:
            count = exported(build.review, build.settings, args.export)
            lines = ["REVIEW " + build.settings.id, "EXPORT %s files=%d" % (args.export, count)]
            code = 0
        else:
            lines, code = build.run()
        # Every run keeps its verdict in a report; --dry-run is the one mode that writes nothing.
        if not args.dry_run:
            try:
                report = write_report(lines, args.report_dir)
            except OSError as exc:
                if lines and lines[0] == "VDPR_OK":
                    lines[0] = "VDPR_FAIL"
                elif not lines or not lines[0].startswith("VDPR_FAIL"):
                    lines.insert(0, "VDPR_FAIL")
                lines.append("REPORT_ERROR %s: %s" % (exc.__class__.__name__, exc))
                print("\n".join(lines))
                return 1
            lines.append("REPORT " + str(report))
        print("\n".join(lines))
        return code
    except (VdprError, page.VdprPageError) as exc:
        print("VDPR_FAIL " + str(exc))
        return 1
    except OSError as exc:
        print("VDPR_FAIL " + str(exc))
        return 1


if __name__ == "__main__":
    sys.exit(main())
