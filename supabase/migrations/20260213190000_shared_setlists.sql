-- Public shareable worship setlists ("escalas/repertórios") stored as JSON payload.
-- Goal:
-- - Owner generates a public link/QR for a setlist.
-- - Anyone can view the setlist (anon/auth) when public.
-- - Logged-in users can import into their local setlists.

create table if not exists public.shared_setlists (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  scheduled_at text not null,
  church_name text null,
  payload jsonb not null, -- { songs: [{id,title,artist?}], team: [{name,instrument}] }
  is_public boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists shared_setlists_public_idx on public.shared_setlists (is_public, created_at desc);
create index if not exists shared_setlists_owner_idx on public.shared_setlists (owner_user_id, created_at desc);

create trigger shared_setlists_set_updated_at
before update on public.shared_setlists
for each row execute function public.set_updated_at();

alter table public.shared_setlists enable row level security;

-- Public can read public setlists; owners can read their own even if private.
create policy "shared_setlists_read" on public.shared_setlists
for select to anon, authenticated
using (is_public = true or auth.uid() = owner_user_id);

create policy "shared_setlists_insert_own" on public.shared_setlists
for insert to authenticated
with check (auth.uid() = owner_user_id);

create policy "shared_setlists_update_own" on public.shared_setlists
for update to authenticated
using (auth.uid() = owner_user_id)
with check (auth.uid() = owner_user_id);

create policy "shared_setlists_delete_own" on public.shared_setlists
for delete to authenticated
using (auth.uid() = owner_user_id);

