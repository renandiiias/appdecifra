#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SYNC_PY="${SYNC_PY:-$SCRIPT_DIR/sync_cifraclub_live_to_supabase.py}"

DATASET_DIR="${DATASET_DIR:-/srv/data/cifraclub-full-v3}"
STATE_FILE="${STATE_FILE:-$DATASET_DIR/supabase_sync/state.json}"
SECTIONS_DIR="${SECTIONS_DIR:-$DATASET_DIR/supabase_sync/sections}"
BATCH_SIZE="${BATCH_SIZE:-1000}"
POLL_SECONDS="${POLL_SECONDS:-60}"
REQUEST_TIMEOUT="${REQUEST_TIMEOUT:-45}"
ENV_FILE="${ENV_FILE:-$SCRIPT_DIR/.env.supabase}"

if [[ -f "$ENV_FILE" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a
fi

if [[ -z "${SUPABASE_URL:-}" || -z "${SUPABASE_SERVICE_ROLE_KEY:-}" ]]; then
  echo "Missing SUPABASE_URL and/or SUPABASE_SERVICE_ROLE_KEY (env file: $ENV_FILE)" >&2
  exit 1
fi

python3 "$SYNC_PY" \
  --dataset-dir "$DATASET_DIR" \
  --state-file "$STATE_FILE" \
  --sections-dir "$SECTIONS_DIR" \
  --batch-size "$BATCH_SIZE" \
  --poll-seconds "$POLL_SECONDS" \
  --request-timeout "$REQUEST_TIMEOUT" \
  "$@"
