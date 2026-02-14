

-- ============================================================
-- BEGIN supabase/migrations/20260213120000_song_suggestion_votes.sql
-- ============================================================

-- Community confirmation votes for song suggestions.
-- Goal: let other users confirm/deny a pending suggestion BEFORE moderation,
-- without exposing the full suggestion text publicly.

create table if not exists public.song_suggestions_queue (
  suggestion_id uuid primary key references public.song_suggestions(id) on delete cascade,
  song_id uuid not null references public.songs(id) on delete cascade,
  song_title text not null,
  artist text not null,
  kind text not null check (kind in ('letra', 'cifra')),
  excerpt text not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  upvotes int not null default 0,
  downvotes int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists song_suggestions_queue_song_idx on public.song_suggestions_queue (song_id, status, created_at desc);

alter table public.song_suggestions_queue enable row level security;

-- Anyone logged in can see the public queue. (No user_id / private contact fields here.)
create policy "song_suggestions_queue_read" on public.song_suggestions_queue
for select to authenticated using (true);

-- No public insert/update/delete on purpose (managed by triggers / moderation).

create or replace function public.song_suggestions_queue_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.song_suggestions_queue (
    suggestion_id,
    song_id,
    song_title,
    artist,
    kind,
    excerpt,
    status,
    created_at
  )
  values (
    new.id,
    new.song_id,
    new.song_title,
    new.artist,
    new.kind,
    left(coalesce(new.text, ''), 280),
    new.status,
    coalesce(new.created_at, now())
  )
  on conflict (suggestion_id) do nothing;

  return new;
end;
$$;

create or replace function public.song_suggestions_queue_sync()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Keep queue lightweight: only pending stays in the public queue.
  if new.status = 'pending' then
    insert into public.song_suggestions_queue (
      suggestion_id,
      song_id,
      song_title,
      artist,
      kind,
      excerpt,
      status,
      created_at
    )
    values (
      new.id,
      new.song_id,
      new.song_title,
      new.artist,
      new.kind,
      left(coalesce(new.text, ''), 280),
      new.status,
      coalesce(new.created_at, now())
    )
    on conflict (suggestion_id) do update
      set
        song_title = excluded.song_title,
        artist = excluded.artist,
        kind = excluded.kind,
        excerpt = excluded.excerpt,
        status = excluded.status;
  else
    delete from public.song_suggestions_queue where suggestion_id = new.id;
  end if;

  return new;
end;
$$;

drop trigger if exists song_suggestions_queue_insert_trg on public.song_suggestions;
create trigger song_suggestions_queue_insert_trg
after insert on public.song_suggestions
for each row execute function public.song_suggestions_queue_insert();

drop trigger if exists song_suggestions_queue_sync_trg on public.song_suggestions;
create trigger song_suggestions_queue_sync_trg
after update of status, text, kind, song_title, artist on public.song_suggestions
for each row execute function public.song_suggestions_queue_sync();

create table if not exists public.song_suggestion_votes (
  id uuid primary key default gen_random_uuid(),
  suggestion_id uuid not null references public.song_suggestions_queue(suggestion_id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  vote smallint not null check (vote in (-1, 1)),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (suggestion_id, user_id)
);

create index if not exists song_suggestion_votes_suggestion_idx on public.song_suggestion_votes (suggestion_id);
create index if not exists song_suggestion_votes_user_idx on public.song_suggestion_votes (user_id);

create trigger song_suggestion_votes_set_updated_at
before update on public.song_suggestion_votes
for each row execute function public.set_updated_at();

alter table public.song_suggestion_votes enable row level security;

create policy "song_suggestion_votes_read_own" on public.song_suggestion_votes
for select to authenticated using (auth.uid() = user_id);

create policy "song_suggestion_votes_insert_own" on public.song_suggestion_votes
for insert to authenticated with check (auth.uid() = user_id);

create policy "song_suggestion_votes_update_own" on public.song_suggestion_votes
for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "song_suggestion_votes_delete_own" on public.song_suggestion_votes
for delete to authenticated using (auth.uid() = user_id);

create or replace function public.recompute_song_suggestion_vote_counts(p_suggestion_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  upc int;
  downc int;
begin
  select
    count(*) filter (where vote = 1)::int,
    count(*) filter (where vote = -1)::int
  into upc, downc
  from public.song_suggestion_votes
  where suggestion_id = p_suggestion_id;

  update public.song_suggestions_queue
  set upvotes = coalesce(upc, 0),
      downvotes = coalesce(downc, 0)
  where suggestion_id = p_suggestion_id;
end;
$$;

create or replace function public.song_suggestion_votes_after_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  sid uuid;
begin
  sid := coalesce(new.suggestion_id, old.suggestion_id);
  perform public.recompute_song_suggestion_vote_counts(sid);
  return coalesce(new, old);
end;
$$;

drop trigger if exists song_suggestion_votes_after_insert_trg on public.song_suggestion_votes;
create trigger song_suggestion_votes_after_insert_trg
after insert on public.song_suggestion_votes
for each row execute function public.song_suggestion_votes_after_change();

drop trigger if exists song_suggestion_votes_after_update_trg on public.song_suggestion_votes;
create trigger song_suggestion_votes_after_update_trg
after update of vote on public.song_suggestion_votes
for each row execute function public.song_suggestion_votes_after_change();

drop trigger if exists song_suggestion_votes_after_delete_trg on public.song_suggestion_votes;
create trigger song_suggestion_votes_after_delete_trg
after delete on public.song_suggestion_votes
for each row execute function public.song_suggestion_votes_after_change();



-- END supabase/migrations/20260213120000_song_suggestion_votes.sql


-- ============================================================
-- BEGIN supabase/migrations/20260213123000_song_requests_queue.sql
-- ============================================================

-- Public queue for community song requests ("Pedidos de música"), with upvotes and moderation status.
-- The app submits a request; the queue is visible to all authenticated users for discovery + voting.

create table if not exists public.song_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  artist text not null,
  reference_url text null,
  message text null,
  status text not null default 'pending' check (status in ('pending', 'reviewing', 'added', 'rejected')),
  linked_song_id uuid null references public.songs(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists song_requests_user_idx on public.song_requests (user_id, created_at desc);
create index if not exists song_requests_status_idx on public.song_requests (status, created_at desc);

create trigger song_requests_set_updated_at
before update on public.song_requests
for each row execute function public.set_updated_at();

alter table public.song_requests enable row level security;

-- Users can manage only their own requests (private table).
create policy "song_requests_read_own" on public.song_requests
for select to authenticated using (auth.uid() = user_id);

create policy "song_requests_insert_own" on public.song_requests
for insert to authenticated with check (auth.uid() = user_id);

create policy "song_requests_delete_own" on public.song_requests
for delete to authenticated using (auth.uid() = user_id);

-- No public update policy (moderation via service role).

create table if not exists public.song_requests_queue (
  request_id uuid primary key references public.song_requests(id) on delete cascade,
  title text not null,
  artist text not null,
  status text not null default 'pending' check (status in ('pending', 'reviewing', 'added', 'rejected')),
  upvotes int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists song_requests_queue_status_idx on public.song_requests_queue (status, upvotes desc, created_at desc);

alter table public.song_requests_queue enable row level security;

-- Queue is public to authenticated users.
create policy "song_requests_queue_read" on public.song_requests_queue
for select to authenticated using (true);

-- No public insert/update/delete (managed by triggers / moderation).

create or replace function public.song_requests_queue_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.song_requests_queue (request_id, title, artist, status, created_at)
  values (new.id, new.title, new.artist, new.status, coalesce(new.created_at, now()))
  on conflict (request_id) do nothing;
  return new;
end;
$$;

create or replace function public.song_requests_queue_sync()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.song_requests_queue (request_id, title, artist, status, created_at)
  values (new.id, new.title, new.artist, new.status, coalesce(new.created_at, now()))
  on conflict (request_id) do update
    set title = excluded.title,
        artist = excluded.artist,
        status = excluded.status;
  return new;
end;
$$;

drop trigger if exists song_requests_queue_insert_trg on public.song_requests;
create trigger song_requests_queue_insert_trg
after insert on public.song_requests
for each row execute function public.song_requests_queue_insert();

drop trigger if exists song_requests_queue_sync_trg on public.song_requests;
create trigger song_requests_queue_sync_trg
after update of title, artist, status on public.song_requests
for each row execute function public.song_requests_queue_sync();

create table if not exists public.song_request_votes (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.song_requests_queue(request_id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (request_id, user_id)
);

create index if not exists song_request_votes_request_idx on public.song_request_votes (request_id);
create index if not exists song_request_votes_user_idx on public.song_request_votes (user_id);

alter table public.song_request_votes enable row level security;

create policy "song_request_votes_read_own" on public.song_request_votes
for select to authenticated using (auth.uid() = user_id);

create policy "song_request_votes_insert_own" on public.song_request_votes
for insert to authenticated with check (auth.uid() = user_id);

create policy "song_request_votes_delete_own" on public.song_request_votes
for delete to authenticated using (auth.uid() = user_id);

create or replace function public.recompute_song_request_vote_counts(p_request_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  upc int;
begin
  select count(*)::int into upc
  from public.song_request_votes
  where request_id = p_request_id;

  update public.song_requests_queue
  set upvotes = coalesce(upc, 0)
  where request_id = p_request_id;
end;
$$;

create or replace function public.song_request_votes_after_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  rid uuid;
begin
  rid := coalesce(new.request_id, old.request_id);
  perform public.recompute_song_request_vote_counts(rid);
  return coalesce(new, old);
end;
$$;

drop trigger if exists song_request_votes_after_insert_trg on public.song_request_votes;
create trigger song_request_votes_after_insert_trg
after insert on public.song_request_votes
for each row execute function public.song_request_votes_after_change();

drop trigger if exists song_request_votes_after_delete_trg on public.song_request_votes;
create trigger song_request_votes_after_delete_trg
after delete on public.song_request_votes
for each row execute function public.song_request_votes_after_change();



-- END supabase/migrations/20260213123000_song_requests_queue.sql


-- ============================================================
-- BEGIN supabase/migrations/20260213153000_song_video_lessons_public.sql
-- ============================================================

-- Public surface for approved song video lessons (YouTube), derived from song_video_lesson_requests.
-- Keeps PII (name/email/whatsapp) private in the original request table.

create table if not exists public.song_video_lessons_public (
  request_id uuid primary key references public.song_video_lesson_requests(id) on delete cascade,
  song_id uuid not null references public.songs(id) on delete cascade,
  song_title text not null,
  artist text not null,
  youtube_url text not null,
  approved_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists song_video_lessons_public_song_idx
on public.song_video_lessons_public (song_id, approved_at desc, created_at desc);

alter table public.song_video_lessons_public enable row level security;

-- Approved video lessons are visible to everyone (anon/authenticated).
create policy "song_video_lessons_public_read" on public.song_video_lessons_public
for select to anon, authenticated using (true);

-- No public insert/update/delete (managed by triggers / moderation).

create or replace function public.song_video_lessons_public_sync()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    delete from public.song_video_lessons_public where request_id = old.id;
    return old;
  end if;

  if new.status = 'approved' then
    insert into public.song_video_lessons_public (
      request_id,
      song_id,
      song_title,
      artist,
      youtube_url,
      approved_at,
      created_at
    )
    values (
      new.id,
      new.song_id,
      new.song_title,
      new.artist,
      new.youtube_url,
      coalesce(new.reviewed_at, now()),
      coalesce(new.created_at, now())
    )
    on conflict (request_id) do update
      set
        song_id = excluded.song_id,
        song_title = excluded.song_title,
        artist = excluded.artist,
        youtube_url = excluded.youtube_url,
        approved_at = excluded.approved_at;
  else
    delete from public.song_video_lessons_public where request_id = new.id;
  end if;

  return new;
end;
$$;

drop trigger if exists song_video_lesson_requests_public_sync_trg on public.song_video_lesson_requests;
create trigger song_video_lesson_requests_public_sync_trg
after insert or update of status, song_id, song_title, artist, youtube_url, reviewed_at on public.song_video_lesson_requests
for each row execute function public.song_video_lessons_public_sync();

drop trigger if exists song_video_lesson_requests_public_delete_trg on public.song_video_lesson_requests;
create trigger song_video_lesson_requests_public_delete_trg
after delete on public.song_video_lesson_requests
for each row execute function public.song_video_lessons_public_sync();



-- END supabase/migrations/20260213153000_song_video_lessons_public.sql


-- ============================================================
-- BEGIN supabase/migrations/20260213164000_artist_verified_profile.sql
-- ============================================================

-- Verified artist profile: official links + highlight + badge support.
-- Claim/verification status already exists via artists.verified_at and claimed_user_id.

alter table public.artists
  add column if not exists profile_highlight text null,
  add column if not exists official_links jsonb null;

-- Optional indexes for filtering / sorting verified artists.
create index if not exists artists_verified_at_idx on public.artists (verified_at desc);



-- END supabase/migrations/20260213164000_artist_verified_profile.sql


-- ============================================================
-- BEGIN supabase/migrations/20260213172000_shared_playlists.sql
-- ============================================================

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



-- END supabase/migrations/20260213172000_shared_playlists.sql


-- ============================================================
-- BEGIN supabase/migrations/20260213190000_shared_setlists.sql
-- ============================================================

-- Public shareable worship setlists ("escalas/repertórios") stored as JSON payload.
-- Goal:
-- - Owner generates a public link/QR for a setlist.
-- - Anyone can view the setlist (anon/auth) when public.
-- - Logged-in users can import into their local setlists.

create table if not exists public.shared_setlists (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  scheduled_at text not null,
  church_name text null,
  payload jsonb not null, -- { songs: [{id,title,artist?}], team: [{name,instrument}] }
  is_public boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists shared_setlists_public_idx on public.shared_setlists (is_public, created_at desc);
create index if not exists shared_setlists_owner_idx on public.shared_setlists (owner_user_id, created_at desc);

create trigger shared_setlists_set_updated_at
before update on public.shared_setlists
for each row execute function public.set_updated_at();

alter table public.shared_setlists enable row level security;

-- Public can read public setlists; owners can read their own even if private.
create policy "shared_setlists_read" on public.shared_setlists
for select to anon, authenticated
using (is_public = true or auth.uid() = owner_user_id);

create policy "shared_setlists_insert_own" on public.shared_setlists
for insert to authenticated
with check (auth.uid() = owner_user_id);

create policy "shared_setlists_update_own" on public.shared_setlists
for update to authenticated
using (auth.uid() = owner_user_id)
with check (auth.uid() = owner_user_id);

create policy "shared_setlists_delete_own" on public.shared_setlists
for delete to authenticated
using (auth.uid() = owner_user_id);



-- END supabase/migrations/20260213190000_shared_setlists.sql


-- ============================================================
-- BEGIN supabase/migrations/20260213203000_setlist_templates.sql
-- ============================================================

-- Community-publishable templates for worship setlists and song selections.
-- MVP: store template payload as JSON, allow public discovery, allow "remix" tracking.

create table if not exists public.setlist_templates (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null default 'setlist' check (kind in ('setlist', 'selection')),
  title text not null,
  description text null,
  tags text[] null,
  payload jsonb not null, -- { songs: [...], team?: [...] }
  parent_template_id uuid null references public.setlist_templates(id) on delete set null,
  remix_count int not null default 0,
  is_public boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists setlist_templates_public_idx
on public.setlist_templates (kind, is_public, remix_count desc, created_at desc);

create index if not exists setlist_templates_owner_idx
on public.setlist_templates (owner_user_id, created_at desc);

create trigger setlist_templates_set_updated_at
before update on public.setlist_templates
for each row execute function public.set_updated_at();

alter table public.setlist_templates enable row level security;

-- Public read for public templates; owner can read their own even if private.
create policy "setlist_templates_read" on public.setlist_templates
for select to anon, authenticated
using (is_public = true or auth.uid() = owner_user_id);

create policy "setlist_templates_insert_own" on public.setlist_templates
for insert to authenticated
with check (auth.uid() = owner_user_id);

create policy "setlist_templates_update_own" on public.setlist_templates
for update to authenticated
using (auth.uid() = owner_user_id)
with check (auth.uid() = owner_user_id);

create policy "setlist_templates_delete_own" on public.setlist_templates
for delete to authenticated
using (auth.uid() = owner_user_id);

create table if not exists public.setlist_template_remixes (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.setlist_templates(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists setlist_template_remixes_template_idx on public.setlist_template_remixes (template_id, created_at desc);
create index if not exists setlist_template_remixes_user_idx on public.setlist_template_remixes (user_id, created_at desc);

alter table public.setlist_template_remixes enable row level security;

-- Users can read their own remix history (optional).
create policy "setlist_template_remixes_read_own" on public.setlist_template_remixes
for select to authenticated using (auth.uid() = user_id);

create policy "setlist_template_remixes_insert_own" on public.setlist_template_remixes
for insert to authenticated with check (auth.uid() = user_id);

create or replace function public.recompute_setlist_template_remix_count(p_template_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  cnt int;
begin
  select count(*)::int into cnt
  from public.setlist_template_remixes
  where template_id = p_template_id;

  update public.setlist_templates
  set remix_count = coalesce(cnt, 0)
  where id = p_template_id;
end;
$$;

create or replace function public.setlist_template_remixes_after_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  tid uuid;
begin
  tid := coalesce(new.template_id, old.template_id);
  perform public.recompute_setlist_template_remix_count(tid);
  return coalesce(new, old);
end;
$$;

drop trigger if exists setlist_template_remixes_after_insert_trg on public.setlist_template_remixes;
create trigger setlist_template_remixes_after_insert_trg
after insert on public.setlist_template_remixes
for each row execute function public.setlist_template_remixes_after_change();

drop trigger if exists setlist_template_remixes_after_delete_trg on public.setlist_template_remixes;
create trigger setlist_template_remixes_after_delete_trg
after delete on public.setlist_template_remixes
for each row execute function public.setlist_template_remixes_after_change();

create or replace function public.record_setlist_template_remix(p_template_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid;
begin
  uid := auth.uid();
  if uid is null then
    raise exception 'not_authenticated';
  end if;

  insert into public.setlist_template_remixes (template_id, user_id)
  values (p_template_id, uid);
end;
$$;



-- END supabase/migrations/20260213203000_setlist_templates.sql


-- ============================================================
-- BEGIN supabase/migrations/20260213212000_song_public_versions.sql
-- ============================================================

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



-- END supabase/migrations/20260213212000_song_public_versions.sql


-- ============================================================
-- BEGIN supabase/migrations/20260213220000_song_versions_history.sql
-- ============================================================

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


-- END supabase/migrations/20260213220000_song_versions_history.sql


-- ============================================================
-- BEGIN supabase/migrations/20260213224000_song_tag_votes.sql
-- ============================================================

-- Collaborative song tags (community voting).
-- Tags: difficulty, vibe, tempo (bpm), rhythm, instrument(s), suggested capo.
--
-- Design:
-- - `song_tag_votes`: per-user votes (no PII), RLS = manage own.
-- - `song_tag_counts`: public aggregated counts per (song_id, key, value), maintained by triggers.

create table if not exists public.song_tag_votes (
  id uuid primary key default gen_random_uuid(),
  song_id uuid not null references public.songs(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  key text not null,
  value text not null,
  created_at timestamptz not null default now(),
  unique (song_id, user_id, key, value)
);

create index if not exists song_tag_votes_song_idx on public.song_tag_votes (song_id, key);
create index if not exists song_tag_votes_user_idx on public.song_tag_votes (user_id, created_at desc);

alter table public.song_tag_votes enable row level security;

create policy "song_tag_votes_read_own" on public.song_tag_votes
for select to authenticated using (auth.uid() = user_id);

create policy "song_tag_votes_insert_own" on public.song_tag_votes
for insert to authenticated with check (auth.uid() = user_id);

create policy "song_tag_votes_delete_own" on public.song_tag_votes
for delete to authenticated using (auth.uid() = user_id);

-- Aggregated counts (public).
create table if not exists public.song_tag_counts (
  song_id uuid not null references public.songs(id) on delete cascade,
  key text not null,
  value text not null,
  votes int not null default 0,
  updated_at timestamptz not null default now(),
  primary key (song_id, key, value)
);

create index if not exists song_tag_counts_song_idx on public.song_tag_counts (song_id, key, votes desc);

alter table public.song_tag_counts enable row level security;

create policy "song_tag_counts_read" on public.song_tag_counts
for select to anon, authenticated using (true);

-- Recompute counts for a given song/key.
create or replace function public.recompute_song_tag_counts(p_song_id uuid, p_key text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Upsert counts for existing values.
  insert into public.song_tag_counts (song_id, key, value, votes, updated_at)
  select
    v.song_id,
    v.key,
    v.value,
    count(*)::int as votes,
    now() as updated_at
  from public.song_tag_votes v
  where v.song_id = p_song_id
    and v.key = p_key
  group by v.song_id, v.key, v.value
  on conflict (song_id, key, value) do update
    set votes = excluded.votes,
        updated_at = excluded.updated_at;

  -- Remove values that no longer have votes.
  delete from public.song_tag_counts c
  where c.song_id = p_song_id
    and c.key = p_key
    and not exists (
      select 1
      from public.song_tag_votes v
      where v.song_id = c.song_id
        and v.key = c.key
        and v.value = c.value
    );
end;
$$;

create or replace function public.song_tag_votes_after_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  sid uuid;
  k text;
begin
  sid := coalesce(new.song_id, old.song_id);
  k := coalesce(new.key, old.key);
  perform public.recompute_song_tag_counts(sid, k);
  return coalesce(new, old);
end;
$$;

drop trigger if exists song_tag_votes_after_insert_trg on public.song_tag_votes;
create trigger song_tag_votes_after_insert_trg
after insert on public.song_tag_votes
for each row execute function public.song_tag_votes_after_change();

drop trigger if exists song_tag_votes_after_delete_trg on public.song_tag_votes;
create trigger song_tag_votes_after_delete_trg
after delete on public.song_tag_votes
for each row execute function public.song_tag_votes_after_change();



-- END supabase/migrations/20260213224000_song_tag_votes.sql


-- ============================================================
-- BEGIN supabase/migrations/20260213230000_song_execution_tips.sql
-- ============================================================

-- Community "execution notes" (dicas de execucao) per song, with moderation and votes.
-- Users submit short tips (entrada/levada/transicao/geral). Tips are moderated.
-- Other users can vote (useful / not useful) to prioritize review and rank approved tips.

create table if not exists public.song_execution_tip_requests (
  id uuid primary key default gen_random_uuid(),
  song_id uuid not null references public.songs(id) on delete cascade,
  song_title text not null,
  artist text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null default 'geral' check (kind in ('entrada', 'levada', 'transicao', 'geral')),
  text text not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  reviewed_at timestamptz null,
  reviewed_by uuid null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists song_execution_tip_requests_song_idx on public.song_execution_tip_requests (song_id, status, created_at desc);
create index if not exists song_execution_tip_requests_user_idx on public.song_execution_tip_requests (user_id, created_at desc);

create trigger song_execution_tip_requests_set_updated_at
before update on public.song_execution_tip_requests
for each row execute function public.set_updated_at();

alter table public.song_execution_tip_requests enable row level security;

create policy "song_execution_tip_requests_read_own" on public.song_execution_tip_requests
for select to authenticated using (auth.uid() = user_id);

create policy "song_execution_tip_requests_insert_own" on public.song_execution_tip_requests
for insert to authenticated with check (auth.uid() = user_id);

create policy "song_execution_tip_requests_delete_own" on public.song_execution_tip_requests
for delete to authenticated using (auth.uid() = user_id);

-- No public update policy (moderation via service role).

-- Public queue (pending only, excerpt-only).
create table if not exists public.song_execution_tips_queue (
  tip_id uuid primary key references public.song_execution_tip_requests(id) on delete cascade,
  song_id uuid not null references public.songs(id) on delete cascade,
  kind text not null check (kind in ('entrada', 'levada', 'transicao', 'geral')),
  excerpt text not null,
  status text not null default 'pending' check (status in ('pending')),
  upvotes int not null default 0,
  downvotes int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists song_execution_tips_queue_song_idx on public.song_execution_tips_queue (song_id, created_at desc);

alter table public.song_execution_tips_queue enable row level security;

create policy "song_execution_tips_queue_read" on public.song_execution_tips_queue
for select to authenticated using (true);

-- Approved tips (full text, no PII).
create table if not exists public.song_execution_tips_public (
  tip_id uuid primary key references public.song_execution_tip_requests(id) on delete cascade,
  song_id uuid not null references public.songs(id) on delete cascade,
  kind text not null check (kind in ('entrada', 'levada', 'transicao', 'geral')),
  text text not null,
  upvotes int not null default 0,
  downvotes int not null default 0,
  approved_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists song_execution_tips_public_song_idx on public.song_execution_tips_public (song_id, upvotes desc, created_at desc);

alter table public.song_execution_tips_public enable row level security;

create policy "song_execution_tips_public_read" on public.song_execution_tips_public
for select to anon, authenticated using (true);

-- Votes (useful / not useful), stored on the request id (tip_id).
create table if not exists public.song_execution_tip_votes (
  id uuid primary key default gen_random_uuid(),
  tip_id uuid not null references public.song_execution_tip_requests(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  vote smallint not null check (vote in (-1, 1)),
  created_at timestamptz not null default now(),
  unique (tip_id, user_id)
);

create index if not exists song_execution_tip_votes_tip_idx on public.song_execution_tip_votes (tip_id);
create index if not exists song_execution_tip_votes_user_idx on public.song_execution_tip_votes (user_id, created_at desc);

alter table public.song_execution_tip_votes enable row level security;

create policy "song_execution_tip_votes_read_own" on public.song_execution_tip_votes
for select to authenticated using (auth.uid() = user_id);

create policy "song_execution_tip_votes_insert_own" on public.song_execution_tip_votes
for insert to authenticated with check (auth.uid() = user_id);

create policy "song_execution_tip_votes_delete_own" on public.song_execution_tip_votes
for delete to authenticated using (auth.uid() = user_id);

create or replace function public.song_execution_tips_queue_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.song_execution_tips_queue (tip_id, song_id, kind, excerpt, created_at)
  values (
    new.id,
    new.song_id,
    new.kind,
    left(coalesce(new.text, ''), 280),
    coalesce(new.created_at, now())
  )
  on conflict (tip_id) do nothing;
  return new;
end;
$$;

create or replace function public.song_execution_tips_public_sync()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Pending stays in queue (excerpt-only). Approved goes to public (full text).
  if new.status = 'pending' then
    insert into public.song_execution_tips_queue (tip_id, song_id, kind, excerpt, created_at)
    values (new.id, new.song_id, new.kind, left(coalesce(new.text, ''), 280), coalesce(new.created_at, now()))
    on conflict (tip_id) do update
      set kind = excluded.kind,
          excerpt = excluded.excerpt;

    delete from public.song_execution_tips_public where tip_id = new.id;
  elsif new.status = 'approved' then
    delete from public.song_execution_tips_queue where tip_id = new.id;

    insert into public.song_execution_tips_public (tip_id, song_id, kind, text, approved_at, created_at)
    values (new.id, new.song_id, new.kind, new.text, coalesce(new.reviewed_at, now()), coalesce(new.created_at, now()))
    on conflict (tip_id) do update
      set kind = excluded.kind,
          text = excluded.text,
          approved_at = excluded.approved_at;
  else
    delete from public.song_execution_tips_queue where tip_id = new.id;
    delete from public.song_execution_tips_public where tip_id = new.id;
  end if;

  return new;
end;
$$;

drop trigger if exists song_execution_tips_queue_insert_trg on public.song_execution_tip_requests;
create trigger song_execution_tips_queue_insert_trg
after insert on public.song_execution_tip_requests
for each row execute function public.song_execution_tips_queue_insert();

drop trigger if exists song_execution_tips_public_sync_trg on public.song_execution_tip_requests;
create trigger song_execution_tips_public_sync_trg
after update of status, text, kind, reviewed_at on public.song_execution_tip_requests
for each row execute function public.song_execution_tips_public_sync();

create or replace function public.recompute_song_execution_tip_vote_counts(p_tip_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  upc int;
  downc int;
begin
  select count(*)::int into upc
  from public.song_execution_tip_votes
  where tip_id = p_tip_id and vote = 1;

  select count(*)::int into downc
  from public.song_execution_tip_votes
  where tip_id = p_tip_id and vote = -1;

  update public.song_execution_tips_queue
  set upvotes = coalesce(upc, 0),
      downvotes = coalesce(downc, 0)
  where tip_id = p_tip_id;

  update public.song_execution_tips_public
  set upvotes = coalesce(upc, 0),
      downvotes = coalesce(downc, 0)
  where tip_id = p_tip_id;
end;
$$;

create or replace function public.song_execution_tip_votes_after_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  tid uuid;
begin
  tid := coalesce(new.tip_id, old.tip_id);
  perform public.recompute_song_execution_tip_vote_counts(tid);
  return coalesce(new, old);
end;
$$;

drop trigger if exists song_execution_tip_votes_after_insert_trg on public.song_execution_tip_votes;
create trigger song_execution_tip_votes_after_insert_trg
after insert on public.song_execution_tip_votes
for each row execute function public.song_execution_tip_votes_after_change();

drop trigger if exists song_execution_tip_votes_after_delete_trg on public.song_execution_tip_votes;
create trigger song_execution_tip_votes_after_delete_trg
after delete on public.song_execution_tip_votes
for each row execute function public.song_execution_tip_votes_after_change();



-- END supabase/migrations/20260213230000_song_execution_tips.sql


-- ============================================================
-- BEGIN supabase/migrations/20260213230500_song_execution_tips_votes_update.sql
-- ============================================================

-- Fix: when voting uses UPSERT, the row can be updated (vote flips from +1 to -1).
-- The recompute trigger must also run on UPDATE, not only INSERT/DELETE.

drop trigger if exists song_execution_tip_votes_after_update_trg on public.song_execution_tip_votes;
create trigger song_execution_tip_votes_after_update_trg
after update on public.song_execution_tip_votes
for each row execute function public.song_execution_tip_votes_after_change();

-- Optional guardrails (safe if table is empty or already compliant).
alter table public.song_execution_tip_requests
  drop constraint if exists song_execution_tip_requests_text_len_chk;

alter table public.song_execution_tip_requests
  add constraint song_execution_tip_requests_text_len_chk check (char_length(text) <= 400);



-- END supabase/migrations/20260213230500_song_execution_tips_votes_update.sql


-- ============================================================
-- BEGIN supabase/migrations/20260213240000_user_reputation.sql
-- ============================================================

-- User reputation (community trust) used to prioritize moderation and reduce spam reach.
-- Score is updated server-side from moderation outcomes and (optionally) other signals.

create table if not exists public.user_reputation (
  user_id uuid primary key references auth.users(id) on delete cascade,
  score int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists user_reputation_score_idx on public.user_reputation (score desc);

create trigger user_reputation_set_updated_at
before update on public.user_reputation
for each row execute function public.set_updated_at();

alter table public.user_reputation enable row level security;

create policy "user_reputation_read_own" on public.user_reputation
for select to authenticated using (auth.uid() = user_id);

-- No public insert/update/delete on purpose.

create table if not exists public.user_reputation_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  delta int not null,
  reason text not null,
  ref_table text null,
  ref_id uuid null,
  created_at timestamptz not null default now()
);

create index if not exists user_reputation_events_user_idx on public.user_reputation_events (user_id, created_at desc);

alter table public.user_reputation_events enable row level security;

create policy "user_reputation_events_read_own" on public.user_reputation_events
for select to authenticated using (auth.uid() = user_id);

-- Adjust reputation and log an event (service-role / triggers).
create or replace function public.adjust_user_reputation(
  p_user_id uuid,
  p_delta int,
  p_reason text,
  p_ref_table text default null,
  p_ref_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_user_id is null then
    return;
  end if;

  insert into public.user_reputation (user_id, score)
  values (p_user_id, coalesce(p_delta, 0))
  on conflict (user_id) do update
    set score = public.user_reputation.score + coalesce(p_delta, 0);

  insert into public.user_reputation_events (user_id, delta, reason, ref_table, ref_id)
  values (p_user_id, coalesce(p_delta, 0), coalesce(p_reason, 'unknown'), p_ref_table, p_ref_id);
end;
$$;

-- Apply reputation deltas when a moderation status changes (pending -> approved/rejected/added).
create or replace function public.reputation_on_status_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  delta int := 0;
  reason text := null;
begin
  if old.status is not distinct from new.status then
    return new;
  end if;

  -- Only count once: from pending into a terminal moderation state.
  if coalesce(old.status, '') <> 'pending' then
    return new;
  end if;

  if TG_TABLE_NAME = 'song_suggestions' then
    if new.status = 'approved' then
      delta := 10; reason := 'song_suggestion_approved';
    elsif new.status = 'rejected' then
      delta := -3; reason := 'song_suggestion_rejected';
    end if;
  elsif TG_TABLE_NAME = 'song_execution_tip_requests' then
    if new.status = 'approved' then
      delta := 3; reason := 'execution_tip_approved';
    elsif new.status = 'rejected' then
      delta := -1; reason := 'execution_tip_rejected';
    end if;
  elsif TG_TABLE_NAME = 'song_video_lesson_requests' then
    if new.status = 'approved' then
      delta := 4; reason := 'video_lesson_approved';
    elsif new.status = 'rejected' then
      delta := -2; reason := 'video_lesson_rejected';
    end if;
  elsif TG_TABLE_NAME = 'song_requests' then
    -- Song requests are noisier. Reward only when it becomes "added".
    if new.status = 'added' then
      delta := 3; reason := 'song_request_added';
    elsif new.status = 'rejected' then
      delta := -1; reason := 'song_request_rejected';
    end if;
  end if;

  if delta <> 0 then
    perform public.adjust_user_reputation(new.user_id, delta, reason, TG_TABLE_NAME, new.id);
  end if;

  return new;
end;
$$;

drop trigger if exists song_suggestions_reputation_trg on public.song_suggestions;
create trigger song_suggestions_reputation_trg
after update of status on public.song_suggestions
for each row execute function public.reputation_on_status_change();

drop trigger if exists song_execution_tip_requests_reputation_trg on public.song_execution_tip_requests;
create trigger song_execution_tip_requests_reputation_trg
after update of status on public.song_execution_tip_requests
for each row execute function public.reputation_on_status_change();

drop trigger if exists song_video_lesson_requests_reputation_trg on public.song_video_lesson_requests;
create trigger song_video_lesson_requests_reputation_trg
after update of status on public.song_video_lesson_requests
for each row execute function public.reputation_on_status_change();

drop trigger if exists song_requests_reputation_trg on public.song_requests;
create trigger song_requests_reputation_trg
after update of status on public.song_requests
for each row execute function public.reputation_on_status_change();



-- END supabase/migrations/20260213240000_user_reputation.sql


-- ============================================================
-- BEGIN supabase/migrations/20260213241000_reputation_gating_and_autoapprove.sql
-- ============================================================

-- Reputation-based gating: reduce spam reach in public queues and enable partial auto-approval
-- for low-risk contribution types.

-- 1) Harden insert policies: users may only insert as "pending" (status is set by moderation/triggers).
do $$
begin
  -- song_suggestions
  begin
    drop policy if exists "song_suggestions_insert_own" on public.song_suggestions;
  exception when undefined_object then
    null;
  end;
  create policy "song_suggestions_insert_own" on public.song_suggestions
  for insert to authenticated with check (auth.uid() = user_id and status = 'pending');

  -- song_execution_tip_requests
  begin
    drop policy if exists "song_execution_tip_requests_insert_own" on public.song_execution_tip_requests;
  exception when undefined_object then
    null;
  end;
  create policy "song_execution_tip_requests_insert_own" on public.song_execution_tip_requests
  for insert to authenticated with check (auth.uid() = user_id and status = 'pending');

  -- song_video_lesson_requests
  begin
    drop policy if exists "song_video_lesson_requests_insert_own" on public.song_video_lesson_requests;
  exception when undefined_object then
    null;
  end;
  create policy "song_video_lesson_requests_insert_own" on public.song_video_lesson_requests
  for insert to authenticated with check (auth.uid() = user_id and status = 'pending');

  -- song_requests
  begin
    drop policy if exists "song_requests_insert_own" on public.song_requests;
  exception when undefined_object then
    null;
  end;
  create policy "song_requests_insert_own" on public.song_requests
  for insert to authenticated with check (auth.uid() = user_id and status = 'pending');
end $$;

-- 2) Helper: fetch user score (0 when missing).
create or replace function public.get_user_reputation_score(p_user_id uuid)
returns int
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select score from public.user_reputation where user_id = p_user_id), 0);
$$;

-- 3) Gate public queues by reputation (shadowban for very low scores).
-- Thresholds:
-- - score <= -10: do not surface in public queues (still stored for moderation).

create or replace function public.song_suggestions_queue_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  rep int;
begin
  rep := public.get_user_reputation_score(new.user_id);
  if rep <= -10 then
    return new;
  end if;

  if new.status <> 'pending' then
    return new;
  end if;

  insert into public.song_suggestions_queue (
    suggestion_id,
    song_id,
    song_title,
    artist,
    kind,
    excerpt,
    status,
    created_at
  )
  values (
    new.id,
    new.song_id,
    new.song_title,
    new.artist,
    new.kind,
    left(coalesce(new.text, ''), 280),
    new.status,
    coalesce(new.created_at, now())
  )
  on conflict (suggestion_id) do nothing;

  return new;
end;
$$;

create or replace function public.song_suggestions_queue_sync()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  rep int;
begin
  rep := public.get_user_reputation_score(new.user_id);
  if rep <= -10 then
    delete from public.song_suggestions_queue where suggestion_id = new.id;
    return new;
  end if;

  -- Keep queue lightweight: only pending stays in the public queue.
  if new.status = 'pending' then
    insert into public.song_suggestions_queue (
      suggestion_id,
      song_id,
      song_title,
      artist,
      kind,
      excerpt,
      status,
      created_at
    )
    values (
      new.id,
      new.song_id,
      new.song_title,
      new.artist,
      new.kind,
      left(coalesce(new.text, ''), 280),
      new.status,
      coalesce(new.created_at, now())
    )
    on conflict (suggestion_id) do update
      set
        song_title = excluded.song_title,
        artist = excluded.artist,
        kind = excluded.kind,
        excerpt = excluded.excerpt,
        status = excluded.status;
  else
    delete from public.song_suggestions_queue where suggestion_id = new.id;
  end if;

  return new;
end;
$$;

create or replace function public.song_execution_tips_queue_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  rep int;
begin
  rep := public.get_user_reputation_score(new.user_id);
  if rep <= -10 then
    return new;
  end if;

  if new.status <> 'pending' then
    return new;
  end if;

  insert into public.song_execution_tips_queue (tip_id, song_id, kind, excerpt, created_at)
  values (
    new.id,
    new.song_id,
    new.kind,
    left(coalesce(new.text, ''), 280),
    coalesce(new.created_at, now())
  )
  on conflict (tip_id) do nothing;
  return new;
end;
$$;

create or replace function public.song_requests_queue_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  rep int;
begin
  rep := public.get_user_reputation_score(new.user_id);
  if rep <= -10 then
    return new;
  end if;

  insert into public.song_requests_queue (request_id, title, artist, status, created_at)
  values (new.id, new.title, new.artist, new.status, coalesce(new.created_at, now()))
  on conflict (request_id) do nothing;
  return new;
end;
$$;

create or replace function public.song_requests_queue_sync()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  rep int;
begin
  rep := public.get_user_reputation_score(new.user_id);
  if rep <= -10 then
    delete from public.song_requests_queue where request_id = new.id;
    return new;
  end if;

  insert into public.song_requests_queue (request_id, title, artist, status, created_at)
  values (new.id, new.title, new.artist, new.status, coalesce(new.created_at, now()))
  on conflict (request_id) do update
    set title = excluded.title,
        artist = excluded.artist,
        status = excluded.status;
  return new;
end;
$$;

-- 4) Partial auto-approval (low risk): execution tips.
-- Threshold:
-- - score >= 40: auto-approve tips (still can be manually reverted by moderators).

create or replace function public.auto_approve_execution_tip_if_trusted()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  rep int;
begin
  rep := public.get_user_reputation_score(new.user_id);
  if rep >= 40 and new.status = 'pending' then
    update public.song_execution_tip_requests
    set status = 'approved',
        reviewed_at = now()
    where id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists song_execution_tip_autoapprove_trg on public.song_execution_tip_requests;
create trigger song_execution_tip_autoapprove_trg
after insert on public.song_execution_tip_requests
for each row execute function public.auto_approve_execution_tip_if_trusted();



-- END supabase/migrations/20260213241000_reputation_gating_and_autoapprove.sql
