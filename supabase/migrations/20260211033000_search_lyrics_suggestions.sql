create extension if not exists pg_trgm;

create or replace function public.fold_text(input text)
returns text
language sql
immutable
parallel safe
as $$
  select trim(
    regexp_replace(
      translate(
        lower(coalesce(input, '')),
        'áàãâäéèêëíìîïóòõôöúùûüçñ',
        'aaaaaeeeeiiiiooooouuuucn'
      ),
      '\s+',
      ' ',
      'g'
    )
  );
$$;

drop index if exists public.songs_lyrics_search_idx;

create index songs_lyrics_search_idx
on public.songs
using gin (
  to_tsvector('simple', public.fold_text(coalesce(lyrics_chords, '')))
);

create or replace function public.search_songs(search_query text, limit_count int default 80)
returns table (
  id uuid,
  title text,
  title_search text,
  artist_id uuid,
  category text,
  views int,
  original_key text,
  tuning text,
  capo int,
  artist_name text,
  score double precision
)
language sql
stable
set search_path = public, extensions
as $$
  with input as (
    select public.fold_text(search_query) as q
  ),
  query_terms as (
    select
      q,
      case
        when q = '' then null::tsquery
        else plainto_tsquery('simple', q)
      end as lyric_query
    from input
  ),
  tokens as (
    select token
    from query_terms,
    lateral regexp_split_to_table(q, '\s+') as token
    where length(token) >= 2
  ),
  token_stats as (
    select count(*)::int as total from tokens
  ),
  candidates as (
    select
      s.id,
      s.title,
      s.title_search,
      s.artist_id,
      s.category,
      s.views,
      s.original_key,
      s.tuning,
      s.capo,
      a.name as artist_name,
      coalesce(a.name_search, '') as artist_search,
      (
        select count(*)
        from tokens t
        where s.title_search like '%' || t.token || '%'
          or coalesce(a.name_search, '') like '%' || t.token || '%'
      )::int as token_hits,
      case
        when qt.lyric_query is not null
             and to_tsvector('simple', public.fold_text(coalesce(s.lyrics_chords, ''))) @@ qt.lyric_query
        then ts_rank_cd(
          to_tsvector('simple', public.fold_text(coalesce(s.lyrics_chords, ''))),
          qt.lyric_query
        )
        else 0
      end as lyrics_rank
    from songs s
    left join artists a on a.id = s.artist_id
    cross join query_terms qt
    where qt.q <> ''
      and (
        s.title_search like '%' || qt.q || '%'
        or coalesce(a.name_search, '') like '%' || qt.q || '%'
        or similarity(s.title_search, qt.q) > 0.22
        or similarity(coalesce(a.name_search, ''), qt.q) > 0.22
        or (
          qt.lyric_query is not null
          and to_tsvector('simple', public.fold_text(coalesce(s.lyrics_chords, ''))) @@ qt.lyric_query
        )
        or exists (
          select 1
          from tokens t
          where s.title_search like '%' || t.token || '%'
            or coalesce(a.name_search, '') like '%' || t.token || '%'
        )
      )
  ),
  scored as (
    select
      c.id,
      c.title,
      c.title_search,
      c.artist_id,
      c.category,
      c.views,
      c.original_key,
      c.tuning,
      c.capo,
      c.artist_name,
      (
        case
          when c.title_search = qt.q then 1500
          when c.title_search like qt.q || '%' then 900
          when c.title_search like '%' || qt.q || '%' then 650
          else 0
        end
        +
        case
          when c.artist_search = qt.q then 700
          when c.artist_search like qt.q || '%' then 420
          when c.artist_search like '%' || qt.q || '%' then 220
          else 0
        end
        +
        (coalesce(c.token_hits, 0) * 95)
        +
        case
          when ts.total > 0 and c.token_hits = ts.total then 260
          when ts.total > 0 then (c.token_hits::double precision / ts.total::double precision) * 120
          else 0
        end
        +
        greatest(similarity(c.title_search, qt.q), similarity(c.artist_search, qt.q)) * 240
        +
        (c.lyrics_rank * 420)
        +
        ln(greatest(coalesce(c.views, 0), 0) + 1) * 10
      )::double precision as score
    from candidates c
    cross join query_terms qt
    cross join token_stats ts
  )
  select
    id,
    title,
    title_search,
    artist_id,
    category,
    views,
    original_key,
    tuning,
    capo,
    artist_name,
    score
  from scored
  where score > 0
  order by score desc, views desc nulls last, title asc
  limit least(greatest(coalesce(limit_count, 80), 1), 200);
$$;

create or replace function public.search_suggestions(search_query text, limit_count int default 8)
returns table (
  kind text,
  label text,
  value text,
  score double precision
)
language sql
stable
set search_path = public, extensions
as $$
  with input as (
    select public.fold_text(search_query) as q
  ),
  song_suggestions as (
    select
      'song'::text as kind,
      case when a.name is null then s.title else s.title || ' - ' || a.name end as label,
      s.title as value,
      (
        case
          when s.title_search = i.q then 1200
          when s.title_search like i.q || '%' then 900
          when s.title_search like '%' || i.q || '%' then 600
          else 0
        end
        + greatest(similarity(s.title_search, i.q), 0) * 220
        + ln(greatest(coalesce(s.views, 0), 0) + 1) * 8
      )::double precision as score
    from songs s
    left join artists a on a.id = s.artist_id
    cross join input i
    where i.q <> ''
      and (
        s.title_search like '%' || i.q || '%'
        or similarity(s.title_search, i.q) > 0.24
      )
  ),
  artist_suggestions as (
    select
      'artist'::text as kind,
      a.name as label,
      a.name as value,
      (
        case
          when a.name_search = i.q then 1100
          when a.name_search like i.q || '%' then 860
          when a.name_search like '%' || i.q || '%' then 560
          else 0
        end
        + greatest(similarity(a.name_search, i.q), 0) * 220
      )::double precision as score
    from artists a
    cross join input i
    where i.q <> ''
      and (
        a.name_search like '%' || i.q || '%'
        or similarity(a.name_search, i.q) > 0.24
      )
  ),
  combined as (
    select * from song_suggestions
    union all
    select * from artist_suggestions
  )
  select
    kind,
    label,
    value,
    score
  from (
    select
      c.*,
      row_number() over (partition by c.value order by c.score desc) as dedup_rank
    from combined c
  ) ranked
  where dedup_rank = 1
  order by score desc, label asc
  limit least(greatest(coalesce(limit_count, 8), 1), 20);
$$;

grant execute on function public.search_songs(text, int) to anon, authenticated;
grant execute on function public.search_suggestions(text, int) to anon, authenticated;
