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

