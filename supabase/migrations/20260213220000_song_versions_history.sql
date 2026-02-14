-- Song version history: every change to songs.lyrics_chords generates an immutable version.
-- This supports "histórico + diff" and helps avoid edit wars by making changes auditable/reviewable.

create table if not exists public.song_versions (
  id uuid primary key default gen_random_uuid(),
  song_id uuid not null references public.songs(id) on delete cascade,
  version_no int not null,
  text text not null,
  source text null, -- optional: 'approved_suggestion', 'manual', etc (best-effort)
  source_id uuid null, -- optional: suggestion id, etc
  created_at timestamptz not null default now(),
  created_by uuid null,
  unique (song_id, version_no),
  check (char_length(text) <= 50000)
);

create index if not exists song_versions_song_idx
on public.song_versions (song_id, version_no desc);

alter table public.song_versions enable row level security;

-- Anyone can read song versions (no PII).
create policy "song_versions_read" on public.song_versions
for select to anon, authenticated using (true);

-- No public insert/update/delete (managed by triggers / moderation).

create or replace function public.next_song_version_no(p_song_id uuid)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v int;
begin
  select coalesce(max(version_no), 0) + 1 into v
  from public.song_versions
  where song_id = p_song_id;
  return v;
end;
$$;

create or replace function public.song_versions_on_song_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Seed v1 on song insert.
  insert into public.song_versions (song_id, version_no, text, source)
  values (new.id, 1, new.lyrics_chords, 'seed')
  on conflict (song_id, version_no) do nothing;
  return new;
end;
$$;

create or replace function public.song_versions_on_song_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v int;
begin
  if new.lyrics_chords is distinct from old.lyrics_chords then
    v := public.next_song_version_no(new.id);
    insert into public.song_versions (song_id, version_no, text, source)
    values (new.id, v, new.lyrics_chords, 'update');
  end if;
  return new;
end;
$$;

drop trigger if exists songs_versions_after_insert_trg on public.songs;
create trigger songs_versions_after_insert_trg
after insert on public.songs
for each row execute function public.song_versions_on_song_insert();

drop trigger if exists songs_versions_after_update_trg on public.songs;
create trigger songs_versions_after_update_trg
after update of lyrics_chords on public.songs
for each row execute function public.song_versions_on_song_update();

-- Backfill v1 for existing songs (if this migration is applied after songs already exist).
insert into public.song_versions (song_id, version_no, text, source)
select s.id, 1, s.lyrics_chords, 'backfill'
from public.songs s
where not exists (
  select 1 from public.song_versions v where v.song_id = s.id
)
on conflict (song_id, version_no) do nothing;
