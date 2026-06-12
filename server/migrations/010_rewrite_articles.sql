-- Article voice + focus rewrite (subject-first, plain/factual). Clear existing
-- articles so they regenerate in the new style; /articles backfill repopulates.
update discover_topics set article = null where article is not null;
