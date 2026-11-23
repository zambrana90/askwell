-- create_project: the one owner write with a plan-limit check (project.md §7).
-- Only service_role may execute it. The server passes the owner id from Clerk, the key it
-- generated, PLAN_LIMITS[plan].projects and DEFAULT_WIDGET_CONFIG (the DB has no defaults).
--
-- Race safety: `select ... for update` locks the owner's accounts row, so two concurrent
-- calls for the same owner run one after the other; the second one sees the first's project
-- in its count. Different owners don't block each other.
--
-- Errors (A3 maps them):
--   message 'plan_limit'         SQLSTATE 'P0001'  -> 403 plan_limit
--   message 'account_not_found'  SQLSTATE 'P0002'  -> the account row is missing
create function public.create_project(
  p_owner_id text,
  p_name text,
  p_public_key text,
  p_max_projects int,
  p_button_color text,
  p_position text,
  p_label text,
  p_animation text,
  p_header_text text,
  p_show_badge boolean
)
returns public.projects
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_project public.projects;
begin
  perform 1 from public.accounts where clerk_user_id = p_owner_id for update;
  if not found then
    raise exception 'account_not_found' using errcode = 'P0002';
  end if;

  if (select count(*) from public.projects where owner_id = p_owner_id) >= p_max_projects then
    raise exception 'plan_limit' using errcode = 'P0001';
  end if;

  insert into public.projects (owner_id, name, public_key)
  values (p_owner_id, p_name, p_public_key)
  returning * into v_project;

  insert into public.widget_configs
    (project_id, button_color, position, label, animation, header_text, show_badge)
  values
    (v_project.id, p_button_color, p_position, p_label, p_animation, p_header_text, p_show_badge);

  return v_project;
end;
$$;

revoke execute on function public.create_project(
  text, text, text, int, text, text, text, text, text, boolean
) from public, anon, authenticated;
grant execute on function public.create_project(
  text, text, text, int, text, text, text, text, text, boolean
) to service_role;
