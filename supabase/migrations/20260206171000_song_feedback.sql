-- Song suggestions + claims (first-class tables, RLS-protected).
-- These power "Sugerir alteração" and "Receba créditos por esta música" in the app.

create table if not exists public.song_suggestions (
  id uuid primary key default gen_random_uuid(),
  song_id uuid not null references public.songs(id) on delete cascade,
  song_title text not null,
  artist text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('letra', 'cifra')),
  text text not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  reviewed_at timestamptz null,
  reviewed_by uuid null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists song_suggestions_song_idx on public.song_suggestions (song_id);
create index if not exists song_suggestions_user_idx on public.song_suggestions (user_id);
create index if not exists song_suggestions_status_idx on public.song_suggestions (status);

create trigger song_suggestions_set_updated_at
before update on public.song_suggestions
for each row execute function public.set_updated_at();

alter table public.song_suggestions enable row level security;

create policy "song_suggestions_read_own" on public.song_suggestions
for select using (auth.uid() = user_id);

create policy "song_suggestions_insert_own" on public.song_suggestions
for insert with check (auth.uid() = user_id);

create policy "song_suggestions_delete_own" on public.song_suggestions
for delete using (auth.uid() = user_id);

-- No public update policy on purpose (moderation via service role).

create table if not exists public.song_claim_requests (
  id uuid primary key default gen_random_uuid(),
  song_id uuid not null references public.songs(id) on delete cascade,
  song_title text not null,
  artist text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  email text not null,
  whatsapp text null,
  instagram text null,
  message text not null,
  extra text null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  reviewed_at timestamptz null,
  reviewed_by uuid null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists song_claim_requests_song_idx on public.song_claim_requests (song_id);
create index if not exists song_claim_requests_user_idx on public.song_claim_requests (user_id);
create index if not exists song_claim_requests_status_idx on public.song_claim_requests (status);

create trigger song_claim_requests_set_updated_at
before update on public.song_claim_requests
for each row execute function public.set_updated_at();

alter table public.song_claim_requests enable row level security;

create policy "song_claim_requests_read_own" on public.song_claim_requests
for select using (auth.uid() = user_id);

create policy "song_claim_requests_insert_own" on public.song_claim_requests
for insert with check (auth.uid() = user_id);

create policy "song_claim_requests_delete_own" on public.song_claim_requests
for delete using (auth.uid() = user_id);

-- No public update policy on purpose (moderation via service role).

