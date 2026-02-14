-- Community-publishable templates for worship setlists and song selections.
-- MVP: store template payload as JSON, allow public discovery, allow "remix" tracking.

create table if not exists public.setlist_templates (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null default 'setlist' check (kind in ('setlist', 'selection')),
  title text not null,
  description text null,
  tags text[] null,
  payload jsonb not null, -- { songs: [...], team?: [...] }
  parent_template_id uuid null references public.setlist_templates(id) on delete set null,
  remix_count int not null default 0,
  is_public boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists setlist_templates_public_idx
on public.setlist_templates (kind, is_public, remix_count desc, created_at desc);

create index if not exists setlist_templates_owner_idx
on public.setlist_templates (owner_user_id, created_at desc);

create trigger setlist_templates_set_updated_at
before update on public.setlist_templates
for each row execute function public.set_updated_at();

alter table public.setlist_templates enable row level security;

-- Public read for public templates; owner can read their own even if private.
create policy "setlist_templates_read" on public.setlist_templates
for select to anon, authenticated
using (is_public = true or auth.uid() = owner_user_id);

create policy "setlist_templates_insert_own" on public.setlist_templates
for insert to authenticated
with check (auth.uid() = owner_user_id);

create policy "setlist_templates_update_own" on public.setlist_templates
for update to authenticated
using (auth.uid() = owner_user_id)
with check (auth.uid() = owner_user_id);

create policy "setlist_templates_delete_own" on public.setlist_templates
for delete to authenticated
using (auth.uid() = owner_user_id);

create table if not exists public.setlist_template_remixes (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.setlist_templates(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists setlist_template_remixes_template_idx on public.setlist_template_remixes (template_id, created_at desc);
create index if not exists setlist_template_remixes_user_idx on public.setlist_template_remixes (user_id, created_at desc);

alter table public.setlist_template_remixes enable row level security;

-- Users can read their own remix history (optional).
create policy "setlist_template_remixes_read_own" on public.setlist_template_remixes
for select to authenticated using (auth.uid() = user_id);

create policy "setlist_template_remixes_insert_own" on public.setlist_template_remixes
for insert to authenticated with check (auth.uid() = user_id);

create or replace function public.recompute_setlist_template_remix_count(p_template_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  cnt int;
begin
  select count(*)::int into cnt
  from public.setlist_template_remixes
  where template_id = p_template_id;

  update public.setlist_templates
  set remix_count = coalesce(cnt, 0)
  where id = p_template_id;
end;
$$;

create or replace function public.setlist_template_remixes_after_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  tid uuid;
begin
  tid := coalesce(new.template_id, old.template_id);
  perform public.recompute_setlist_template_remix_count(tid);
  return coalesce(new, old);
end;
$$;

drop trigger if exists setlist_template_remixes_after_insert_trg on public.setlist_template_remixes;
create trigger setlist_template_remixes_after_insert_trg
after insert on public.setlist_template_remixes
for each row execute function public.setlist_template_remixes_after_change();

drop trigger if exists setlist_template_remixes_after_delete_trg on public.setlist_template_remixes;
create trigger setlist_template_remixes_after_delete_trg
after delete on public.setlist_template_remixes
for each row execute function public.setlist_template_remixes_after_change();

create or replace function public.record_setlist_template_remix(p_template_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid;
begin
  uid := auth.uid();
  if uid is null then
    raise exception 'not_authenticated';
  end if;

  insert into public.setlist_template_remixes (template_id, user_id)
  values (p_template_id, uid);
end;
$$;

