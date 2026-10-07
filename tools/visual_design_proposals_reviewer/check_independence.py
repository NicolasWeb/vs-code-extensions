#!/usr/bin/env python3
"""Static proof that this tool stands alone: no shared layer, no external helper, stdlib only.

The forbidden names are built from pieces so that this file, which names them to forbid them,
never matches its own scan. Run it from anywhere; it only reads the package next to itself.
"""
from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
# Spelled in pieces: the scanner's own text must not satisfy the pattern it hunts.
FORBIDDEN = [
    "ai-" + "automation-" + "tools",
    "ai_" + "automation_" + "tools",
    "wsl" + "run",
    "ai_" + "ops",
    "project_" + "conf",
    "lib_" + "assert_" + "patch",
    "host_" + "calendar",
    "work_" + "schedule",
    "idle_" + "windows",
    "commit_" + "as_agent",
    "blade_" + "run",
    "publish_" + "tool",
    ".ai" + "_baseline",
    "one_" + "shot",
]
CODE = {".py", ".sh", ".js", ".css", ".html", ".htm", ".json", ".conf", ""}
DOC = {".md", ".txt"}
SKIP = {"output", "__pycache__", ".git"}
LOCAL_STEMS = {"visual_design_proposals_reviewer"}


def local(name: str) -> bool:
    """A module of this package, which the independence scan must not count as foreign."""
    return name in LOCAL_STEMS or name.startswith(("lib_vdpr", "lib_visual_"))


def scanned():
    """Every owned file of the package, in name order."""
    for path in sorted(ROOT.rglob("*")):
        if path.is_file() and not (SKIP & set(path.parts)) and path.suffix in CODE | DOC:
            yield path


def hits(path) -> list:
    """Lines of one file that name a forbidden helper."""
    out = []
    for number, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
        for needle in FORBIDDEN:
            if needle in line:
                out.append("INDEP_HIT %s:%d %s" % (path.relative_to(ROOT), number, needle))
    return out


def imports(path) -> set:
    """Top-level modules one file imports."""
    found = set()
    for line in path.read_text(encoding="utf-8").splitlines():
        stripped = line.strip()
        for verb in ("import ", "from "):
            if stripped.startswith(verb):
                found.add(stripped[len(verb):].split()[0].split(".")[0])
    return found


def foreign_imports() -> list:
    """Imports that are neither the standard library nor this package's own modules."""
    foreign = []
    for path in ROOT.rglob("*.py"):
        if "__pycache__" in path.parts:
            continue
        for name in imports(path):
            if name not in sys.stdlib_module_names and not local(name):
                foreign.append("IMPORT_FOREIGN %s %s" % (path.relative_to(ROOT), name))
    return foreign


def main() -> int:
    code, docs = [], []
    for path in scanned():
        (docs if path.suffix in DOC else code).extend(hits(path))
    foreign = foreign_imports()
    print("\n".join(code + docs + foreign))
    print("INDEP_CODE %d" % len(code))
    print("INDEP_DOCS %d" % len(docs))
    print("STDLIB_ONLY %s" % ("yes" if not foreign else "no"))
    independent = not code and not foreign
    print("INDEPENDENT %s %d" % ("yes" if independent else "no", len(code) + len(foreign)))
    return 0 if independent else 1


if __name__ == "__main__":
    sys.exit(main())
