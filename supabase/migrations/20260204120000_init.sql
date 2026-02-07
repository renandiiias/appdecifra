create extension if not exists "pgcrypto";

create table if not exists public.artists (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  name_search text not null,
  created_at timestamptz default now()
);

create table if not exists public.songs (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  title_search text not null,
  artist_id uuid references public.artists(id) on delete set null,
  lyrics_chords text not null,
  original_key text not null,
  tuning text default 'E A D G B E',
  capo int null,
  category text null,
  views int default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.favorites (
  user_id uuid not null references auth.users(id) on delete cascade,
  song_id uuid not null references public.songs(id) on delete cascade,
  created_at timestamptz default now(),
  primary key (user_id, song_id)
);

create index if not exists artists_name_search_idx on public.artists (name_search);
create index if not exists songs_title_search_idx on public.songs (title_search);
create index if not exists songs_artist_idx on public.songs (artist_id);

create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger songs_set_updated_at
before update on public.songs
for each row execute function public.set_updated_at();

alter table public.artists enable row level security;
alter table public.songs enable row level security;
alter table public.favorites enable row level security;

create policy "artists_read" on public.artists
for select using (true);

create policy "songs_read" on public.songs
for select using (true);

create policy "favorites_read" on public.favorites
for select using (auth.uid() = user_id);

create policy "favorites_insert" on public.favorites
for insert with check (auth.uid() = user_id);

create policy "favorites_delete" on public.favorites
for delete using (auth.uid() = user_id);
