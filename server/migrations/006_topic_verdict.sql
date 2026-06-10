-- Relevance feedback on Discover topics: keep | drop | null.
alter table discover_topics add column if not exists verdict text;
