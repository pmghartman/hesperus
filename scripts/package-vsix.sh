#!/usr/bin/env bash
# Build a self-contained, platform-specific .vsix: the extension, the hesp and
# hesperus-lsp binaries for this machine, and the extractor bundled into one file.
#
#   scripts/package-vsix.sh            # target inferred from the host
#   scripts/package-vsix.sh linux-x64  # explicit VS Code target name
set -euo pipefail
cd "$(dirname "$0")/.."

target="${1:-}"
if [ -z "$target" ]; then
  case "$(uname -s)-$(uname -m)" in
    Darwin-arm64) target=darwin-arm64 ;;
    Darwin-x86_64) target=darwin-x64 ;;
    Linux-x86_64) target=linux-x64 ;;
    Linux-aarch64) target=linux-arm64 ;;
    MINGW*|MSYS*|CYGWIN*) target=win32-x64 ;;
    *) echo "unknown host; pass a target (darwin-arm64, darwin-x64, linux-x64, linux-arm64, win32-x64)" >&2; exit 2 ;;
  esac
fi
exe=""
case "$target" in win32-*) exe=".exe" ;; esac

echo "== rust binaries"
cargo build --release
mkdir -p vscode-hesperus/bin
cp "target/release/hesp$exe" "target/release/hesperus-lsp$exe" vscode-hesperus/bin/

echo "== extractor bundle"
(cd hesperus-ts && [ -d node_modules ] || npm ci --silent)
(cd hesperus-ts && npm run build --silent)
(cd vscode-hesperus && [ -d node_modules ] || npm ci --silent)
(cd vscode-hesperus && npx esbuild ../hesperus-ts/dist/cli.js --bundle --platform=node --format=cjs --outfile=extractor/cli.js --log-level=warning)

echo "== vsix ($target)"
(cd vscode-hesperus && npx vsce package --no-dependencies --target "$target")
ls -la vscode-hesperus/*.vsix
