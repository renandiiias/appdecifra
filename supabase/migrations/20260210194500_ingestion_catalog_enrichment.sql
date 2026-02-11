-- Enrichment schema for live CifraClub ingestion.
-- Adds source metadata and section-level categorization support.

alter table public.artists
  add column if not exists source_slug text,
  add column if not exists source_artist_id bigint,
  add column if not exists source_genre_slug text,
  add column if not exists source_hits bigint,
  add column if not exists source_artist_image_path text,
  add column if not exists source_artist_head_image_path text,
  add column if not exists source_photos_api_path text;

create unique index if not exists artists_source_slug_uniq on public.artists (source_slug) where source_slug is not null;

alter table public.songs
  add column if not exists source_song_key text,
  add column if not exists source_song_id bigint,
  add column if not exists source_lyrics_id bigint,
  add column if not exists source_song_slug text,
  add column if not exists source_artist_slug text,
  add column if not exists source_json_path text,
  add column if not exists source_processed_at timestamptz,
  add column if not exists source_variant text;

create unique index if not exists songs_source_song_key_uniq on public.songs (source_song_key) where source_song_key is not null;
create index if not exists songs_source_song_slug_idx on public.songs (source_song_slug);
create index if not exists songs_source_artist_slug_idx on public.songs (source_artist_slug);
create index if not exists songs_source_processed_at_idx on public.songs (source_processed_at);

create table if not exists public.song_sections (
  id uuid primary key default gen_random_uuid(),
  song_id uuid not null references public.songs(id) on delete cascade,
  source_type text not null check (source_type in ('cifra', 'letra', 'cifra_version')),
  source_label text not null,
  order_index int not null,
  section_type text not null check (
    section_type in (
      'intro',
      'verse',
      'pre_chorus',
      'chorus',
      'bridge',
      'solo',
      'instrumental',
      'outro',
      'tag',
      'unknown'
    )
  ),
  section_label text not null,
  line_start int null,
  line_end int null,
  content text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (song_id, source_type, source_label, order_index)
);

create index if not exists song_sections_song_idx on public.song_sections (song_id);
create index if not exists song_sections_type_idx on public.song_sections (section_type);

create trigger song_sections_set_updated_at
before update on public.song_sections
for each row execute function public.set_updated_at();

alter table public.song_sections enable row level security;

create policy "song_sections_read" on public.song_sections
for select using (true);

-- Service role inserts/updates/deletes are still allowed without explicit policies.

create table if not exists public.ingest_runs (
  id uuid primary key default gen_random_uuid(),
  started_at timestamptz not null default now(),
  finished_at timestamptz null,
  source text not null default 'cifraclub-live',
  batch_size int not null,
  inserted_artists int not null default 0,
  inserted_songs int not null default 0,
  skipped_songs int not null default 0,
  notes text null,
  created_at timestamptz not null default now()
);

alter table public.ingest_runs enable row level security;

create policy "ingest_runs_read" on public.ingest_runs
for select using (true);
