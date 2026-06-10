-- Background research loop: search-grounded enrichment per moment.
-- Status flow becomes: pending -> analyzed -> researched -> seeded.
alter table moments add column if not exists research jsonb;
