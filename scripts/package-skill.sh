#!/usr/bin/env bash
# Package skill/ as hesperus.skill: a zip whose entries sit under a folder named
# after the skill (the format Claude's "Save skill" button and the skill-creator
# tooling use). Deterministic: fixed timestamps, sorted entries.
set -euo pipefail
cd "$(dirname "$0")/.."
out="${1:-hesperus.skill}"
python3 - "$out" <<'PY'
import sys, zipfile, pathlib, re
out = sys.argv[1]
src = pathlib.Path("skill")
text = (src / "SKILL.md").read_text()
m = re.search(r"^name:\s*(\S+)", text, re.M)
if not m:
    sys.exit("skill/SKILL.md has no `name:` in its frontmatter")
name = m.group(1)
files = sorted(p for p in src.rglob("*") if p.is_file() and ".DS_Store" not in p.name)
with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as z:
    for p in files:
        info = zipfile.ZipInfo(f"{name}/{p.relative_to(src).as_posix()}", date_time=(1980, 1, 1, 0, 0, 0))
        info.compress_type = zipfile.ZIP_DEFLATED
        info.external_attr = 0o644 << 16
        z.writestr(info, p.read_bytes())
print(f"wrote {out}: " + ", ".join(f"{name}/{p.relative_to(src).as_posix()}" for p in files))
PY
