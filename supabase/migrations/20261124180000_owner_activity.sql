-- owner_activity: the Conversations list (project.md §6.7). Per conversation of one project,
-- a preview of the first visitor message ('' if there is none) and the message count, newest first, at most 100.
-- It exists so PostgREST aggregates can stay off (§9).
-- SECURITY INVOKER: it runs as the caller, so RLS scopes it. Another owner's project returns
-- zero rows. No new tables or columns.
create function public.owner_activity(p_project_id uuid)
returns table (id uuid, visitor_id text, created_at timestamptz, preview text, message_count int)
language sql
stable
security invoker
set search_path = ''
as $$
  select c.id,
         c.visitor_id,
         c.created_at,
         coalesce(
           (select left(m.body, 120)
              from public.messages m
             where m.conversation_id = c.id and m.role = 'visitor'
             order by m.created_at, m.id
             limit 1),
           ''
         ) as preview,
         (select count(*)::int
            from public.messages m
           where m.conversation_id = c.id) as message_count
  from public.conversations c
  where c.project_id = p_project_id
  order by c.created_at desc, c.id desc
  limit 100;
$$;

revoke execute on function public.owner_activity(uuid) from public, anon, authenticated;
grant execute on function public.owner_activity(uuid) to authenticated, service_role;
