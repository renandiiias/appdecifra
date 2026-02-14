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

