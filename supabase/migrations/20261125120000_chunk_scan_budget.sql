-- Chunk search no longer depends on the shared HNSW index (follow-up to the §9 audit).
-- With hnsw.iterative_scan, pgvector stops after hnsw.max_scan_tuples (default 20,000), so a
-- query planned on that index could miss a small project's chunks once the index is large.
-- Both functions now read the project's chunks through the project/source btree indexes into a
-- MATERIALIZED CTE and sort them by exact distance: the HNSW index cannot serve that order, so
-- there is no scan limit. Cost grows with one project's chunk count, not with the table.
-- exact by design; revisit HNSW if a project passes ~50k chunks
-- Only ids and distances are materialized; content is read for the returned rows only.
--
-- Additive: same signatures, return types, volatility, SECURITY INVOKER, empty search_path.
-- `create or replace` keeps the owner and grants (service_role only). The now unused
-- hnsw.iterative_scan setting goes away. The HNSW index itself stays.

create or replace function public.match_chunks(
  p_project_id uuid,
  p_embedding extensions.vector(1536),
  p_match_count int
)
returns table (id uuid, source_id uuid, content text, similarity float)
language sql
stable
security invoker
set search_path = ''
as $$
  with candidates as materialized (
    select c.id, c.embedding operator(extensions.<=>) p_embedding as distance
    from public.knowledge_chunks c
    join public.knowledge_sources s on s.id = c.source_id and s.project_id = c.project_id
    where c.project_id = p_project_id
      and s.status = 'ready'
  ),
  nearest as (
    select k.id, k.distance
    from candidates k
    order by k.distance
    limit p_match_count
  )
  select c.id, c.source_id, c.content, (1 - n.distance)::float as similarity
  from nearest n
  join public.knowledge_chunks c on c.id = n.id
  order by n.distance;
$$;

create or replace function public.match_chunks_active(
  p_project_id uuid,
  p_embedding extensions.vector(1536),
  p_match_count int,
  p_max_sources int
)
returns table (id uuid, source_id uuid, content text, similarity float)
language sql
stable
security invoker
set search_path = ''
as $$
  with kept as (
    select s.id
    from public.knowledge_sources s
    where s.project_id = p_project_id
    order by s.created_at, s.id
    limit greatest(p_max_sources, 0)
  ),
  candidates as materialized (
    select c.id, c.embedding operator(extensions.<=>) p_embedding as distance
    from public.knowledge_chunks c
    join public.knowledge_sources s on s.id = c.source_id and s.project_id = c.project_id
    where c.project_id = p_project_id
      and s.status = 'ready'
      and c.source_id in (select k.id from kept k)
  ),
  nearest as (
    select k.id, k.distance
    from candidates k
    order by k.distance
    limit p_match_count
  )
  select c.id, c.source_id, c.content, (1 - n.distance)::float as similarity
  from nearest n
  join public.knowledge_chunks c on c.id = n.id
  order by n.distance;
$$;
