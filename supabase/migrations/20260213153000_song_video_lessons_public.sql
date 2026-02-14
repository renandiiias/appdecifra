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

