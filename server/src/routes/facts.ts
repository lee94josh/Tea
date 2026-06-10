/**
 * GET  /facts        — the Fun Facts feed: every verified tidbit the research
 *                      loop found, flattened across moments, deduped, with a
 *                      REAL working source link (from search grounding), and
 *                      with user-flagged "not interesting" facts excluded.
 * POST /facts/flag    — mark a fact not-interesting (hides it; teaches research).
 */

import type { FastifyInstance } from 'fastify';
import type { FactEntity, FunFact, MomentResearch } from '@lookback/shared';
import { query } from '../db';
import { requireAuth } from '../auth';
import { storage } from '../storage';
import { research } from '../integrations/research';

/** Words that disqualify a capitalized run from being a person/entity name. */
const NAME_STOPWORDS = new Set([
  'The', 'A', 'An', 'In', 'On', 'At', 'Of', 'And', 'But', 'For', 'With', 'From',
  'His', 'Her', 'Their', 'Its', 'This', 'That', 'These', 'Those', 'New', 'It',
  'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August',
  'September', 'October', 'November', 'December', 'Monday', 'Tuesday',
  'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday',
]);

/**
 * Notable names inside a fact: Discover topics that appear in the text (their
 * dives are instant), plus capitalized multi-word runs that look like names
 * (chefs, artists — e.g. "Frank Castronovo") not yet topics.
 */
function detectEntities(
  fact: string,
  topics: Array<{ id: string; name: string }>,
): FactEntity[] {
  const out: FactEntity[] = [];
  const claimed: string[] = [];
  const lower = fact.toLowerCase();

  for (const t of topics) {
    if (t.name.length > 3 && lower.includes(t.name.toLowerCase())) {
      out.push({ name: t.name, topicId: t.id });
      claimed.push(t.name.toLowerCase());
    }
  }

  const nameRe = /\b([A-Z][a-z'’.-]+(?:\s+[A-Z][a-z'’.-]+){1,2})\b/g;
  for (const m of fact.matchAll(nameRe)) {
    const candidate = m[1]!;
    const words = candidate.split(/\s+/);
    if (words.some((w) => NAME_STOPWORDS.has(w))) continue;
    const cl = candidate.toLowerCase();
    if (claimed.some((c) => c.includes(cl) || cl.includes(c))) continue;
    out.push({ name: candidate, topicId: null });
    claimed.push(cl);
    if (out.length >= 4) break;
  }
  return out.slice(0, 4);
}

/** Registrable-ish domain ("en.wikipedia.org" -> "wikipedia.org") for matching. */
function rootDomain(s: string): string {
  const host = s
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .split('/')[0]!
    .toLowerCase();
  const parts = host.split('.');
  return parts.length > 2 ? parts.slice(-2).join('.') : host;
}

/** A reported domain we should never link to (the bug the user hit). */
function uselessDomain(source: string | null): boolean {
  if (!source) return true;
  const r = rootDomain(source);
  return !r.includes('.') || r === 'google.com' || r === 'google';
}

/**
 * Best working link for a fact, in priority order:
 *  1. exact cited article from search grounding (when the model actually searched)
 *  2. any cited article from this moment's research
 *  3. the reported publication's homepage (real source, never bare google.com)
 *  4. a web search for the fact text (last resort)
 * Returns the URL plus the label to display.
 */
function buildSource(
  source: string | null,
  sources: Array<{ title: string; uri: string }>,
  factText: string,
): { url: string; label: string } {
  if (!uselessDomain(source)) {
    const root = rootDomain(source!);
    // 1. exact cited article from grounding, when the publication matches.
    const hit = sources.find((s) => rootDomain(s.title) === root);
    if (hit) return { url: hit.uri, label: root };
    // 2. otherwise the reported publication's homepage — honest per-fact.
    return { url: `https://${root}`, label: root };
  }
  // 3. no usable reported domain: any real cited source from this moment.
  if (sources.length) return { url: sources[0]!.uri, label: rootDomain(sources[0]!.title) };
  // 4. last resort: a web search for the fact.
  return { url: `https://www.google.com/search?q=${encodeURIComponent(factText)}`, label: 'web search' };
}

export function factsRoutes(app: FastifyInstance): void {
  app.get('/facts', { preHandler: requireAuth }, async () => {
    const rows = await query<{
      moment_id: string;
      venue_name: string | null;
      title: string | null;
      research: MomentResearch | null;
      thumb_key: string | null;
      taken_at: string | null;
      created_at: string;
    }>(`
      select m.id as moment_id, m.venue_name, m.title, m.research, m.created_at,
             (select p.thumb_key from moment_photos mp join photos p on p.id = mp.photo_id
               where mp.moment_id = m.id and p.thumb_key is not null
               order by p.taken_at nulls last limit 1) as thumb_key,
             (select min(p.taken_at) from moment_photos mp join photos p on p.id = mp.photo_id
               where mp.moment_id = m.id) as taken_at
        from moments m
       where m.research is not null
       order by m.created_at desc
    `);

    // Facts the user has flagged "drop" — excluded from the feed.
    const flagged = new Set(
      (
        await query<{ fact: string }>(`select lower(fact) as fact from fact_feedback where verdict = 'drop'`)
      ).rows.map((r) => r.fact),
    );

    // Discover topics double as tappable entities (their dives are instant).
    const topicRows = (
      await query<{ id: string; name: string }>(
        `select id, name from discover_topics where name <> '__none__'`,
      )
    ).rows;

    const s = storage();
    const seen = new Set<string>();
    const out: FunFact[] = [];
    for (const r of rows.rows) {
      const facts = r.research?.facts ?? [];
      const sources = r.research?.sources ?? [];
      const thumbUrl = r.thumb_key ? await s.url(r.thumb_key) : null;
      for (let idx = 0; idx < facts.length; idx++) {
        const fact = (facts[idx]!.fact ?? '').trim();
        if (!fact) continue;
        const key = fact.toLowerCase();
        if (seen.has(key) || flagged.has(key)) continue;
        seen.add(key);
        const src = buildSource(facts[idx]!.source ?? null, sources, fact);
        out.push({
          id: `${r.moment_id}:${idx}`,
          momentId: r.moment_id,
          fact,
          source: src.label,
          sourceUrl: src.url,
          venueName: r.venue_name,
          momentTitle: r.title,
          takenAt: r.taken_at ? new Date(r.taken_at).toISOString() : null,
          thumbUrl,
          entities: detectEntities(fact, topicRows),
        });
      }
    }
    return out;
  });

  // Fast-first dive into a single fact (optionally focused on one entity).
  app.post<{ Body: { momentId: string; fact: string; entity?: string | null } }>(
    '/facts/dive',
    { preHandler: requireAuth },
    async (req, reply) => {
      const { momentId, fact, entity } = req.body ?? {};
      if (!momentId || !fact) return reply.code(400).send({ error: 'momentId and fact required' });

      const factKey = fact.trim().toLowerCase();
      const entityKey = (entity ?? '').trim().toLowerCase();

      const cached = (
        await query<{ content: string; used_search: boolean }>(
          `select content, used_search from fact_dives
            where moment_id = $1 and fact_key = $2 and entity = $3`,
          [momentId, factKey, entityKey],
        )
      ).rows[0];
      if (cached) return reply.send({ text: cached.content, usedSearch: cached.used_search });

      const m = (
        await query<{
          venue_name: string | null;
          started_at: string | null;
          research: MomentResearch | null;
        }>('select venue_name, started_at, research from moments where id = $1', [momentId])
      ).rows[0];
      if (!m) return reply.code(404).send({ error: 'moment not found' });

      const date = m.started_at
        ? new Date(m.started_at).toLocaleDateString('en-US', {
            month: 'long', day: 'numeric', year: 'numeric',
          })
        : null;

      const dive = await research().factDive({
        fact,
        entity: entity ?? null,
        venueName: m.venue_name,
        date,
        researchData: m.research,
      });

      if (dive.text) {
        await query(
          `insert into fact_dives (moment_id, fact_key, entity, content, used_search)
           values ($1,$2,$3,$4,$5) on conflict do nothing`,
          [momentId, factKey, entityKey, dive.text, dive.usedSearch],
        );
      }
      return reply.send(dive);
    },
  );

  app.post<{ Body: { momentId: string; fact: string; verdict: 'drop' | 'keep' } }>(
    '/facts/flag',
    { preHandler: requireAuth },
    async (req, reply) => {
      const { momentId, fact, verdict } = req.body ?? {};
      if (!momentId || !fact || (verdict !== 'drop' && verdict !== 'keep')) {
        return reply.code(400).send({ error: 'momentId, fact, verdict(drop|keep) required' });
      }
      await query('delete from fact_feedback where moment_id = $1 and lower(fact) = lower($2)', [
        momentId,
        fact,
      ]);
      await query('insert into fact_feedback (moment_id, fact, verdict) values ($1,$2,$3)', [
        momentId,
        fact,
        verdict,
      ]);
      return reply.send({ ok: true });
    },
  );
}
