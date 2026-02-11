#!/usr/bin/env python3
"""
Incremental sync from a live CifraClub dataset into Supabase.

What it does:
- Reads new songs from per-letter sqlite files in <dataset_dir>/db.
- Pushes artists + songs into public.artists/public.songs in Supabase.
- Processes songs in batches (default 1000) to avoid blocking the scraper.
- Writes section categorization artifacts (intro/verse/chorus/pre-chorus/bridge/etc)
  to JSON files under <dataset_dir>/supabase_sync/sections.

Important:
- This script does not modify scraper files and only reads its outputs.
- Section artifacts are persisted even if your current Supabase schema has no
  table for sections yet.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sqlite3
import sys
import time
import unicodedata
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def normalize_search(text: str) -> str:
    if text is None:
        return ""
    t = unicodedata.normalize("NFD", str(text))
    t = "".join(ch for ch in t if unicodedata.category(ch) != "Mn")
    t = t.lower().strip()
    return re.sub(r"\s+", " ", t)


def slug_to_title(slug: str) -> str:
    s = (slug or "").strip().strip("/")
    if not s:
        return "Sem titulo"
    words = re.sub(r"[-_]+", " ", s).split()
    if not words:
        return "Sem titulo"
    return " ".join(w[:1].upper() + w[1:] for w in words)


def normalize_key(value: str | None) -> str:
    s = (value or "").strip()
    m = re.match(r"^([A-Ga-g])([#b]?)(m?)$", s)
    if not m:
        return s or "C"
    return f"{m.group(1).upper()}{m.group(2)}{m.group(3)}"


def to_int(value: Any) -> int | None:
    if value is None:
        return None
    if isinstance(value, bool):
        return int(value)
    if isinstance(value, int):
        return value
    if isinstance(value, float):
        return int(value)
    s = str(value).strip()
    if not s:
        return None
    try:
        return int(float(s))
    except ValueError:
        return None


def strip_nul(value: str | None) -> str:
    if value is None:
        return ""
    # Postgres text cannot contain \u0000.
    return str(value).replace("\x00", "")


def none_if_blank(value: Any) -> str | None:
    if value is None:
        return None
    s = strip_nul(str(value)).strip()
    return s or None


def compact_payload(payload: dict[str, Any]) -> dict[str, Any]:
    out: dict[str, Any] = {}
    for key, value in payload.items():
        if value is None:
            continue
        if isinstance(value, str):
            clean = none_if_blank(value)
            if clean is None:
                continue
            out[key] = clean
            continue
        out[key] = value
    return out


def payload_fingerprint(payload: dict[str, Any]) -> str:
    clean = compact_payload(payload)
    if not clean:
        return ""
    return json.dumps(clean, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


class SupabaseError(RuntimeError):
    pass


class SupabaseRest:
    def __init__(self, url: str, service_key: str, timeout: int = 45) -> None:
        self.base = url.rstrip("/") + "/rest/v1"
        self.timeout = int(timeout)
        self.default_headers = {
            "apikey": service_key,
            "Authorization": f"Bearer {service_key}",
            "Content-Type": "application/json",
        }

    def request(
        self,
        method: str,
        path: str,
        *,
        query: dict[str, Any] | None = None,
        body: Any = None,
        prefer: str | None = None,
        retries: int = 3,
    ) -> Any:
        url = self.base + path
        if query:
            # Keep PostgREST query operators readable.
            q = urlencode(query, doseq=True, safe=",:*()'\"")
            if q:
                url = f"{url}?{q}"

        headers = dict(self.default_headers)
        if prefer:
            headers["Prefer"] = prefer

        data: bytes | None = None
        if body is not None:
            data = json.dumps(body, ensure_ascii=False).encode("utf-8")

        last_exc: Exception | None = None
        for attempt in range(1, retries + 1):
            req = Request(url=url, data=data, headers=headers, method=method.upper())
            try:
                with urlopen(req, timeout=self.timeout) as resp:
                    raw = resp.read().decode("utf-8")
                    ctype = resp.headers.get("content-type", "")
                    if not raw.strip() or "application/json" not in ctype:
                        return None
                    return json.loads(raw)
            except HTTPError as exc:
                raw = exc.read().decode("utf-8", errors="replace")
                transient = exc.code in (408, 409, 425, 429, 500, 502, 503, 504)
                if transient and attempt < retries:
                    time.sleep(min(5, attempt * 1.5))
                    last_exc = exc
                    continue
                raise SupabaseError(f"Supabase {method} {url} failed: {exc.code} {raw[:500]}") from exc
            except URLError as exc:
                if attempt < retries:
                    time.sleep(min(5, attempt * 1.5))
                    last_exc = exc
                    continue
                raise SupabaseError(f"Supabase {method} {url} failed: {exc}") from exc

        if last_exc:
            raise SupabaseError(f"Supabase request failed after retries: {method} {url}: {last_exc}")
        raise SupabaseError(f"Supabase request failed: {method} {url}")


SECTION_TYPE_PATTERNS: list[tuple[str, re.Pattern[str]]] = [
    ("intro", re.compile(r"^(intro|introducao)$", re.IGNORECASE)),
    ("pre_chorus", re.compile(r"^(pre\s*-?\s*(refr[ao]o|chorus)|p[\u00e9e]-?refr[ao]o)$", re.IGNORECASE)),
    ("chorus", re.compile(r"^(refr[ao]o|chorus)$", re.IGNORECASE)),
    ("verse", re.compile(r"^(verso|verse)$", re.IGNORECASE)),
    ("bridge", re.compile(r"^(ponte|bridge)$", re.IGNORECASE)),
    ("solo", re.compile(r"^(solo|riff)$", re.IGNORECASE)),
    ("instrumental", re.compile(r"^(instrumental|interludio|interlude)$", re.IGNORECASE)),
    ("outro", re.compile(r"^(outro|final|encerramento|fim)$", re.IGNORECASE)),
    ("tag", re.compile(r"^(tag)$", re.IGNORECASE)),
]

SECTION_TYPES_ALLOWED = {
    "intro",
    "verse",
    "pre_chorus",
    "chorus",
    "bridge",
    "solo",
    "instrumental",
    "outro",
    "tag",
    "unknown",
}

SECTION_SOURCE_TYPES_ALLOWED = {
    "cifra",
    "letra",
    "cifra_version",
}

BRACKET_SECTION_RE = re.compile(r"^\s*[\[(]\s*([^\]\)]+?)\s*[\])]\s*(.*)$")
PLAIN_SECTION_RE = re.compile(r"^\s*([A-Za-z\u00c0-\u024f\-\s]+?)(?:\s*[:\-]\s*|\s+)(.*)$")


def canonicalize_section_label(raw_label: str) -> tuple[str, str]:
    label = (raw_label or "").strip()
    if not label:
        return ("unknown", "Sem secao")

    # Remove numbering suffixes: "Refrão 2", "Verse 1", etc.
    label_no_num = re.sub(r"\s+\d+[A-Za-z]?$", "", label).strip()
    normalized = normalize_search(label_no_num)

    for section_type, rx in SECTION_TYPE_PATTERNS:
        if rx.match(normalized):
            return (section_type, label)

    # Broader matching for frequent labels found in scraped cifras.
    if "pre refr" in normalized or "pre-chor" in normalized or "pre chor" in normalized:
        return ("pre_chorus", label)
    if "refr" in normalized or "chorus" in normalized:
        return ("chorus", label)
    if "verso" in normalized or "verse" in normalized or "estrofe" in normalized:
        return ("verse", label)
    if "parte" in normalized:
        return ("verse", label)
    if "ponte" in normalized or "bridge" in normalized:
        return ("bridge", label)
    if "intro" in normalized or "introdu" in normalized:
        return ("intro", label)
    if "solo" in normalized or "riff" in normalized:
        return ("solo", label)
    if "instrumental" in normalized or "interlud" in normalized:
        return ("instrumental", label)
    if "outro" in normalized or "final" in normalized or "encerr" in normalized:
        return ("outro", label)

    return ("unknown", label)


def maybe_parse_section_header(line: str) -> tuple[str, str, str] | None:
    s = (line or "").rstrip("\n")
    if not s.strip():
        return None

    m = BRACKET_SECTION_RE.match(s)
    if m:
        label = m.group(1).strip()
        rest = (m.group(2) or "").strip()
        section_type, section_label = canonicalize_section_label(label)
        if section_type != "unknown":
            return (section_type, section_label, rest)

    # Some files use plain text section labels without brackets.
    p = PLAIN_SECTION_RE.match(s)
    if p:
        label = (p.group(1) or "").strip()
        rest = (p.group(2) or "").strip()
        # Keep plain headers conservative to avoid false positives on lyric lines.
        if len(label) <= 24 and len(label.split()) <= 3:
            section_type, section_label = canonicalize_section_label(label)
            if section_type != "unknown":
                return (section_type, section_label, rest)

    return None


def split_sections(text: str | None) -> list[dict[str, Any]]:
    if not text:
        return []

    lines = str(text).splitlines()
    current = {
        "section_type": "unknown",
        "section_label": "Sem secao",
        "order_index": 1,
        "line_numbers": [],
        "lines": [],
    }
    sections: list[dict[str, Any]] = []

    def flush_current() -> None:
        nonlocal current
        content = "\n".join(current["lines"]).strip("\n")
        if not content.strip():
            return
        numbers = current["line_numbers"]
        sections.append(
            {
                "order_index": current["order_index"],
                "section_type": current["section_type"],
                "section_label": current["section_label"],
                "line_start": min(numbers) if numbers else None,
                "line_end": max(numbers) if numbers else None,
                "content": content,
            }
        )

    for idx, raw in enumerate(lines, start=1):
        parsed = maybe_parse_section_header(raw)
        if parsed:
            flush_current()
            section_type, section_label, rest = parsed
            current = {
                "section_type": section_type,
                "section_label": section_label,
                "order_index": len(sections) + 1,
                "line_numbers": [],
                "lines": [],
            }
            if rest:
                current["line_numbers"].append(idx)
                current["lines"].append(rest)
            continue

        current["line_numbers"].append(idx)
        current["lines"].append(raw)

    flush_current()

    # If no explicit sections were found, keep one fallback section.
    if not sections and lines:
        text_joined = "\n".join(lines).strip("\n")
        if text_joined.strip():
            sections = [
                {
                    "order_index": 1,
                    "section_type": "unknown",
                    "section_label": "Sem secao",
                    "line_start": 1,
                    "line_end": len(lines),
                    "content": text_joined,
                }
            ]

    return sections


def infer_song_category(artist_name: str, title: str, sections: list[dict[str, Any]]) -> str:
    a = normalize_search(artist_name)
    t = normalize_search(title)

    if "harpa" in a:
        return "Harpa Crista"
    if "coral" in a or "hino" in t:
        return "Hinos"
    if "adoracao" in t or "adora" in t:
        return "Adoracao"

    # Use structure as weak signal only.
    section_types = {sec.get("section_type") for sec in sections}
    if "chorus" in section_types and "verse" in section_types:
        return "Louvor"

    return "Louvor"


def pick_primary_text(song_obj: dict[str, Any]) -> tuple[str, str]:
    pages = song_obj.get("pages") or {}

    cifra = (((pages.get("cifra") or {}).get("text_clean")) or "").strip()
    if cifra:
        return (cifra, "cifra")

    letra = (((pages.get("letra") or {}).get("text_clean")) or "").strip()
    if letra:
        return (letra, "letra")

    versions = ((song_obj.get("cifra_versions") or {}).get("items") or [])
    for version in versions:
        if not isinstance(version, dict):
            continue
        text = (((version.get("page") or {}).get("text_clean")) or "").strip()
        if text:
            slug = (version.get("version_slug") or "principal").strip() or "principal"
            return (text, f"version:{slug}")

    return ("", "none")


def collect_section_artifacts(song_obj: dict[str, Any]) -> list[dict[str, Any]]:
    artifacts: list[dict[str, Any]] = []
    pages = song_obj.get("pages") or {}

    cifra_text = (((pages.get("cifra") or {}).get("text_clean")) or "").strip()
    if cifra_text:
        artifacts.append(
            {
                "source_type": "cifra",
                "source_label": "cifra_principal",
                "sections": split_sections(cifra_text),
            }
        )

    letra_text = (((pages.get("letra") or {}).get("text_clean")) or "").strip()
    if letra_text:
        artifacts.append(
            {
                "source_type": "letra",
                "source_label": "letra_principal",
                "sections": split_sections(letra_text),
            }
        )

    # Keep only one main cifra version if there is no main cifra text.
    if not cifra_text:
        versions = ((song_obj.get("cifra_versions") or {}).get("items") or [])
        for version in versions:
            if not isinstance(version, dict):
                continue
            text = (((version.get("page") or {}).get("text_clean")) or "").strip()
            if not text:
                continue
            slug = (version.get("version_slug") or "principal").strip() or "principal"
            artifacts.append(
                {
                    "source_type": "cifra_version",
                    "source_label": slug,
                    "sections": split_sections(text),
                }
            )
            break

    return artifacts


@dataclass
class SongCandidate:
    db_name: str
    song_key: str
    song_json_rel: str
    processed_at_utc: str
    artist_slug: str
    song_slug: str
    song_name: str | None


def load_json_file(path: Path, default: dict[str, Any] | None = None) -> dict[str, Any]:
    if default is None:
        default = {}
    if not path.exists():
        return dict(default)
    try:
        with path.open("r", encoding="utf-8") as f:
            data = json.load(f)
        if isinstance(data, dict):
            return data
        return dict(default)
    except Exception:
        return dict(default)


def atomic_write_json(path: Path, data: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    with tmp.open("w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
        f.write("\n")
    tmp.replace(path)


def query_candidates_from_db(db_path: Path, watermark_ts: str, watermark_key: str, limit: int) -> list[SongCandidate]:
    if limit <= 0:
        return []
    uri = f"file:{db_path}?mode=ro"
    conn = sqlite3.connect(uri, uri=True)
    conn.row_factory = sqlite3.Row
    try:
        rows = conn.execute(
            """
            SELECT
              song_key,
              song_json_path,
              processed_at_utc,
              artist_slug,
              song_slug,
              song_name
            FROM songs
            WHERE
              status = 'done'
              AND song_json_path IS NOT NULL
              AND processed_at_utc IS NOT NULL
              AND (
                processed_at_utc > ?
                OR (processed_at_utc = ? AND song_key > ?)
              )
            ORDER BY processed_at_utc ASC, song_key ASC
            LIMIT ?;
            """,
            (watermark_ts, watermark_ts, watermark_key, int(limit)),
        ).fetchall()
    finally:
        conn.close()

    out: list[SongCandidate] = []
    for row in rows:
        out.append(
            SongCandidate(
                db_name=db_path.name,
                song_key=str(row["song_key"]),
                song_json_rel=str(row["song_json_path"]),
                processed_at_utc=str(row["processed_at_utc"]),
                artist_slug=str(row["artist_slug"] or ""),
                song_slug=str(row["song_slug"] or ""),
                song_name=(str(row["song_name"]) if row["song_name"] is not None else None),
            )
        )
    return out


def merge_first_non_empty(base: dict[str, Any], incoming: dict[str, Any], keys: list[str]) -> dict[str, Any]:
    out = dict(base)
    for key in keys:
        if out.get(key) is not None:
            continue
        value = incoming.get(key)
        if isinstance(value, str):
            value = none_if_blank(value)
        if value is not None:
            out[key] = value
    return out


def load_artist_profile(dataset_dir: Path, artist_slug: str, cache: dict[str, dict[str, Any]]) -> dict[str, Any]:
    slug = (artist_slug or "").strip().strip("/")
    if not slug:
        return {}
    if slug in cache:
        return cache[slug]
    profile_path = dataset_dir / "artists" / slug / "artist_full.json"
    profile = load_json_file(profile_path, default={})
    cache[slug] = profile
    return profile


def build_artist_source_payload(
    *,
    dataset_dir: Path,
    artist_slug: str,
    song_obj: dict[str, Any],
    artist_profile_cache: dict[str, dict[str, Any]],
) -> dict[str, Any]:
    artist_data = (song_obj.get("artist") or {}) if isinstance(song_obj, dict) else {}
    artist_genre = artist_data.get("genre") if isinstance(artist_data.get("genre"), dict) else {}
    profile = load_artist_profile(dataset_dir, artist_slug, artist_profile_cache)
    profile_artist = profile.get("artist") if isinstance(profile.get("artist"), dict) else {}
    profile_genre = profile.get("genre") if isinstance(profile.get("genre"), dict) else {}
    profile_paths = profile.get("paths") if isinstance(profile.get("paths"), dict) else {}
    profile_artist_genre = profile_artist.get("genre") if isinstance(profile_artist.get("genre"), dict) else {}

    source_slug = (
        none_if_blank(artist_data.get("slug"))
        or none_if_blank(song_obj.get("artist_slug"))
        or none_if_blank(profile.get("artist_slug"))
        or none_if_blank(artist_slug)
    )
    source_artist_id = to_int(artist_data.get("id"))
    if source_artist_id is None:
        source_artist_id = to_int(profile_artist.get("id"))
    source_genre_slug = (
        none_if_blank(artist_genre.get("slug"))
        or none_if_blank(artist_genre.get("url"))
        or none_if_blank(profile_genre.get("slug"))
        or none_if_blank(profile_artist_genre.get("slug"))
        or none_if_blank(profile_artist_genre.get("url"))
    )
    source_hits = to_int(artist_data.get("hits"))
    if source_hits is None:
        source_hits = to_int(profile_artist.get("hits"))
    if source_hits is None:
        source_hits = to_int(profile.get("hits"))

    payload = {
        "source_slug": source_slug,
        "source_artist_id": source_artist_id,
        "source_genre_slug": source_genre_slug,
        "source_hits": source_hits,
        "source_artist_image_path": none_if_blank(profile_paths.get("artist_image")),
        "source_artist_head_image_path": none_if_blank(profile_paths.get("artist_head_image")),
        "source_photos_api_path": none_if_blank(profile_paths.get("photos_api_json")),
    }
    return compact_payload(payload)


def build_song_source_payload(
    *,
    cand: SongCandidate,
    song_obj: dict[str, Any],
    artist_slug: str,
    primary_source: str,
) -> dict[str, Any]:
    song_meta = song_obj.get("song") if isinstance(song_obj.get("song"), dict) else {}

    payload = {
        "source_song_key": none_if_blank(cand.song_key),
        "source_song_id": to_int(song_meta.get("id")),
        "source_lyrics_id": to_int(song_meta.get("lyricsId")),
        "source_song_slug": none_if_blank(song_meta.get("url")) or none_if_blank(song_obj.get("song_slug")) or none_if_blank(cand.song_slug),
        "source_artist_slug": none_if_blank(song_obj.get("artist_slug")) or none_if_blank(artist_slug),
        "source_json_path": none_if_blank(cand.song_json_rel),
        "source_processed_at": none_if_blank(cand.processed_at_utc),
        "source_variant": none_if_blank(primary_source),
    }
    return payload


def maybe_patch_artist_source_fields(
    *,
    rest: SupabaseRest,
    artist_id: str,
    source_payload: dict[str, Any],
    fingerprints: dict[str, str],
) -> bool:
    payload = compact_payload(source_payload)
    if not payload:
        return False
    fp = payload_fingerprint(payload)
    if fingerprints.get(artist_id) == fp:
        return False
    try:
        rest.request(
            "PATCH",
            "/artists",
            query={"id": f"eq.{artist_id}"},
            body=payload,
            prefer="return=minimal",
        )
        fingerprints[artist_id] = fp
    except SupabaseError as exc:
        # If source_slug collides on legacy duplicates, still patch the remaining metadata.
        if "artists_source_slug_uniq" not in str(exc) or "source_slug" not in payload:
            raise
        fallback = dict(payload)
        fallback.pop("source_slug", None)
        fallback = compact_payload(fallback)
        if not fallback:
            return False
        rest.request(
            "PATCH",
            "/artists",
            query={"id": f"eq.{artist_id}"},
            body=fallback,
            prefer="return=minimal",
        )
        fingerprints[artist_id] = payload_fingerprint(fallback)
    return True


def maybe_patch_song_source_fields(
    *,
    rest: SupabaseRest,
    song_id: str,
    source_payload: dict[str, Any],
    fingerprints: dict[str, str],
) -> bool:
    payload = compact_payload(source_payload)
    if not payload:
        return False
    fp = payload_fingerprint(payload)
    if fingerprints.get(song_id) == fp:
        return False
    try:
        rest.request(
            "PATCH",
            "/songs",
            query={"id": f"eq.{song_id}"},
            body=payload,
            prefer="return=minimal",
        )
        fingerprints[song_id] = fp
    except SupabaseError as exc:
        # Protect continuous sync if a legacy duplicate source_song_key exists.
        if "songs_source_song_key_uniq" not in str(exc) or "source_song_key" not in payload:
            raise
        fallback = dict(payload)
        fallback.pop("source_song_key", None)
        fallback = compact_payload(fallback)
        if not fallback:
            return False
        rest.request(
            "PATCH",
            "/songs",
            query={"id": f"eq.{song_id}"},
            body=fallback,
            prefer="return=minimal",
        )
        fingerprints[song_id] = payload_fingerprint(fallback)
    return True


def build_song_section_rows(song_id: str, sources: list[dict[str, Any]]) -> list[dict[str, Any]]:
    sid = none_if_blank(song_id)
    if sid is None:
        return []

    rows: list[dict[str, Any]] = []
    for source in sources:
        if not isinstance(source, dict):
            continue
        source_type = none_if_blank(source.get("source_type")) or "cifra"
        if source_type not in SECTION_SOURCE_TYPES_ALLOWED:
            source_type = "cifra_version" if "version" in source_type else "cifra"
        source_label = none_if_blank(source.get("source_label")) or "principal"
        sections = source.get("sections") or []
        if not isinstance(sections, list):
            continue
        for idx, section in enumerate(sections, start=1):
            if not isinstance(section, dict):
                continue
            content = strip_nul(str(section.get("content") or "")).strip()
            if not content:
                continue
            section_type = none_if_blank(section.get("section_type")) or "unknown"
            if section_type not in SECTION_TYPES_ALLOWED:
                section_type = "unknown"
            section_label = none_if_blank(section.get("section_label")) or "Sem secao"
            order_index = to_int(section.get("order_index"))
            if order_index is None or order_index <= 0:
                order_index = idx
            line_start = to_int(section.get("line_start"))
            line_end = to_int(section.get("line_end"))
            rows.append(
                {
                    "song_id": sid,
                    "source_type": source_type,
                    "source_label": source_label,
                    "order_index": int(order_index),
                    "section_type": section_type,
                    "section_label": section_label,
                    "line_start": line_start,
                    "line_end": line_end,
                    "content": content,
                }
            )
    return rows


def upsert_song_sections_with_fallback(rest: SupabaseRest, rows: list[dict[str, Any]], chunk_size: int = 250) -> int:
    if not rows:
        return 0
    # Avoid ON CONFLICT self-collision when the same key appears more than once in the same batch.
    deduped: dict[tuple[str, str, str, int], dict[str, Any]] = {}
    for row in rows:
        key = (
            str(row.get("song_id") or ""),
            str(row.get("source_type") or ""),
            str(row.get("source_label") or ""),
            int(row.get("order_index") or 0),
        )
        deduped[key] = row
    rows = list(deduped.values())
    if not rows:
        return 0
    success_count = 0
    query = {"on_conflict": "song_id,source_type,source_label,order_index"}
    prefer = "resolution=merge-duplicates,return=minimal"
    for i in range(0, len(rows), chunk_size):
        chunk = rows[i : i + chunk_size]
        try:
            rest.request(
                "POST",
                "/song_sections",
                query=query,
                body=chunk,
                prefer=prefer,
            )
            success_count += len(chunk)
            continue
        except SupabaseError as exc:
            print(
                f"[warn] song_sections chunk upsert failed ({len(chunk)} rows), retrying per-row: {exc}",
                file=sys.stderr,
            )
        for row in chunk:
            try:
                rest.request(
                    "POST",
                    "/song_sections",
                    query=query,
                    body=[row],
                    prefer=prefer,
                )
                success_count += 1
            except SupabaseError as row_exc:
                print(
                    f"[warn] skipping section row song_id={row.get('song_id')} order={row.get('order_index')}: {row_exc}",
                    file=sys.stderr,
                )
    return success_count


def fetch_all_artists_map(rest: SupabaseRest) -> dict[str, str]:
    out: dict[str, str] = {}
    offset = 0
    page_size = 1000
    while True:
        rows = rest.request(
            "GET",
            "/artists",
            query={
                "select": "id,name_search",
                "order": "created_at.asc",
                "limit": page_size,
                "offset": offset,
            },
        )
        if not rows:
            break
        for row in rows:
            ns = str(row.get("name_search") or "").strip()
            sid = str(row.get("id") or "").strip()
            if ns and sid:
                out[ns] = sid
        if len(rows) < page_size:
            break
        offset += len(rows)
    return out


def fetch_all_songs_index(rest: SupabaseRest) -> dict[tuple[str, str], str]:
    out: dict[tuple[str, str], str] = {}
    offset = 0
    page_size = 1000
    while True:
        rows = rest.request(
            "GET",
            "/songs",
            query={
                "select": "id,artist_id,title_search",
                "order": "created_at.asc",
                "limit": page_size,
                "offset": offset,
            },
        )
        if not rows:
            break
        for row in rows:
            sid = str(row.get("id") or "").strip()
            aid = str(row.get("artist_id") or "").strip()
            ts = str(row.get("title_search") or "").strip()
            if sid and aid and ts:
                out[(aid, ts)] = sid
        if len(rows) < page_size:
            break
        offset += len(rows)
    return out


def ensure_artists(
    rest: SupabaseRest,
    artist_cache: dict[str, str],
    artist_inputs: list[dict[str, Any]],
    artist_source_fingerprints: dict[str, str],
) -> None:
    if not artist_inputs:
        return

    source_keys = [
        "source_slug",
        "source_artist_id",
        "source_genre_slug",
        "source_hits",
        "source_artist_image_path",
        "source_artist_head_image_path",
        "source_photos_api_path",
    ]

    by_name_search: dict[str, dict[str, Any]] = {}
    for item in artist_inputs:
        name_search = none_if_blank(item.get("name_search"))
        if not name_search:
            continue
        artist_name = none_if_blank(item.get("name")) or slug_to_title(name_search)
        payload = {"name": artist_name, "name_search": name_search}
        for key in source_keys:
            payload[key] = item.get(key)
        if name_search not in by_name_search:
            by_name_search[name_search] = payload
        else:
            by_name_search[name_search] = merge_first_non_empty(by_name_search[name_search], payload, source_keys)
            if none_if_blank(by_name_search[name_search].get("name")) is None and artist_name:
                by_name_search[name_search]["name"] = artist_name

    if not by_name_search:
        return

    missing_payload = []
    for name_search, payload in by_name_search.items():
        if name_search in artist_cache:
            continue
        missing_payload.append(
            {
                "name": payload.get("name") or slug_to_title(name_search),
                "name_search": name_search,
            }
        )

    if not missing_payload:
        # Existing artists still need source metadata patching.
        missing_payload = []

    chunk_size = 200
    for i in range(0, len(missing_payload), chunk_size):
        chunk = missing_payload[i : i + chunk_size]
        rows = rest.request(
            "POST",
            "/artists",
            body=chunk,
            prefer="return=representation",
        )
        if isinstance(rows, list):
            for row in rows:
                ns = str(row.get("name_search") or "").strip()
                sid = str(row.get("id") or "").strip()
                if ns and sid:
                    artist_cache[ns] = sid

    # Fallback refresh for any unresolved entries.
    unresolved = [ns for ns in by_name_search.keys() if ns not in artist_cache]
    if unresolved:
        refreshed = fetch_all_artists_map(rest)
        artist_cache.update(refreshed)

    for name_search, payload in by_name_search.items():
        artist_id = artist_cache.get(name_search)
        if not artist_id:
            continue
        source_payload = {k: payload.get(k) for k in source_keys}
        try:
            maybe_patch_artist_source_fields(
                rest=rest,
                artist_id=artist_id,
                source_payload=source_payload,
                fingerprints=artist_source_fingerprints,
            )
        except SupabaseError as exc:
            print(
                f"[warn] failed to patch artist source fields artist_id={artist_id}: {exc}",
                file=sys.stderr,
            )


def reset_library(rest: SupabaseRest) -> None:
    sentinel = "00000000-0000-0000-0000-000000000000"
    rest.request(
        "DELETE",
        "/songs",
        query={"id": f"neq.{sentinel}"},
        prefer="return=minimal",
    )
    rest.request(
        "DELETE",
        "/artists",
        query={"id": f"neq.{sentinel}"},
        prefer="return=minimal",
    )


def insert_songs_with_fallback(
    *,
    rest: SupabaseRest,
    payloads: list[dict[str, Any]],
    metas: list[dict[str, Any]],
) -> tuple[list[dict[str, Any]], int]:
    """
    Insert a chunk; if it fails, retry row-by-row to isolate bad records and keep progress.
    Returns (inserted_rows, skipped_bad_count).
    """
    try:
        rows = rest.request(
            "POST",
            "/songs",
            body=payloads,
            prefer="return=representation",
        )
        if not isinstance(rows, list):
            raise SupabaseError("Unexpected response while inserting songs.")
        return (rows, 0)
    except SupabaseError as exc:
        print(f"[warn] chunk insert failed ({len(payloads)} rows). Falling back to per-row inserts: {exc}", file=sys.stderr)
        inserted_rows: list[dict[str, Any]] = []
        skipped_bad = 0
        for payload, meta in zip(payloads, metas):
            try:
                row = rest.request(
                    "POST",
                    "/songs",
                    body=[payload],
                    prefer="return=representation",
                )
                if isinstance(row, list) and row:
                    inserted_rows.append(row[0])
                else:
                    skipped_bad += 1
                    print(
                        f"[warn] single-row insert returned empty for {meta.get('song_key')}",
                        file=sys.stderr,
                    )
            except SupabaseError as row_exc:
                skipped_bad += 1
                print(
                    f"[warn] skipping bad song {meta.get('song_key')}: {row_exc}",
                    file=sys.stderr,
                )
        return (inserted_rows, skipped_bad)


def save_section_artifact(
    sections_root: Path,
    song_key: str,
    payload: dict[str, Any],
) -> None:
    rel = Path(*song_key.split("/"))
    out_path = sections_root / rel.with_suffix(".json")
    atomic_write_json(out_path, payload)


def read_song_json(dataset_dir: Path, rel_path: str) -> dict[str, Any] | None:
    path = dataset_dir / rel_path
    if not path.exists():
        return None
    try:
        with path.open("r", encoding="utf-8") as f:
            data = json.load(f)
        if not isinstance(data, dict):
            return None
        return data
    except json.JSONDecodeError:
        return None
    except Exception:
        return None


def run_sync_cycle(
    *,
    dataset_dir: Path,
    sections_root: Path,
    state: dict[str, Any],
    rest: SupabaseRest,
    batch_size: int,
    artist_cache: dict[str, str],
    songs_index: dict[tuple[str, str], str],
    artist_profile_cache: dict[str, dict[str, Any]],
    artist_source_fingerprints: dict[str, str],
    song_source_fingerprints: dict[str, str],
    dry_run: bool,
) -> dict[str, Any]:
    db_dir = dataset_dir / "db"
    db_files = sorted(db_dir.glob("letter_*.sqlite3"))
    if not db_files:
        return {
            "candidates": 0,
            "inserted_songs": 0,
            "skipped_existing": 0,
            "missing_json": 0,
            "skipped_bad": 0,
            "artifacts_written": 0,
            "sections_upserted": 0,
            "source_patched": 0,
        }

    state.setdefault("db_watermarks", {})
    state.setdefault("song_key_to_song_id", {})

    # Fetch up to batch_size rows per DB and then merge globally.
    merged: list[SongCandidate] = []
    for db_path in db_files:
        wm = state["db_watermarks"].get(db_path.name, {})
        ts = str(wm.get("ts") or "")
        key = str(wm.get("song_key") or "")
        rows = query_candidates_from_db(db_path, ts, key, batch_size)
        merged.extend(rows)

    merged.sort(key=lambda r: (r.processed_at_utc, r.song_key, r.db_name))
    selected = merged[:batch_size]

    if not selected:
        return {
            "candidates": 0,
            "inserted_songs": 0,
            "skipped_existing": 0,
            "missing_json": 0,
            "skipped_bad": 0,
            "artifacts_written": 0,
            "sections_upserted": 0,
            "source_patched": 0,
        }

    song_key_to_song_id: dict[str, str] = state["song_key_to_song_id"]

    pending_payloads: list[dict[str, Any]] = []
    pending_metadata: list[dict[str, Any]] = []
    pending_artist_inputs: list[dict[str, Any]] = []
    pending_section_rows: list[dict[str, Any]] = []

    inserted = 0
    skipped_existing = 0
    missing_json = 0
    skipped_bad = 0
    artifacts_written = 0
    sections_upserted = 0
    source_patched = 0

    # Prepare payloads and section artifacts first.
    for cand in selected:
        # Always advance watermark in candidate order so we do not re-read rows.
        state["db_watermarks"][cand.db_name] = {
            "ts": cand.processed_at_utc,
            "song_key": cand.song_key,
        }

        if cand.song_key in song_key_to_song_id:
            skipped_existing += 1
            continue

        song_obj = read_song_json(dataset_dir, cand.song_json_rel)
        if song_obj is None:
            missing_json += 1
            continue

        artist_obj = song_obj.get("artist") or {}
        song_meta = song_obj.get("song") or {}
        pages = song_obj.get("pages") or {}

        artist_slug = (str(cand.artist_slug or artist_obj.get("slug") or "").strip() or "desconhecido")
        artist_name = strip_nul(str(artist_obj.get("name") or slug_to_title(artist_slug))).strip() or "Desconhecido"
        artist_search = normalize_search(artist_name)

        title = strip_nul(str(song_meta.get("name") or cand.song_name or slug_to_title(cand.song_slug))).strip() or "Sem titulo"
        title_search = normalize_search(title)

        primary_text, primary_source = pick_primary_text(song_obj)
        primary_text = strip_nul(primary_text)
        if not primary_text.strip():
            # Keep DB clean: skip songs without useful text.
            missing_json += 1
            continue

        cifra_secondary = (pages.get("cifra") or {}).get("secondary") or {}
        original_key = normalize_key(
            str(song_meta.get("tone") or cifra_secondary.get("key") or "C")
        )
        tuning = strip_nul(str(cifra_secondary.get("tuning") or "E A D G B E")).strip() or "E A D G B E"
        capo = to_int(cifra_secondary.get("capo"))
        views = to_int(cifra_secondary.get("views"))
        if views is None:
            views = to_int(song_meta.get("hits"))
        if views is None:
            views = 0

        section_sources = collect_section_artifacts(song_obj)
        category_sections = section_sources[0]["sections"] if section_sources else []
        category = infer_song_category(artist_name, title, category_sections)

        artist_source_payload = build_artist_source_payload(
            dataset_dir=dataset_dir,
            artist_slug=artist_slug,
            song_obj=song_obj,
            artist_profile_cache=artist_profile_cache,
        )
        pending_artist_inputs.append(
            {
                "name": artist_name,
                "name_search": artist_search,
                **artist_source_payload,
            }
        )

        song_source_payload = build_song_source_payload(
            cand=cand,
            song_obj=song_obj,
            artist_slug=artist_slug,
            primary_source=primary_source,
        )

        payload = {
            "title": title,
            "title_search": title_search,
            # artist_id is filled after ensure_artists.
            "artist_id": None,
            "lyrics_chords": primary_text,
            "original_key": strip_nul(original_key),
            "tuning": tuning,
            "capo": capo,
            "category": strip_nul(category),
            "views": int(views),
        }
        payload.update(song_source_payload)
        pending_payloads.append(payload)
        pending_metadata.append(
            {
                "song_key": cand.song_key,
                "artist_name": artist_name,
                "artist_search": artist_search,
                "song_slug": cand.song_slug,
                "song_json_rel": cand.song_json_rel,
                "sections": section_sources,
                "processed_at_utc": cand.processed_at_utc,
                "song_source": song_source_payload,
            }
        )

    # Ensure artists in Supabase and patch payload artist_id.
    if pending_payloads:
        ensure_artists(
            rest,
            artist_cache,
            pending_artist_inputs,
            artist_source_fingerprints,
        )

    final_payloads: list[dict[str, Any]] = []
    final_meta: list[dict[str, Any]] = []
    for payload, meta in zip(pending_payloads, pending_metadata):
        artist_id = artist_cache.get(meta["artist_search"])
        if not artist_id:
            continue
        p = dict(payload)
        p["artist_id"] = artist_id
        pair = (artist_id, p["title_search"])
        existing_song_id = songs_index.get(pair)
        if existing_song_id:
            song_key_to_song_id[meta["song_key"]] = existing_song_id
            skipped_existing += 1
            if not dry_run:
                try:
                    if maybe_patch_song_source_fields(
                        rest=rest,
                        song_id=existing_song_id,
                        source_payload=meta.get("song_source") or {},
                        fingerprints=song_source_fingerprints,
                    ):
                        source_patched += 1
                except SupabaseError as exc:
                    print(
                        f"[warn] failed to patch song source fields song_id={existing_song_id}: {exc}",
                        file=sys.stderr,
                    )
                pending_section_rows.extend(build_song_section_rows(existing_song_id, meta["sections"]))
            save_section_artifact(
                sections_root,
                meta["song_key"],
                {
                    "song_key": meta["song_key"],
                    "song_id": existing_song_id,
                    "song_slug": meta["song_slug"],
                    "song_json_rel": meta["song_json_rel"],
                    "synced_at_utc": utc_now_iso(),
                    "song_processed_at_utc": meta["processed_at_utc"],
                    "sources": meta["sections"],
                    "resolved_via": "songs_index",
                },
            )
            artifacts_written += 1
            continue
        final_payloads.append(p)
        final_meta.append(meta)

    if not dry_run and final_payloads:
        chunk_size = 200
        for i in range(0, len(final_payloads), chunk_size):
            chunk_payload = final_payloads[i : i + chunk_size]
            chunk_meta = final_meta[i : i + chunk_size]
            rows, skipped_bad_chunk = insert_songs_with_fallback(
                rest=rest,
                payloads=chunk_payload,
                metas=chunk_meta,
            )
            skipped_bad += skipped_bad_chunk

            rows_by_pair: dict[tuple[str, str], dict[str, Any]] = {}
            for row in rows:
                pair = (str(row.get("artist_id") or ""), str(row.get("title_search") or ""))
                if pair[0] and pair[1]:
                    rows_by_pair[pair] = row

            for src, payload in zip(chunk_meta, chunk_payload):
                pair = (str(payload.get("artist_id") or ""), str(payload.get("title_search") or ""))
                inserted_row = rows_by_pair.get(pair)
                if not inserted_row:
                    continue
                sid = str(inserted_row.get("id") or "").strip()
                if not sid:
                    continue
                song_key_to_song_id[src["song_key"]] = sid
                songs_index[(str(inserted_row.get("artist_id") or ""), str(inserted_row.get("title_search") or ""))] = sid
                inserted += 1
                song_source_fingerprints[sid] = payload_fingerprint(src.get("song_source") or {})
                pending_section_rows.extend(build_song_section_rows(sid, src["sections"]))

                artifact_payload = {
                    "song_key": src["song_key"],
                    "song_id": sid,
                    "song_slug": src["song_slug"],
                    "song_json_rel": src["song_json_rel"],
                    "synced_at_utc": utc_now_iso(),
                    "song_processed_at_utc": src["processed_at_utc"],
                    "sources": src["sections"],
                }
                save_section_artifact(sections_root, src["song_key"], artifact_payload)
                artifacts_written += 1

    elif dry_run:
        inserted = len(final_payloads)
        for src in final_meta:
            save_section_artifact(
                sections_root,
                src["song_key"],
                {
                    "song_key": src["song_key"],
                    "song_id": None,
                    "song_slug": src["song_slug"],
                    "song_json_rel": src["song_json_rel"],
                    "synced_at_utc": utc_now_iso(),
                    "song_processed_at_utc": src["processed_at_utc"],
                    "sources": src["sections"],
                    "dry_run": True,
                },
            )
            artifacts_written += 1

    if not dry_run and pending_section_rows:
        sections_upserted = upsert_song_sections_with_fallback(rest, pending_section_rows)

    state["last_sync_utc"] = utc_now_iso()
    state.setdefault("stats", {})
    state["stats"]["total_inserted_songs"] = int(state["stats"].get("total_inserted_songs", 0)) + int(inserted)
    state["stats"]["total_artifacts"] = int(state["stats"].get("total_artifacts", 0)) + int(artifacts_written)
    state["stats"]["total_sections_upserted"] = int(state["stats"].get("total_sections_upserted", 0)) + int(sections_upserted)

    return {
        "candidates": len(selected),
        "inserted_songs": inserted,
        "skipped_existing": skipped_existing,
        "missing_json": missing_json,
        "skipped_bad": skipped_bad,
        "artifacts_written": artifacts_written,
        "sections_upserted": sections_upserted,
        "source_patched": source_patched,
    }


def parse_args() -> argparse.Namespace:
    ap = argparse.ArgumentParser(description="Incremental live sync from CifraClub dataset to Supabase.")
    ap.add_argument("--dataset-dir", default="/srv/data/cifraclub-full-v3", help="Dataset directory used by the scraper.")
    ap.add_argument("--batch-size", type=int, default=1000, help="Maximum songs per cycle (default: 1000).")
    ap.add_argument("--poll-seconds", type=int, default=60, help="Polling interval in seconds for live mode.")
    ap.add_argument("--state-file", default=None, help="Optional custom state file path.")
    ap.add_argument("--sections-dir", default=None, help="Optional output dir for section artifacts.")
    ap.add_argument("--once", action="store_true", help="Run a single cycle and exit.")
    ap.add_argument("--no-reset", action="store_true", help="Do not reset artists/songs on first run.")
    ap.add_argument("--dry-run", action="store_true", help="Read/process without writing to Supabase.")
    ap.add_argument("--request-timeout", type=int, default=45, help="Supabase HTTP timeout in seconds.")
    return ap.parse_args()


def ensure_env(name: str) -> str:
    value = os.getenv(name, "").strip().strip('"').strip("'")
    if not value:
        raise SystemExit(f"Missing required env var: {name}")
    return value


def main() -> int:
    args = parse_args()

    dataset_dir = Path(args.dataset_dir).expanduser().resolve()
    if not dataset_dir.exists():
        raise SystemExit(f"dataset-dir does not exist: {dataset_dir}")

    sync_root = dataset_dir / "supabase_sync"
    sync_root.mkdir(parents=True, exist_ok=True)

    state_file = Path(args.state_file).expanduser() if args.state_file else (sync_root / "state.json")
    sections_dir = Path(args.sections_dir).expanduser() if args.sections_dir else (sync_root / "sections")
    sections_dir.mkdir(parents=True, exist_ok=True)

    state = load_json_file(state_file, default={"version": 1})
    state.setdefault("version", 1)
    state.setdefault("initialized", False)
    state.setdefault("db_watermarks", {})
    state.setdefault("song_key_to_song_id", {})

    supabase_url = ensure_env("SUPABASE_URL")
    service_key = ensure_env("SUPABASE_SERVICE_ROLE_KEY")
    rest = SupabaseRest(supabase_url, service_key, timeout=args.request_timeout)

    if (not args.no_reset) and (not state.get("initialized")):
        if args.dry_run:
            print("[dry-run] Initial reset skipped.")
        else:
            print("Resetting artists + songs (one-time initialization)...", flush=True)
            reset_library(rest)
            print("Reset complete.", flush=True)
        state["initialized"] = True
        state["song_key_to_song_id"] = {}
        atomic_write_json(state_file, state)

    print("Loading artist cache from Supabase...", flush=True)
    artist_cache = fetch_all_artists_map(rest)
    print(f"Artist cache loaded: {len(artist_cache)}", flush=True)
    print("Loading song index from Supabase...", flush=True)
    songs_index = fetch_all_songs_index(rest)
    print(f"Song index loaded: {len(songs_index)}", flush=True)
    artist_profile_cache: dict[str, dict[str, Any]] = {}
    artist_source_fingerprints: dict[str, str] = {}
    song_source_fingerprints: dict[str, str] = {}

    cycle = 0
    while True:
        cycle += 1
        started = time.time()
        summary = run_sync_cycle(
            dataset_dir=dataset_dir,
            sections_root=sections_dir,
            state=state,
            rest=rest,
            batch_size=max(1, int(args.batch_size)),
            artist_cache=artist_cache,
            songs_index=songs_index,
            artist_profile_cache=artist_profile_cache,
            artist_source_fingerprints=artist_source_fingerprints,
            song_source_fingerprints=song_source_fingerprints,
            dry_run=bool(args.dry_run),
        )
        atomic_write_json(state_file, state)

        elapsed = time.time() - started
        print(
            (
                f"cycle={cycle} candidates={summary['candidates']} inserted={summary['inserted_songs']} "
                f"skipped={summary['skipped_existing']} missing_json={summary['missing_json']} "
                f"bad_rows={summary['skipped_bad']} sections={summary['sections_upserted']} "
                f"patched={summary['source_patched']} artifacts={summary['artifacts_written']} elapsed={elapsed:.1f}s"
            ),
            flush=True,
        )

        if args.once:
            break

        time.sleep(max(1, int(args.poll_seconds)))

    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except SupabaseError as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        raise SystemExit(1)
