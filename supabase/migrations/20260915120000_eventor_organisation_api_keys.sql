-- Stores each connected club/organisation's Eventor API key, keyed by
-- OrganisationRegister.Id. Eventor API keys are issued per-organisation, so
-- authentication (and, later, other Eventor calls) must pick the right key for
-- the relevant organisation instead of relying on a single shared key.
--
-- Secrets: RLS is enabled with NO policies, so only the service role (edge
-- functions) can read/write this table — it is never exposed to the app.

create table if not exists public.eventor_organisation_api_keys (
  organisation_id integer primary key,
  api_key text not null,
  note text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.eventor_organisation_api_keys enable row level security;
