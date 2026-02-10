-- Song video lesson requests (RLS-protected).
-- Users can volunteer a YouTube video lesson for a song; moderation/approval happens server-side.

create table if not exists public.song_video_lesson_requests (
  id uuid primary key default gen_random_uuid(),
  song_id uuid not null references public.songs(id) on delete cascade,
  song_title text not null,
  artist text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  email text not null,
  whatsapp text null,
  youtube_url text not null,
  message text null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  reviewed_at timestamptz null,
  reviewed_by uuid null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (song_id, user_id)
);

create index if not exists song_video_lesson_requests_song_idx on public.song_video_lesson_requests (song_id);
create index if not exists song_video_lesson_requests_user_idx on public.song_video_lesson_requests (user_id);
create index if not exists song_video_lesson_requests_status_idx on public.song_video_lesson_requests (status);

create trigger song_video_lesson_requests_set_updated_at
before update on public.song_video_lesson_requests
for each row execute function public.set_updated_at();

alter table public.song_video_lesson_requests enable row level security;

create policy "song_video_lesson_requests_read_own" on public.song_video_lesson_requests
for select using (auth.uid() = user_id);

create policy "song_video_lesson_requests_insert_own" on public.song_video_lesson_requests
for insert with check (auth.uid() = user_id);

create policy "song_video_lesson_requests_delete_own" on public.song_video_lesson_requests
for delete using (auth.uid() = user_id);

-- No public update policy on purpose (moderation via service role).

