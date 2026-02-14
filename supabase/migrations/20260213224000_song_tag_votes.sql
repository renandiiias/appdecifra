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

