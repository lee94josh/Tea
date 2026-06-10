/**
 * `research:moment` — search-grounded enrichment between analysis and seeding.
 * Non-fatal by design: if research fails or is disabled (RESEARCH_PASSES=0),
 * the moment proceeds to seeding on analysis alone.
 */

import type { MomentAnalysis, MomentResearch } from '@lookback/shared';
import { query } from '../db';
import { research } from '../integrations/research';
import { vision } from '../integrations/vision';
import { storage } from '../storage';
import { enqueue, JOBS } from '../queue';
import { env } from '../env';
import { extractAndStoreTopics } from '../topics';

export interface ResearchJob {
  momentId: string;
}

export async function runResearch(data: ResearchJob): Promise<void> {
  const { momentId } = data;

  const m = (
    await query<{
      analysis: MomentAnalysis | null;
      venue_name: string | null;
      started_at: string | null;
      lat: number | null;
      lng: number | null;
    }>('select analysis, venue_name, started_at, lat, lng from moments where id = $1', [momentId])
  ).rows[0];
  if (!m || !m.analysis) return;

  if (env.research.passes > 0 && env.gemini.apiKey) {
    try {
      const candidates = await query<{
        name: string | null;
        category: string | null;
        address: string | null;
      }>(
        `select distinct v.name, v.category, v.address
           from moment_photos mp join venues v on v.photo_id = mp.photo_id
           where mp.moment_id = $1 and v.name is not null limit 8`,
        [momentId],
      );

      const date = m.started_at
        ? new Date(m.started_at).toLocaleDateString('en-US', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric',
          })
        : null;

      // Load vision derivatives once: the curiosity planner looks at them up
      // front, and interrogation re-examines them after research.
      const photoRows = await query<{ vision_key: string | null }>(
        `select p.vision_key from moment_photos mp
           join photos p on p.id = mp.photo_id
          where mp.moment_id = $1 and p.vision_key is not null
          order by p.taken_at nulls last limit 6`,
        [momentId],
      );
      const images = [];
      for (const row of photoRows.rows) {
        if (!row.vision_key) continue;
        images.push({ bytes: await storage().get(row.vision_key), mimeType: 'image/jpeg' });
      }

      const result: MomentResearch = await research().research(
        {
          analysis: m.analysis,
          venueName: m.venue_name,
          venueCandidates: candidates.rows,
          date,
          lat: m.lat,
          lng: m.lng,
        },
        images,
      );

      // Photo interrogation: close the loop between search and pixels —
      // re-examine the images WITH the facts. Non-fatal enrichment.
      if (result.facts.length > 0 && images.length > 0) {
        try {
          result.verification = await vision().interrogate(
            images,
            [...result.facts.map((f) => f.fact), ...result.hooks],
          );
        } catch (err) {
          console.warn(
            `[research] interrogation failed for ${momentId} (non-fatal): ${err instanceof Error ? err.message : err}`,
          );
        }
      }

      // Research's verified venue beats earlier attributions when confident.
      const venueName =
        result.venue?.name && result.venue.confidence >= 0.6
          ? result.venue.name
          : m.venue_name;

      await query(
        `update moments set research = $2, venue_name = $3, status = 'researched' where id = $1`,
        [momentId, JSON.stringify(result), venueName],
      );
      console.log(
        `[research] moment ${momentId}: ${result.facts.length} facts, ` +
          `${result.hooks.length} hooks, ${result.passes} pass(es)`,
      );
    } catch (err) {
      // Research is enrichment, not a gate — log and move on.
      console.warn(
        `[research] failed for ${momentId} (non-fatal): ${err instanceof Error ? err.message : err}`,
      );
      await query(`update moments set status = 'researched' where id = $1`, [momentId]);
    }
  } else {
    await query(`update moments set status = 'researched' where id = $1`, [momentId]);
  }

  // Extract Discover topics now (non-fatal) so they're ready the moment the
  // photo finishes processing — no lazy work on the Discover page.
  await extractAndStoreTopics(momentId).catch((err) =>
    console.warn(`[research] topic extraction failed for ${momentId} (non-fatal):`, err),
  );

  await enqueue(JOBS.seedGenerate, { momentId });
}
