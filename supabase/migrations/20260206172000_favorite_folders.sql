-- Favorite folders (collections) for organizing favorites.
-- Supports: "Pastas dentro de Favoritos" + "Ao salvar, escolher em qual pasta vai".

create table if not exists public.favorite_folders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, name)
);

create index if not exists favorite_folders_user_idx on public.favorite_folders (user_id);

create trigger favorite_folders_set_updated_at
before update on public.favorite_folders
for each row execute function public.set_updated_at();

alter table public.favorite_folders enable row level security;

create policy "favorite_folders_read_own" on public.favorite_folders
for select using (auth.uid() = user_id);

create policy "favorite_folders_insert_own" on public.favorite_folders
for insert with check (auth.uid() = user_id);

create policy "favorite_folders_update_own" on public.favorite_folders
for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "favorite_folders_delete_own" on public.favorite_folders
for delete using (auth.uid() = user_id);

alter table public.favorites
  add column if not exists folder_id uuid references public.favorite_folders(id) on delete set null;

create index if not exists favorites_folder_idx on public.favorites (user_id, folder_id);

-- Optional: allow moving a favorite between folders.
create policy "favorites_update_own" on public.favorites
for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

