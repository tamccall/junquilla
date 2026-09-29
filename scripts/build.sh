#!/usr/bin/env bash
# Package src/ as-is into dist/junquilla-<version>.xpi.
# No minifying or transpiling: the shipped source is the reviewed source (FR-016).
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$root"

version="$(node -p "require('./src/manifest.json').version")"
out="dist/junquilla-${version}.xpi"

mkdir -p dist
rm -f "$out"
(cd src && zip -r -X "../$out" . -x '*.DS_Store')
echo "$out"
