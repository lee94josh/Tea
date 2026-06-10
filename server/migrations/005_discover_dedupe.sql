-- Consolidate duplicate Discover topics (same name extracted from multiple
-- moments). Keep the best copy: one with a cached deep dive wins, then oldest.
delete from discover_topics t
 using discover_topics k
 where t.name <> '__none__'
   and k.name <> '__none__'
   and lower(t.name) = lower(k.name)
   and t.id <> k.id
   and (
     (k.deep is not null and t.deep is null)
     or ((k.deep is null) = (t.deep is null) and k.created_at < t.created_at)
     or ((k.deep is null) = (t.deep is null) and k.created_at = t.created_at and k.id < t.id)
   );

-- One topic per name globally (the '__none__' extraction sentinel is exempt).
create unique index if not exists discover_topics_name_uniq
  on discover_topics (lower(name)) where name <> '__none__';
