-- Verified artist profile: official links + highlight + badge support.
-- Claim/verification status already exists via artists.verified_at and claimed_user_id.

alter table public.artists
  add column if not exists profile_highlight text null,
  add column if not exists official_links jsonb null;

-- Optional indexes for filtering / sorting verified artists.
create index if not exists artists_verified_at_idx on public.artists (verified_at desc);

