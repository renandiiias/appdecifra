#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

count_dataless() {
  # "dataless" is a File Provider (iCloud Drive) placeholder flag. Reading these files can block builds.
  # ripgrep exits 1 when it finds no matches; with pipefail enabled that would fail the whole pipeline.
  set +o pipefail
  local n
  n="$(
    find apps/mobile packages \
      -path '*/node_modules/*' -prune -o \
      -type f -print0 \
      | xargs -0 ls -lO 2>/dev/null \
      | rg 'dataless' \
      | wc -l \
      | tr -d ' '
  )"
  set -o pipefail
  echo "${n:-0}"
}

echo "Hydrating mobile source files (forcing iCloud placeholders to download if needed)..."

BEFORE="$(count_dataless)"
echo "dataless files before: ${BEFORE}"

# Force the OS to materialize placeholder files by reading them.
find apps/mobile packages \
  -path '*/node_modules/*' -prune -o \
  -type f -print0 \
  | xargs -0 -n 50 cat >/dev/null

AFTER="$(count_dataless)"
echo "dataless files after:  ${AFTER}"

if [[ "${AFTER}" != "0" ]]; then
  echo
  echo "Some files are still dataless. Finder: right-click the project folder -> 'Download Now' / 'Keep Downloaded'."
  echo "Sample remaining dataless files:"
  set +o pipefail
  find apps/mobile packages \
    -path '*/node_modules/*' -prune -o \
    -type f -print0 \
    | xargs -0 ls -lO 2>/dev/null \
    | rg 'dataless' \
    | head -30 \
    || true
  set -o pipefail
  exit 2
fi

echo "OK: all mobile source files are local."
