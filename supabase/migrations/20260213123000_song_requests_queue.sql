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

