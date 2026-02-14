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

