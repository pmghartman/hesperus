#!/usr/bin/env bash
# Dev helper (macOS). Usage: scripts/dev.sh [build|test|qa|run]   (default: run)
#   build  release CLI + extension
#   test   cargo test + extension tests
#   qa     rebuild the QA repo (a fixture copy) and index it
#   run    build, qa, then open VS Code in an Extension Development Host
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
QA="${HESPERUS_QA_DIR:-$HOME/hesperus-qa}"
CLI="$ROOT/target/release/hesperus"

build() {
  (cd "$ROOT" && cargo build --release)
  (cd "$ROOT/vscode" && npm install --no-audit --no-fund && npm run build)
}

tests() {
  (cd "$ROOT" && cargo test)
  (cd "$ROOT/vscode" && npm test)
}

qa() {
  [ -x "$CLI" ] || build
  rm -rf "$QA"
  mkdir -p "$QA/.vscode"
  cp "$ROOT"/fixtures/go-basic/{go.mod,main.go} "$QA/"
  printf '{ "hesperus.cliPath": "%s" }\n' "$CLI" > "$QA/.vscode/settings.json"
  # Cache header records the commit, so the QA repo must be a git repo.
  git -C "$QA" init -q
  git -C "$QA" add -A
  git -C "$QA" -c user.email=qa@local -c user.name=qa commit -qm qa
  "$CLI" index "$QA" --scip "$ROOT/fixtures/go-basic/scip-go.index.scip"
}

run() {
  build
  qa
  if command -v code >/dev/null; then
    code --extensionDevelopmentPath="$ROOT/vscode" "$QA"
    echo "In the new window: Cmd+Shift+P > Hesperus: Open Graph"
  else
    echo "'code' not on PATH. In VS Code: Cmd+Shift+P > 'Shell Command: Install code command in PATH', or press F5 in $ROOT."
  fi
}

case "${1:-run}" in
  build) build ;;
  test) tests ;;
  qa) qa ;;
  run) run ;;
  *) sed -n '2,6p' "${BASH_SOURCE[0]}"; exit 1 ;;
esac
