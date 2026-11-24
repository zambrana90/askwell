-- Phase 3 schema: the private `knowledge` bucket and the functions the knowledge and chat
-- routes need (project.md §6.4, §6.6, §7, §9). No new tables or columns.
-- Every function is SECURITY INVOKER with an empty search_path, and only service_role may run it.

-- ---------------------------------------------------------------------------
-- Storage: private bucket, 10 MB, PDF / Markdown / TXT.
-- Only the server uses it, with the service role key, which bypasses Storage's RLS
-- (Supabase docs: "Storage Access Control", "Bypassing access controls"). So there are no
-- storage.objects policies: anon and authenticated can neither read nor write it.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'knowledge', 'knowledge', false, 10485760,
  array['application/pdf', 'text/markdown', 'text/plain']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- ---------------------------------------------------------------------------
-- reserve_knowledge_source: count + insert under a lock on the project row, so two
-- concurrent uploads can't both slip past the limit. Counts sources of every status.
--   'plan_limit'         SQLSTATE 'P0001' -> 403 plan_limit
--   'project_not_found'  SQLSTATE 'P0002'
-- The storage key is built here, never taken from the client.
-- ---------------------------------------------------------------------------
create function public.reserve_knowledge_source(
  p_project_id uuid,
  p_title text,
  p_type text,
  p_max_sources int
)
returns public.knowledge_sources
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id uuid := gen_random_uuid();
  v_source public.knowledge_sources;
begin
  perform 1 from public.projects where id = p_project_id for update;
  if not found then
    raise exception 'project_not_found' using errcode = 'P0002';
  end if;

  if (select count(*) from public.knowledge_sources where project_id = p_project_id) >= p_max_sources then
    raise exception 'plan_limit' using errcode = 'P0001';
  end if;

  if p_type = 'text' then
    insert into public.knowledge_sources (id, project_id, title, type, storage_key, status)
    values (v_id, p_project_id, p_title, p_type, null, 'processing')
    returning * into v_source;
  else
    insert into public.knowledge_sources (id, project_id, title, type, storage_key, status)
    values (v_id, p_project_id, p_title, p_type,
            p_project_id::text || '/' || v_id::text || '.' || p_type, 'uploading')
    returning * into v_source;
  end if;

  return v_source;
end;
$$;

-- ---------------------------------------------------------------------------
-- consume_message: one atomic UPDATE. A new UTC month resets the counter to 1;
-- otherwise it increments only below the limit. true = counted, false = quota hit.
-- ---------------------------------------------------------------------------
create function public.consume_message(p_project_id uuid, p_limit int)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_month timestamptz := date_trunc('month', now() at time zone 'utc') at time zone 'utc';
begin
  update public.projects
  set messages_used = case when period_start < v_month then 1 else messages_used + 1 end,
      period_start = greatest(period_start, v_month)
  where id = p_project_id
    and ((period_start < v_month and p_limit >= 1) or (period_start >= v_month and messages_used < p_limit));
  return found;
end;
$$;

-- ---------------------------------------------------------------------------
-- save_chat_turn: null conversation id creates one; a given id must belong to this
-- project AND this visitor ('not_found', SQLSTATE 'P0002'). The bot message is stamped
-- strictly after the visitor message so ordering by created_at is stable.
-- ---------------------------------------------------------------------------
create function public.save_chat_turn(
  p_project_id uuid,
  p_conversation_id uuid,
  p_visitor_id text,
  p_visitor_body text,
  p_bot_body text
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_conversation_id uuid;
  v_visitor_at timestamptz := clock_timestamp();
begin
  if p_conversation_id is null then
    insert into public.conversations (project_id, visitor_id)
    values (p_project_id, p_visitor_id)
    returning id into v_conversation_id;
  else
    select id into v_conversation_id
    from public.conversations
    where id = p_conversation_id and project_id = p_project_id and visitor_id = p_visitor_id;
    if v_conversation_id is null then
      raise exception 'not_found' using errcode = 'P0002';
    end if;
  end if;

  insert into public.messages (conversation_id, role, body, created_at)
  values (v_conversation_id, 'visitor', p_visitor_body, v_visitor_at);
  insert into public.messages (conversation_id, role, body, created_at)
  values (v_conversation_id, 'bot', p_bot_body, v_visitor_at + interval '1 millisecond');

  return v_conversation_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- match_chunks: nearest chunks by cosine distance, this project's `ready` sources only.
-- similarity = 1 - cosine distance.
-- hnsw.iterative_scan = strict_order: the HNSW index is shared by all projects, so a plain
-- scan returns only the ef_search (40) nearest chunks overall, and a big project's chunks can
-- push a small project's out before the project filter runs. Iterative scan keeps reading the
-- index until enough rows of this project are found, still in exact distance order.
-- ---------------------------------------------------------------------------
select '[1]'::extensions.vector; -- loads pgvector's library so hnsw.* can be set below
create function public.match_chunks(
  p_project_id uuid,
  p_embedding extensions.vector(1536),
  p_match_count int
)
returns table (id uuid, source_id uuid, content text, similarity float)
language sql
stable
security invoker
set search_path = ''
set hnsw.iterative_scan = 'strict_order'
as $$
  select c.id, c.source_id, c.content,
         (1 - (c.embedding operator(extensions.<=>) p_embedding))::float as similarity
  from public.knowledge_chunks c
  join public.knowledge_sources s on s.id = c.source_id and s.project_id = c.project_id
  where c.project_id = p_project_id
    and s.status = 'ready'
  order by c.embedding operator(extensions.<=>) p_embedding
  limit p_match_count;
$$;

-- ---------------------------------------------------------------------------
-- Grants: service_role only (§9).
-- ---------------------------------------------------------------------------
revoke execute on function public.reserve_knowledge_source(uuid, text, text, int) from public, anon, authenticated;
revoke execute on function public.consume_message(uuid, int) from public, anon, authenticated;
revoke execute on function public.save_chat_turn(uuid, uuid, text, text, text) from public, anon, authenticated;
revoke execute on function public.match_chunks(uuid, extensions.vector, int) from public, anon, authenticated;
grant execute on function public.reserve_knowledge_source(uuid, text, text, int) to service_role;
grant execute on function public.consume_message(uuid, int) to service_role;
grant execute on function public.save_chat_turn(uuid, uuid, text, text, text) to service_role;
grant execute on function public.match_chunks(uuid, extensions.vector, int) to service_role;
