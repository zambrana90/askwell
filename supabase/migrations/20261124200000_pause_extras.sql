-- Pause extras after a downgrade (project.md §5): nothing is deleted. Only the owner's oldest
-- projects up to the plan's limit stay active, and in each project only the oldest sources up to
-- the plan's source limit are used for answers. "Oldest" = created_at, then id.
-- Upgrading again (or deleting extras) reactivates the rest. No new tables or columns, and
-- match_chunks stays as it is (additive rule). Every function is SECURITY INVOKER with an empty
-- search_path, and only service_role may run it (§9).

-- ---------------------------------------------------------------------------
-- project_is_active: true if the project is among its owner's oldest p_max_projects projects.
-- An unknown project, or a limit below 1, is never active.
-- ---------------------------------------------------------------------------
create function public.project_is_active(p_project_id uuid, p_max_projects int)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select exists (
    select 1
    from (
      select p.id
      from public.projects p
      where p.owner_id = (select o.owner_id from public.projects o where o.id = p_project_id)
      order by p.created_at, p.id
      limit greatest(p_max_projects, 0)
    ) oldest
    where oldest.id = p_project_id
  );
$$;

-- ---------------------------------------------------------------------------
-- match_chunks_active: match_chunks, but only chunks of the project's oldest p_max_sources
-- sources. Sources of every status count when ranking (like reserve_knowledge_source), and
-- only `ready` ones are searched. Same output, order and hnsw.iterative_scan rule as match_chunks.
-- ---------------------------------------------------------------------------
select '[1]'::extensions.vector; -- loads pgvector's library so hnsw.* can be set below
create function public.match_chunks_active(
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
set hnsw.iterative_scan = 'strict_order'
as $$
  with kept as (
    select s.id
    from public.knowledge_sources s
    where s.project_id = p_project_id
    order by s.created_at, s.id
    limit greatest(p_max_sources, 0)
  )
  select c.id, c.source_id, c.content,
         (1 - (c.embedding operator(extensions.<=>) p_embedding))::float as similarity
  from public.knowledge_chunks c
  join public.knowledge_sources s on s.id = c.source_id and s.project_id = c.project_id
  where c.project_id = p_project_id
    and s.status = 'ready'
    and c.source_id in (select k.id from kept k)
  order by c.embedding operator(extensions.<=>) p_embedding
  limit p_match_count;
$$;

revoke execute on function public.project_is_active(uuid, int) from public, anon, authenticated;
revoke execute on function public.match_chunks_active(uuid, extensions.vector, int, int) from public, anon, authenticated;
grant execute on function public.project_is_active(uuid, int) to service_role;
grant execute on function public.match_chunks_active(uuid, extensions.vector, int, int) to service_role;
