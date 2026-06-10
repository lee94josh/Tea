-- Discover view: learnable topics extracted from each moment's research, with
-- on-demand search-grounded deep dives cached in `deep`.
create table if not exists discover_topics (
  id          uuid primary key default gen_random_uuid(),
  moment_id   uuid references moments(id) on delete cascade,
  name        text not null,
  kind        text,            -- place | person | artwork | food | event | history | other
  blurb       text,
  deep        jsonb,           -- { title, body_paragraphs[], fun_facts[], further_questions[] }
  created_at  timestamptz default now(),
  unique (moment_id, name)
);
