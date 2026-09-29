#!/usr/bin/env bash
# Checks the ATN review rules that addons-linter does not cover (FR-016):
#   1. No minified code (heuristic: no source line over 300 characters).
#   2. No remote code (http(s) URLs in <script>, importScripts() or import()).
#   3. Every Experiment namespace has a "## <namespace>" section in EXPERIMENTS.md.
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$root"

status=0

long_lines="$(find src -type f \( -name '*.js' -o -name '*.mjs' \) -print0 \
  | xargs -0 awk 'length($0) > 300 { print FILENAME ":" FNR }')"
if [[ -n "$long_lines" ]]; then
  echo "FAIL: lines longer than 300 characters (minified code?):"
  echo "$long_lines"
  status=1
fi

remote="$(grep -rnE -i '<script[^>]*https?://|importScripts\([^)]*https?://|import\([^)]*https?://' src || true)"
if [[ -n "$remote" ]]; then
  echo "FAIL: remote code references:"
  echo "$remote"
  status=1
fi

namespaces="$(node -p "Object.keys(require('./src/manifest.json').experiment_apis ?? {}).join('\n')")"
for ns in $namespaces; do
  if ! grep -qx "## ${ns}" EXPERIMENTS.md; then
    echo "FAIL: EXPERIMENTS.md has no '## ${ns}' section"
    status=1
  fi
done

if [[ $status -eq 0 ]]; then
  echo "OK"
fi
exit $status
