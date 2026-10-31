#!/usr/bin/env bash
# Set one version everywhere: the extension, the extractor package and the Rust workspace.
#   scripts/set-version.sh 0.2.0
set -euo pipefail
cd "$(dirname "$0")/.."
v="${1:?usage: scripts/set-version.sh X.Y.Z}"
[[ "$v" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || { echo "not a version: $v" >&2; exit 2; }
npm version "$v" --no-git-tag-version --allow-same-version >/dev/null
(cd hesperus-ts && npm version "$v" --no-git-tag-version --allow-same-version >/dev/null)
python3 - "$v" <<'PY'
import re, sys
v = sys.argv[1]
p = "Cargo.toml"
s = open(p).read()
s2 = re.sub(r'(\[workspace\.package\]\s*\nversion = ")[^"]+(")', rf'\g<1>{v}\2', s, count=1)
assert s2 != s or f'version = "{v}"' in s, "workspace version not found"
open(p, "w").write(s2)
PY
cargo update -p hesp -p hesperus-core -p hesperus-lsp --quiet
echo "version $v set in package.json, hesperus-ts/package.json, Cargo.toml, Cargo.lock"
