-- Cached "dive deeper" responses for fun facts (optionally focused on one
-- entity mentioned in the fact). Keyed by moment + normalized fact + entity.
create table if not exists fact_dives (
  id          uuid primary key default gen_random_uuid(),
  moment_id   uuid references moments(id) on delete cascade,
  fact_key    text not null,             -- lower(fact)
  entity      text not null default '',  -- lower(entity) or '' for whole-fact dive
  content     text not null,
  used_search boolean default false,
  created_at  timestamptz default now(),
  unique (moment_id, fact_key, entity)
);
