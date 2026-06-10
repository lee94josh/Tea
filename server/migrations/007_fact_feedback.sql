-- Per-fact relevance feedback for the Fun Facts feed. Facts live inside
-- moments.research (jsonb), so we key feedback by moment + fact text.
create table if not exists fact_feedback (
  id          uuid primary key default gen_random_uuid(),
  moment_id   uuid references moments(id) on delete cascade,
  fact        text not null,
  verdict     text not null,        -- drop (not interesting) | keep
  created_at  timestamptz default now()
);
create index if not exists fact_feedback_fact_idx on fact_feedback (lower(fact));
