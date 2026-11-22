-- Askwell init: tables, pgvector, RLS, grants and the RLS helper functions.
-- The Data API is public, so RLS + grants are the security boundary (project.md §7, §9).

create extension if not exists vector with schema extensions;

-- ---------------------------------------------------------------------------
-- Default privileges: future tables/functions are NOT auto-granted to API roles.
-- ---------------------------------------------------------------------------
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
alter default privileges in schema public revoke all on functions from anon, authenticated;
-- Postgres grants EXECUTE on new functions to PUBLIC by default; turn that off.
alter default privileges revoke execute on functions from public;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
create table public.accounts (
  clerk_user_id text primary key,
  plan text not null default 'free' check (plan in ('free', 'pro')),
  created_at timestamptz not null default now()
);

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  owner_id text not null references public.accounts (clerk_user_id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  public_key text not null unique,
  messages_used int not null default 0,
  period_start timestamptz not null
    default (date_trunc('month', now() at time zone 'utc') at time zone 'utc'),
  created_at timestamptz not null default now()
);
create index projects_owner_id_idx on public.projects (owner_id);

-- No DB defaults: values come from DEFAULT_WIDGET_CONFIG (packages/shared) at project creation.
create table public.widget_configs (
  project_id uuid primary key references public.projects (id) on delete cascade,
  button_color text not null,
  position text not null
    check (position in ('bottom-right', 'bottom-left', 'top-right', 'top-left')),
  label text not null,
  animation text not null check (animation in ('fade', 'slide', 'scale')),
  header_text text not null,
  show_badge boolean not null
);

create table public.knowledge_sources (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  title text not null,
  type text not null check (type in ('text', 'pdf', 'md', 'txt')),
  storage_key text,
  status text not null check (status in ('uploading', 'processing', 'ready', 'failed')),
  created_at timestamptz not null default now(),
  -- Lets knowledge_chunks reference (id, project_id), so a chunk can't point at another project's source.
  unique (id, project_id)
);
create index knowledge_sources_project_id_idx on public.knowledge_sources (project_id);

create table public.knowledge_chunks (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  source_id uuid not null,
  content text not null,
  embedding extensions.vector(1536) not null,
  -- The chunk's project must be the source's project.
  foreign key (source_id, project_id)
    references public.knowledge_sources (id, project_id) on delete cascade
);
create index knowledge_chunks_project_id_idx on public.knowledge_chunks (project_id);
create index knowledge_chunks_source_id_idx on public.knowledge_chunks (source_id);
create index knowledge_chunks_embedding_idx
  on public.knowledge_chunks using hnsw (embedding extensions.vector_cosine_ops);

create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  visitor_id text not null,
  created_at timestamptz not null default now()
);
create index conversations_project_id_idx on public.conversations (project_id);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  role text not null check (role in ('visitor', 'bot')),
  body text not null,
  created_at timestamptz not null default now()
);
create index messages_conversation_id_idx on public.messages (conversation_id);

-- ---------------------------------------------------------------------------
-- RLS helpers (the only functions that run with their owner's rights).
-- They read the caller's Clerk user id from the JWT and return only that owner's ids.
-- ---------------------------------------------------------------------------
create function public.owned_project_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select p.id
  from public.projects p
  where p.owner_id = (select auth.jwt() ->> 'sub');
$$;

create function public.owned_conversation_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select c.id
  from public.conversations c
  join public.projects p on p.id = c.project_id
  where p.owner_id = (select auth.jwt() ->> 'sub');
$$;

revoke execute on function public.owned_project_ids() from public, anon;
revoke execute on function public.owned_conversation_ids() from public, anon;
grant execute on function public.owned_project_ids() to authenticated;
grant execute on function public.owned_conversation_ids() to authenticated;

-- ---------------------------------------------------------------------------
-- RLS: enabled everywhere. Policies for `authenticated` only; nothing for `anon`.
-- ---------------------------------------------------------------------------
alter table public.accounts enable row level security;
alter table public.projects enable row level security;
alter table public.widget_configs enable row level security;
alter table public.knowledge_sources enable row level security;
alter table public.knowledge_chunks enable row level security;
alter table public.conversations enable row level security;
alter table public.messages enable row level security;

create policy accounts_select_own on public.accounts
  for select to authenticated
  using (clerk_user_id = (select auth.jwt() ->> 'sub'));

create policy projects_select_own on public.projects
  for select to authenticated
  using (owner_id = (select auth.jwt() ->> 'sub'));

-- Only `name` is updatable (column grant below); the check keeps the row owned by the caller.
create policy projects_update_own on public.projects
  for update to authenticated
  using (owner_id = (select auth.jwt() ->> 'sub'))
  with check (owner_id = (select auth.jwt() ->> 'sub'));

create policy projects_delete_own on public.projects
  for delete to authenticated
  using (owner_id = (select auth.jwt() ->> 'sub'));

create policy widget_configs_select_own on public.widget_configs
  for select to authenticated
  using (project_id in (select public.owned_project_ids()));

create policy knowledge_sources_select_own on public.knowledge_sources
  for select to authenticated
  using (project_id in (select public.owned_project_ids()));

create policy knowledge_chunks_select_own on public.knowledge_chunks
  for select to authenticated
  using (project_id in (select public.owned_project_ids()));

create policy conversations_select_own on public.conversations
  for select to authenticated
  using (project_id in (select public.owned_project_ids()));

create policy messages_select_own on public.messages
  for select to authenticated
  using (conversation_id in (select public.owned_conversation_ids()));

-- ---------------------------------------------------------------------------
-- Grants: start from nothing, then grant only what the policies need.
-- ---------------------------------------------------------------------------
revoke all on all tables in schema public from anon, authenticated;

grant select on
  public.accounts,
  public.projects,
  public.widget_configs,
  public.knowledge_sources,
  public.knowledge_chunks,
  public.conversations,
  public.messages
to authenticated;
grant update (name) on public.projects to authenticated;
grant delete on public.projects to authenticated;

-- The server's secret key: full access to the tables, but never TRUNCATE.
grant all on all tables in schema public to service_role;
alter default privileges in schema public grant all on tables to service_role;
alter default privileges in schema public grant all on sequences to service_role;
alter default privileges in schema public grant execute on functions to service_role;

revoke truncate on all tables in schema public from anon, authenticated, service_role;
alter default privileges in schema public revoke truncate on tables from anon, authenticated, service_role;
