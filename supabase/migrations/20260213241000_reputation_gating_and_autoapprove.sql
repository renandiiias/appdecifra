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

