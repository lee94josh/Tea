-- Choosier topics: every topic gets a 0-100 article-worthiness score
-- (judged by the rubric in integrations/anthropic.ts). Low scorers are
-- shelved instead of written; the reader rates written articles 1-5
-- (tier 1 = best) and those ratings calibrate future judging.
alter table discover_topics add column if not exists score int;
alter table discover_topics add column if not exists score_reasons jsonb;
alter table discover_topics add column if not exists shelved boolean not null default false;
alter table discover_topics add column if not exists user_rating int;

-- One-shot coordination flags (e.g. the initial backlog cull runs exactly once).
create table if not exists app_flags (
  name text primary key,
  set_at timestamptz not null default now()
);
