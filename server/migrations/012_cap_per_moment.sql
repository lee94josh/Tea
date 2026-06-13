-- Cap articles at two per moment (one photo cluster shouldn't become five
-- articles). Keep the two highest-scored written topics per moment; unwrite and
-- shelve the rest so the coordinator won't regenerate them. Write-once safety is
-- preserved: shelved topics are never picked up again.
with ranked as (
  select id,
         row_number() over (
           partition by moment_id
           order by score desc nulls last, created_at asc
         ) as rn
  from discover_topics
  where name <> '__none__' and article is not null and not shelved
)
update discover_topics d
   set article = null,
       shelved = true
  from ranked r
 where d.id = r.id
   and r.rn > 2;
