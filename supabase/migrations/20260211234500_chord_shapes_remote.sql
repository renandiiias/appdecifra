-- Remote chord dictionary to avoid shipping a large local JSON in mobile bundle.
create table if not exists public.chord_shapes (
  id uuid primary key default gen_random_uuid(),
  instrument text not null check (instrument in ('guitar', 'ukulele')),
  chord_name text not null,
  normalized_name text not null,
  positions smallint[] not null,
  fingers smallint[] null,
  base_fret smallint null,
  source text not null default 'dataset',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (instrument, normalized_name)
);

create index if not exists chord_shapes_instrument_idx on public.chord_shapes (instrument);
create index if not exists chord_shapes_normalized_name_idx on public.chord_shapes (normalized_name);

drop trigger if exists chord_shapes_set_updated_at on public.chord_shapes;
create trigger chord_shapes_set_updated_at
before update on public.chord_shapes
for each row execute function public.set_updated_at();

alter table public.chord_shapes enable row level security;

drop policy if exists "chord_shapes_read" on public.chord_shapes;
create policy "chord_shapes_read" on public.chord_shapes
for select using (true);
