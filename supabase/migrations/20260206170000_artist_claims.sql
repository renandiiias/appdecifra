-- Artist claims + verification scaffolding.
-- This supports the "Sou artista" flow (users can request to claim an artist/ministry).

alter table public.artists
  add column if not exists claimed_user_id uuid references auth.users(id) on delete set null,
  add column if not exists claimed_at timestamptz,
  add column if not exists verified_at timestamptz;

create index if not exists artists_claimed_user_idx on public.artists (claimed_user_id);

create table if not exists public.artist_claim_requests (
  id uuid primary key default gen_random_uuid(),
  artist_id uuid not null references public.artists(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  email text not null,
  whatsapp text null,
  instagram text null,
  message text not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  reviewed_at timestamptz null,
  reviewed_by uuid null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (artist_id, user_id)
);

create index if not exists artist_claim_requests_user_idx on public.artist_claim_requests (user_id);
create index if not exists artist_claim_requests_artist_idx on public.artist_claim_requests (artist_id);
create index if not exists artist_claim_requests_status_idx on public.artist_claim_requests (status);

create trigger artist_claim_requests_set_updated_at
before update on public.artist_claim_requests
for each row execute function public.set_updated_at();

alter table public.artist_claim_requests enable row level security;

-- Users can see and manage only their own requests.
create policy "artist_claim_requests_read_own" on public.artist_claim_requests
for select using (auth.uid() = user_id);

create policy "artist_claim_requests_insert_own" on public.artist_claim_requests
for insert with check (auth.uid() = user_id);

create policy "artist_claim_requests_delete_own" on public.artist_claim_requests
for delete using (auth.uid() = user_id);

-- No public update policy on purpose (approval/rejection should be done by service role only).

