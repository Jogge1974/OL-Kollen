-- Organisation register imported from the Eventor IOF 3.0 OrganisationList export.
-- Holds the Swedish orienteering organisation tree in four levels:
--   IOF (root, Id 650) > NationalFederation (Svenska OF, Id 1)
--     > NationalRegion (districts) > Club.
-- Foreign clubs (type = 'Club' with ParentOrganisationId = 650) are NOT imported.
-- The data is public reference data, so RLS allows anon SELECT while writes stay
-- limited to the service role / direct-Postgres importer (both bypass RLS).

create table if not exists public."OrganisationRegister" (
  "Id" integer primary key,
  "Name" text not null,
  "ShortName" text null,
  "MediaName" text null,
  "Type" text not null,                 -- IOF | NationalFederation | NationalRegion | Club
  "ParentOrganisationId" integer null,
  "CountryCode" text null,
  "ModifyTime" timestamptz null,
  "UpdatedAt" timestamptz not null default now()
);

create index if not exists organisation_register_parent_idx
  on public."OrganisationRegister" ("ParentOrganisationId");

create index if not exists organisation_register_type_idx
  on public."OrganisationRegister" ("Type");

alter table public."OrganisationRegister" enable row level security;

drop policy if exists "anon_select_organisation_register" on public."OrganisationRegister";
create policy "anon_select_organisation_register"
  on public."OrganisationRegister"
  for select
  using (true);

-- Returns the organisation itself (depth 0) plus every ancestor up to the root,
-- ordered from the organisation outwards toward the root. Each row carries the
-- id + name so callers get the full tree branch in a single request.
create or replace function public.get_organisation_tree(p_id integer)
returns table (
  id integer,
  name text,
  short_name text,
  type text,
  parent_organisation_id integer,
  depth integer
)
language sql
stable
as $$
  with recursive chain as (
    select
      o."Id"                    as id,
      o."Name"                  as name,
      o."ShortName"             as short_name,
      o."Type"                  as type,
      o."ParentOrganisationId"  as parent_organisation_id,
      0                         as depth
    from public."OrganisationRegister" o
    where o."Id" = p_id
    union all
    select
      p."Id",
      p."Name",
      p."ShortName",
      p."Type",
      p."ParentOrganisationId",
      c.depth + 1
    from public."OrganisationRegister" p
    join chain c on p."Id" = c.parent_organisation_id
  )
  select id, name, short_name, type, parent_organisation_id, depth
  from chain
  order by depth;
$$;

grant execute on function public.get_organisation_tree(integer) to anon, authenticated, service_role;
