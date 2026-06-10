/**
 * GET /facts — the Fun Facts feed: every obscure-but-true tidbit the research
 * loop verified, flattened across moments, each tied to the photo/moment it
 * came from. Pure read over existing `moments.research.facts` (deduped by text).
 */

import type { FastifyInstance } from 'fastify';
import type { FunFact } from '@lookback/shared';
import { query } from '../db';
import { requireAuth } from '../auth';
import { storage } from '../storage';

export function factsRoutes(app: FastifyInstance): void {
  app.get('/facts', { preHandler: requireAuth }, async () => {
    const rows = await query<{
      moment_id: string;
      venue_name: string | null;
      title: string | null;
      fact: string | null;
      source: string | null;
      idx: string;
      thumb_key: string | null;
      vision_key: string | null;
      taken_at: string | null;
    }>(`
      select m.id as moment_id, m.venue_name, m.title,
             e.obj->>'fact' as fact, e.obj->>'source' as source, e.idx,
             (select p.thumb_key from moment_photos mp join photos p on p.id = mp.photo_id
               where mp.moment_id = m.id and p.thumb_key is not null
               order by p.taken_at nulls last limit 1) as thumb_key,
             (select min(p.taken_at) from moment_photos mp join photos p on p.id = mp.photo_id
               where mp.moment_id = m.id) as taken_at
        from moments m
        cross join lateral jsonb_array_elements(coalesce(m.research->'facts','[]'::jsonb))
             with ordinality as e(obj, idx)
       where m.research is not null
       order by m.created_at desc, e.idx asc
    `);

    const s = storage();
    const seen = new Set<string>();
    const out: FunFact[] = [];
    for (const r of rows.rows) {
      const fact = (r.fact ?? '').trim();
      if (!fact) continue;
      const key = fact.toLowerCase();
      if (seen.has(key)) continue; // dedupe repeated facts across a multi-moment outing
      seen.add(key);
      out.push({
        id: `${r.moment_id}:${r.idx}`,
        momentId: r.moment_id,
        fact,
        source: r.source ?? null,
        venueName: r.venue_name,
        momentTitle: r.title,
        takenAt: r.taken_at ? new Date(r.taken_at).toISOString() : null,
        thumbUrl: r.thumb_key ? await s.url(r.thumb_key) : null,
      });
    }
    return out;
  });
}
