create extension if not exists pg_trgm;

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
set search_path = public
as $$
  with input as (
    select trim(regexp_replace(lower(coalesce(search_query, '')), '\s+', ' ', 'g')) as q
  ),
  tokens as (
    select token
    from input,
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
      )::int as token_hits
    from songs s
    left join artists a on a.id = s.artist_id
    cross join input i
    where i.q <> ''
      and (
        s.title_search like '%' || i.q || '%'
        or coalesce(a.name_search, '') like '%' || i.q || '%'
        or similarity(s.title_search, i.q) > 0.22
        or similarity(coalesce(a.name_search, ''), i.q) > 0.22
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
          when c.title_search = i.q then 1500
          when c.title_search like i.q || '%' then 900
          when c.title_search like '%' || i.q || '%' then 650
          else 0
        end
        +
        case
          when c.artist_search = i.q then 700
          when c.artist_search like i.q || '%' then 420
          when c.artist_search like '%' || i.q || '%' then 220
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
        greatest(similarity(c.title_search, i.q), similarity(c.artist_search, i.q)) * 240
        +
        ln(greatest(coalesce(c.views, 0), 0) + 1) * 10
      )::double precision as score
    from candidates c
    cross join input i
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

grant execute on function public.search_songs(text, int) to anon, authenticated;
