-- The personalized newspaper: one write-once feature article per topic.
-- { headline, dek, body_paragraphs[], generated_at }
alter table discover_topics add column if not exists article jsonb;
