-- Prompt-refinement feedback loop: which of the three openers got picked,
-- which chips get tapped, and explicit "this is bad" reports with notes.
create table if not exists feedback (
  id              uuid primary key default gen_random_uuid(),
  seed_id         uuid references conversation_seeds(id) on delete set null,
  conversation_id uuid references conversations(id) on delete set null,
  kind            text not null,   -- opener_choice | chip_choice | bad
  payload         jsonb not null,  -- {index, text} or {note, context}
  created_at      timestamptz default now()
);

-- Seeds now carry three candidate openers; `opener` stays as the default/chosen.
alter table conversation_seeds add column if not exists openers jsonb;
