-- Public shareable playlists derived from "favorite folders" (pastas de favoritos).
-- Goal:
-- - Owner creates a public link for a folder.
-- - Anyone can view songs in that playlist (no user_id exposure).
-- - Anyone logged in can "import" (client-side) by adding songs to favorites.

create table if not exists public.shared_playlists (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  folder_id uuid not null references public.favorite_folders(id) on delete cascade,
  title text not null,
  description text null,
  is_public boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_user_id, folder_id)
);

create index if not exists shared_playlists_public_idx on public.shared_playlists (is_public, created_at desc);
create index if not exists shared_playlists_folder_idx on public.shared_playlists (folder_id);

create trigger shared_playlists_set_updated_at
before update on public.shared_playlists
for each row execute function public.set_updated_at();

alter table public.shared_playlists enable row level security;

-- Public can read public playlists; owners can read their own even if private.
create policy "shared_playlists_read" on public.shared_playlists
for select to anon, authenticated
using (is_public = true or auth.uid() = owner_user_id);

create policy "shared_playlists_insert_own" on public.shared_playlists
for insert to authenticated
with check (auth.uid() = owner_user_id);

create policy "shared_playlists_update_own" on public.shared_playlists
for update to authenticated
using (auth.uid() = owner_user_id)
with check (auth.uid() = owner_user_id);

create policy "shared_playlists_delete_own" on public.shared_playlists
for delete to authenticated
using (auth.uid() = owner_user_id);

create table if not exists public.shared_playlist_items (
  playlist_id uuid not null references public.shared_playlists(id) on delete cascade,
  song_id uuid not null references public.songs(id) on delete cascade,
  added_at timestamptz not null default now(),
  primary key (playlist_id, song_id)
);

create index if not exists shared_playlist_items_song_idx on public.shared_playlist_items (song_id);
create index if not exists shared_playlist_items_added_idx on public.shared_playlist_items (playlist_id, added_at desc);

alter table public.shared_playlist_items enable row level security;

-- Public can read playlist items only when playlist is public; owner can read their own.
create policy "shared_playlist_items_read" on public.shared_playlist_items
for select to anon, authenticated
using (
  exists (
    select 1
    from public.shared_playlists p
    where p.id = shared_playlist_items.playlist_id
      and (p.is_public = true or auth.uid() = p.owner_user_id)
  )
);

-- No public insert/update/delete (managed by triggers + RPC).

create or replace function public.create_shared_playlist_for_folder(p_folder_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid;
  folder_name text;
  pid uuid;
begin
  uid := auth.uid();
  if uid is null then
    raise exception 'not_authenticated';
  end if;

  select name into folder_name
  from public.favorite_folders
  where id = p_folder_id
    and user_id = uid;

  if folder_name is null then
    raise exception 'folder_not_found';
  end if;

  insert into public.shared_playlists (owner_user_id, folder_id, title)
  values (uid, p_folder_id, folder_name)
  on conflict (owner_user_id, folder_id) do update
    set title = excluded.title
  returning id into pid;

  -- Backfill: add current favorites from this folder.
  insert into public.shared_playlist_items (playlist_id, song_id, added_at)
  select pid, f.song_id, coalesce(f.created_at, now())
  from public.favorites f
  where f.user_id = uid
    and f.folder_id = p_folder_id
  on conflict (playlist_id, song_id) do update
    set added_at = excluded.added_at;

  -- Remove stale items that are no longer favorites in this folder.
  delete from public.shared_playlist_items spi
  where spi.playlist_id = pid
    and not exists (
      select 1
      from public.favorites f
      where f.user_id = uid
        and f.folder_id = p_folder_id
        and f.song_id = spi.song_id
    );

  return pid;
end;
$$;

create or replace function public.shared_playlists_sync_from_favorites()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  pid uuid;
begin
  if tg_op = 'INSERT' then
    if new.folder_id is null then
      return new;
    end if;

    select id into pid
    from public.shared_playlists
    where owner_user_id = new.user_id
      and folder_id = new.folder_id;

    if pid is not null then
      insert into public.shared_playlist_items (playlist_id, song_id, added_at)
      values (pid, new.song_id, coalesce(new.created_at, now()))
      on conflict (playlist_id, song_id) do update
        set added_at = excluded.added_at;
    end if;

    return new;
  end if;

  if tg_op = 'DELETE' then
    if old.folder_id is null then
      return old;
    end if;

    select id into pid
    from public.shared_playlists
    where owner_user_id = old.user_id
      and folder_id = old.folder_id;

    if pid is not null then
      delete from public.shared_playlist_items
      where playlist_id = pid
        and song_id = old.song_id;
    end if;

    return old;
  end if;

  -- UPDATE (folder move)
  if old.folder_id is distinct from new.folder_id then
    if old.folder_id is not null then
      select id into pid
      from public.shared_playlists
      where owner_user_id = old.user_id
        and folder_id = old.folder_id;

      if pid is not null then
        delete from public.shared_playlist_items
        where playlist_id = pid
          and song_id = old.song_id;
      end if;
    end if;

    if new.folder_id is not null then
      select id into pid
      from public.shared_playlists
      where owner_user_id = new.user_id
        and folder_id = new.folder_id;

      if pid is not null then
        insert into public.shared_playlist_items (playlist_id, song_id, added_at)
        values (pid, new.song_id, coalesce(new.created_at, now()))
        on conflict (playlist_id, song_id) do update
          set added_at = excluded.added_at;
      end if;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists favorites_shared_playlists_sync_ins_trg on public.favorites;
create trigger favorites_shared_playlists_sync_ins_trg
after insert on public.favorites
for each row execute function public.shared_playlists_sync_from_favorites();

drop trigger if exists favorites_shared_playlists_sync_del_trg on public.favorites;
create trigger favorites_shared_playlists_sync_del_trg
after delete on public.favorites
for each row execute function public.shared_playlists_sync_from_favorites();

drop trigger if exists favorites_shared_playlists_sync_upd_trg on public.favorites;
create trigger favorites_shared_playlists_sync_upd_trg
after update of folder_id on public.favorites
for each row execute function public.shared_playlists_sync_from_favorites();

