#!/usr/bin/env python3
from __future__ import annotations

import json
import os
import re
import sqlite3
import time
from collections import deque
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def to_iso_from_epoch(ts: float | int | None) -> str | None:
    if ts is None:
        return None
    try:
        return datetime.fromtimestamp(float(ts), tz=timezone.utc).replace(microsecond=0).isoformat()
    except Exception:
        return None


def read_json_file(path: Path, default: dict[str, Any] | None = None) -> dict[str, Any]:
    if default is None:
        default = {}
    if not path.exists():
        return dict(default)
    try:
        with path.open("r", encoding="utf-8") as f:
            data = json.load(f)
        if isinstance(data, dict):
            return data
    except Exception:
        pass
    return dict(default)


def collect_source_metrics(dataset_dir: Path) -> dict[str, Any]:
    db_dir = dataset_dir / "db"
    db_files = sorted(db_dir.glob("letter_*.sqlite3"))

    status_counts: dict[str, int] = {}
    song_keys_done: set[str] = set()
    artist_slugs_done: set[str] = set()
    per_db_status: list[dict[str, Any]] = []

    for db_path in db_files:
        conn = sqlite3.connect(str(db_path))
        conn.row_factory = sqlite3.Row
        try:
            rows = conn.execute("SELECT status, COUNT(*) AS c FROM songs GROUP BY status").fetchall()
            db_status = {str(r["status"] or "null"): int(r["c"] or 0) for r in rows}
            per_db_status.append({"db": db_path.name, "status": db_status})
            for k, v in db_status.items():
                status_counts[k] = int(status_counts.get(k, 0)) + int(v)

            rows = conn.execute(
                """
                SELECT song_key, artist_slug
                FROM songs
                WHERE status='done' AND song_key IS NOT NULL;
                """
            ).fetchall()
            for r in rows:
                song_key = str(r["song_key"] or "").strip()
                if song_key:
                    song_keys_done.add(song_key)
                artist_slug = str(r["artist_slug"] or "").strip()
                if artist_slug:
                    artist_slugs_done.add(artist_slug)
        finally:
            conn.close()

    return {
        "db_files": len(db_files),
        "status_counts": status_counts,
        "songs_done_unique_song_key": len(song_keys_done),
        "artists_done_unique_slug": len(artist_slugs_done),
        "per_db_status": per_db_status,
    }


class SupabaseRest:
    def __init__(self, url: str, api_key: str, timeout: int = 30) -> None:
        self.base = url.rstrip("/") + "/rest/v1"
        self.timeout = int(timeout)
        self.headers = {
            "apikey": api_key,
            "Authorization": f"Bearer {api_key}",
        }

    def count_exact(self, table: str, filters: dict[str, Any] | None = None) -> int:
        query = {"select": "id"}
        if filters:
            query.update(filters)
        q = urlencode(query, doseq=True, safe=",:*()'\"")
        url = f"{self.base}/{table}?{q}"
        headers = dict(self.headers)
        headers["Range-Unit"] = "items"
        headers["Range"] = "0-0"
        headers["Prefer"] = "count=exact"
        req = Request(url=url, headers=headers, method="GET")
        with urlopen(req, timeout=self.timeout) as resp:
            content_range = str(resp.headers.get("Content-Range", ""))
        if "/" in content_range:
            try:
                return int(content_range.split("/")[-1])
            except ValueError:
                return -1
        return -1


def collect_supabase_metrics() -> dict[str, Any]:
    supabase_url = (os.getenv("SUPABASE_URL") or os.getenv("NEXT_PUBLIC_SUPABASE_URL") or "").strip().strip('"').strip("'")
    supabase_key = (
        os.getenv("SUPABASE_SERVICE_ROLE_KEY")
        or os.getenv("NEXT_PUBLIC_SUPABASE_ANON_KEY")
        or ""
    ).strip().strip('"').strip("'")

    if not supabase_url or not supabase_key:
        return {
            "connected": False,
            "error": "Missing SUPABASE_URL/NEXT_PUBLIC_SUPABASE_URL or key",
            "songs_total": -1,
            "artists_total": -1,
            "song_sections_total": -1,
            "songs_with_source_song_key": -1,
            "songs_with_source_processed_at": -1,
            "artists_with_source_slug": -1,
        }

    rest = SupabaseRest(supabase_url, supabase_key)
    try:
        return {
            "connected": True,
            "error": None,
            "songs_total": rest.count_exact("songs"),
            "artists_total": rest.count_exact("artists"),
            "song_sections_total": rest.count_exact("song_sections"),
            "songs_with_source_song_key": rest.count_exact("songs", {"source_song_key": "not.is.null"}),
            "songs_with_source_processed_at": rest.count_exact("songs", {"source_processed_at": "not.is.null"}),
            "artists_with_source_slug": rest.count_exact("artists", {"source_slug": "not.is.null"}),
        }
    except (HTTPError, URLError, OSError) as exc:
        return {
            "connected": False,
            "error": f"Supabase error: {exc}",
            "songs_total": -1,
            "artists_total": -1,
            "song_sections_total": -1,
            "songs_with_source_song_key": -1,
            "songs_with_source_processed_at": -1,
            "artists_with_source_slug": -1,
        }


CYCLE_RE = re.compile(
    r"cycle=(\d+)\s+"
    r"candidates=(\d+)\s+"
    r"inserted=(\d+)\s+"
    r"skipped=(\d+)\s+"
    r"missing_json=(\d+)\s+"
    r"(?:bad_rows=(\d+)\s+sections=(\d+)\s+patched=(\d+)\s+)?"
    r"artifacts=(\d+)\s+"
    r"elapsed=([0-9.]+)s"
)


def parse_last_cycle(log_path: Path) -> dict[str, Any] | None:
    if not log_path.exists():
        return None
    lines = deque(maxlen=250)
    try:
        with log_path.open("r", encoding="utf-8", errors="replace") as f:
            for line in f:
                lines.append(line.rstrip("\n"))
    except Exception:
        return None

    for raw in reversed(lines):
        m = CYCLE_RE.search(raw)
        if not m:
            continue
        groups = m.groups()
        return {
            "cycle": int(groups[0]),
            "candidates": int(groups[1]),
            "inserted": int(groups[2]),
            "skipped": int(groups[3]),
            "missing_json": int(groups[4]),
            "bad_rows": int(groups[5] or 0),
            "sections": int(groups[6] or 0),
            "patched": int(groups[7] or 0),
            "artifacts": int(groups[8]),
            "elapsed_seconds": float(groups[9]),
            "raw": raw,
        }

    return None


def parse_iso(ts: Any) -> datetime | None:
    if not ts:
        return None
    try:
        return datetime.fromisoformat(str(ts).replace("Z", "+00:00"))
    except Exception:
        return None


def compute_pipeline_metrics(dataset_dir: Path, source: dict[str, Any], supabase: dict[str, Any]) -> dict[str, Any]:
    sync_dir = dataset_dir / "supabase_sync"
    state_file = sync_dir / "state.json"
    launch_log = sync_dir / "live_sync.launch.log"
    legacy_log = sync_dir / "live_sync.log"

    state = read_json_file(state_file, default={})
    song_key_to_song_id = state.get("song_key_to_song_id")
    songs_transferred_via_state = len(song_key_to_song_id) if isinstance(song_key_to_song_id, dict) else 0

    songs_source_done = int(source.get("songs_done_unique_song_key") or 0)
    artists_source_done = int(source.get("artists_done_unique_slug") or 0)

    songs_supabase = int(supabase.get("songs_with_source_song_key") or 0)
    artists_supabase = int(supabase.get("artists_with_source_slug") or 0)

    songs_transferred = max(songs_transferred_via_state, songs_supabase)
    artists_transferred = max(0, artists_supabase)

    songs_remaining = max(0, songs_source_done - songs_transferred)
    artists_remaining = max(0, artists_source_done - artists_transferred)

    songs_completion_pct = (songs_transferred / songs_source_done * 100.0) if songs_source_done > 0 else 0.0
    artists_completion_pct = (artists_transferred / artists_source_done * 100.0) if artists_source_done > 0 else 0.0

    chosen_log = launch_log if launch_log.exists() else legacy_log
    last_cycle = parse_last_cycle(chosen_log)

    last_sync_utc = state.get("last_sync_utc")
    last_sync_dt = parse_iso(last_sync_utc)
    now = datetime.now(timezone.utc)
    lag_seconds = int((now - last_sync_dt).total_seconds()) if last_sync_dt else None

    log_mtime_utc = to_iso_from_epoch(chosen_log.stat().st_mtime) if chosen_log.exists() else None

    stats = state.get("stats") if isinstance(state.get("stats"), dict) else {}

    return {
        "state_initialized": bool(state.get("initialized")),
        "last_sync_utc": last_sync_utc,
        "lag_seconds": lag_seconds,
        "songs_transferred": songs_transferred,
        "artists_transferred": artists_transferred,
        "songs_remaining": songs_remaining,
        "artists_remaining": artists_remaining,
        "songs_completion_pct": songs_completion_pct,
        "artists_completion_pct": artists_completion_pct,
        "stats": {
            "total_inserted_songs": int(stats.get("total_inserted_songs") or 0),
            "total_artifacts": int(stats.get("total_artifacts") or 0),
            "total_sections_upserted": int(stats.get("total_sections_upserted") or 0),
        },
        "last_cycle": last_cycle,
        "log_path": str(chosen_log),
        "log_mtime_utc": log_mtime_utc,
        "state_path": str(state_file),
    }


def main() -> int:
    dataset_dir = Path(
        os.getenv("SCRAPER_DATASET_DIR")
        or os.getenv("DATASET_DIR")
        or "/srv/data/cifraclub-full-v3"
    ).expanduser()

    payload: dict[str, Any] = {
        "generated_at_utc": utc_now_iso(),
        "dataset_dir": str(dataset_dir),
        "ok": True,
    }

    try:
        source = collect_source_metrics(dataset_dir)
    except Exception as exc:
        source = {
            "db_files": 0,
            "status_counts": {},
            "songs_done_unique_song_key": 0,
            "artists_done_unique_slug": 0,
            "per_db_status": [],
            "error": f"Source metrics error: {exc}",
        }
        payload["ok"] = False

    supabase = collect_supabase_metrics()
    if not supabase.get("connected"):
        payload["ok"] = False

    pipeline = compute_pipeline_metrics(dataset_dir, source, supabase)

    payload["source"] = source
    payload["supabase"] = supabase
    payload["pipeline"] = pipeline

    print(json.dumps(payload, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
