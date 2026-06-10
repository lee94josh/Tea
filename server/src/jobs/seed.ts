/**
 * `seed:generate` — turn a moment's analysis into a conversation seed (opener +
 * three branching suggested replies + quality_score). THIS IS THE MAGIC TEST:
 * if the seeds don't make you want to reply, the prompt/clustering is wrong.
 *
 * Single-photo moments get a small quality penalty (>=2 photos preferred).
 */

import type { MomentAnalysis, MomentResearch } from '@lookback/shared';
import { query } from '../db';
import { llm } from '../integrations/llm';
import { enqueue, JOBS } from '../queue';

export interface SeedJob {
  momentId: string;
}

export async function runSeed(data: SeedJob): Promise<void> {
  const { momentId } = data;

  const moment = await query<{
    analysis: MomentAnalysis | null;
    venue_name: string | null;
    started_at: string | null;
    research: MomentResearch | null;
  }>('select analysis, venue_name, started_at, research from moments where id = $1', [momentId]);
  const m = moment.rows[0];
  if (!m || !m.analysis) return;

  const count = await query<{ n: string }>(
    'select count(*)::text as n from moment_photos where moment_id = $1',
    [momentId],
  );
  const photoCount = Number(count.rows[0]?.n ?? '1');

  const date = m.started_at
    ? new Date(m.started_at).toLocaleDateString('en-US', {
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      })
    : null;

  try {
    const draft = await llm().generateSeed({
      analysis: m.analysis,
      venueName: m.venue_name,
      date,
      research: m.research,
    });

    if (draft.openers.length === 0) {
      await query(`update moments set status = 'error' where id = $1`, [momentId]);
      return;
    }

    // Single-photo moments are allowed but lower-ranked.
    const quality = photoCount >= 2 ? draft.quality_score : draft.quality_score * 0.7;

    await query(
      `insert into conversation_seeds (moment_id, opener, openers, suggested_replies, quality_score, status)
       values ($1,$2,$3,$4,$5,'unused')`,
      [
        momentId,
        draft.openers[0],
        JSON.stringify(draft.openers),
        JSON.stringify(draft.suggested_replies),
        quality,
      ],
    );
    await query(`update moments set status = 'seeded' where id = $1`, [momentId]);

    // Let the notify coordinator decide whether all seeds are ready.
    await enqueue(
      JOBS.checkNotify,
      {},
      { singletonKey: 'notify', singletonSeconds: 10, startAfter: 10 },
    );
  } catch (err) {
    await query(`update moments set status = 'error' where id = $1`, [momentId]);
    throw err;
  }
}
