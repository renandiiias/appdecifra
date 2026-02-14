-- Public community versions of a song ("versões da comunidade"), derived from a user's "minha versão".
-- Features: publish, like, fork (remix lineage), and apply/save locally in the app.
-- Note: We store version text here (same shape as songs.lyrics_chords) and do NOT expose user PII.

create table if not exists public.song_public_versions (
  id uuid primary key default gen_random_uuid(),
  song_id uuid not null references public.songs(id) on delete cascade,
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  title text null,
  text text not null,
  excerpt text not null,
  parent_version_id uuid null references public.song_public_versions(id) on delete set null,
  like_count int not null default 0,
  fork_count int not null default 0,
  is_public boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (char_length(text) <= 50000)
);

create index if not exists song_public_versions_song_idx on public.song_public_versions (song_id, created_at desc);
create index if not exists song_public_versions_popular_idx on public.song_public_versions (song_id, like_count desc, fork_count desc, created_at desc);

create trigger song_public_versions_set_updated_at
before update on public.song_public_versions
for each row execute function public.set_updated_at();

alter table public.song_public_versions enable row level security;

-- Public versions are readable by anyone (anon/authenticated) when public.
create policy "song_public_versions_read" on public.song_public_versions
for select to anon, authenticated
using (is_public = true or auth.uid() = owner_user_id);

create policy "song_public_versions_insert_own" on public.song_public_versions
for insert to authenticated
with check (auth.uid() = owner_user_id);

create policy "song_public_versions_update_own" on public.song_public_versions
for update to authenticated
using (auth.uid() = owner_user_id)
with check (auth.uid() = owner_user_id);

create policy "song_public_versions_delete_own" on public.song_public_versions
for delete to authenticated
using (auth.uid() = owner_user_id);

create table if not exists public.song_public_version_likes (
  id uuid primary key default gen_random_uuid(),
  version_id uuid not null references public.song_public_versions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (version_id, user_id)
);

create index if not exists song_public_version_likes_version_idx on public.song_public_version_likes (version_id);
create index if not exists song_public_version_likes_user_idx on public.song_public_version_likes (user_id);

alter table public.song_public_version_likes enable row level security;

create policy "song_public_version_likes_read_own" on public.song_public_version_likes
for select to authenticated
using (auth.uid() = user_id);

create policy "song_public_version_likes_insert_own" on public.song_public_version_likes
for insert to authenticated
with check (auth.uid() = user_id);

create policy "song_public_version_likes_delete_own" on public.song_public_version_likes
for delete to authenticated
using (auth.uid() = user_id);

create table if not exists public.song_public_version_forks (
  id uuid primary key default gen_random_uuid(),
  version_id uuid not null references public.song_public_versions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists song_public_version_forks_version_idx on public.song_public_version_forks (version_id);
create index if not exists song_public_version_forks_user_idx on public.song_public_version_forks (user_id, created_at desc);

alter table public.song_public_version_forks enable row level security;

create policy "song_public_version_forks_read_own" on public.song_public_version_forks
for select to authenticated
using (auth.uid() = user_id);

create policy "song_public_version_forks_insert_own" on public.song_public_version_forks
for insert to authenticated
with check (auth.uid() = user_id);

create or replace function public.recompute_song_public_version_like_count(p_version_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  cnt int;
begin
  select count(*)::int into cnt
  from public.song_public_version_likes
  where version_id = p_version_id;

  update public.song_public_versions
  set like_count = coalesce(cnt, 0)
  where id = p_version_id;
end;
$$;

create or replace function public.recompute_song_public_version_fork_count(p_version_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  cnt int;
begin
  select count(*)::int into cnt
  from public.song_public_version_forks
  where version_id = p_version_id;

  update public.song_public_versions
  set fork_count = coalesce(cnt, 0)
  where id = p_version_id;
end;
$$;

create or replace function public.song_public_version_likes_after_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  vid uuid;
begin
  vid := coalesce(new.version_id, old.version_id);
  perform public.recompute_song_public_version_like_count(vid);
  return coalesce(new, old);
end;
$$;

drop trigger if exists song_public_version_likes_after_insert_trg on public.song_public_version_likes;
create trigger song_public_version_likes_after_insert_trg
after insert on public.song_public_version_likes
for each row execute function public.song_public_version_likes_after_change();

drop trigger if exists song_public_version_likes_after_delete_trg on public.song_public_version_likes;
create trigger song_public_version_likes_after_delete_trg
after delete on public.song_public_version_likes
for each row execute function public.song_public_version_likes_after_change();

create or replace function public.song_public_version_forks_after_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.recompute_song_public_version_fork_count(new.version_id);
  return new;
end;
$$;

drop trigger if exists song_public_version_forks_after_insert_trg on public.song_public_version_forks;
create trigger song_public_version_forks_after_insert_trg
after insert on public.song_public_version_forks
for each row execute function public.song_public_version_forks_after_insert();

