-- Rewrite every surviving article in the new Opus voice (scannable, bullet-point
-- in spirit, no subheading). Unwrite the written, non-shelved topics so the
-- coordinator regenerates them; scores are kept, so they rewrite best-first and
-- the 2-per-moment cap still holds. Shelved topics (culled or over-cap from 012)
-- stay shelved and are not regenerated.
update discover_topics
   set article = null
 where name <> '__none__'
   and article is not null
   and not shelved;
