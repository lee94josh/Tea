/**
 * `ingest:embed` — multimodal embedding of the vision derivative. On success the
 * photo reaches its terminal `done` state, which is the signal the cluster
 * coordinator waits on. If no Gemini key is configured we still mark `done`
 * (embeddings are a v2 nicety for sub-event splitting, not required for MVP
 * clustering, which is time/distance based).
 */

import { query } from '../db';
import { storage } from '../storage';
import { embeddings } from '../integrations/embeddings';
import { enqueue, JOBS } from '../queue';
import { env } from '../env';
import { markError, setStatus } from './helpers';

export interface EmbedJob {
  photoId: string;
  visionKey: string;
}

export async function runEmbed(data: EmbedJob): Promise<void> {
  const { photoId, visionKey } = data;
  try {
    // Embeddings are best-effort: a failure here (text-only embed model, missing
    // pgvector, quota) must NOT block the photo — MVP clustering never reads
    // embeddings. Log and move on.
    if (env.gemini.apiKey) {
      try {
        const bytes = await storage().get(visionKey);
        const vec = await embeddings().embedImage(bytes, 'image/jpeg');
        await setStatus(photoId, 'embedded');
        // pgvector accepts the bracketed string form: '[1,2,3]'.
        await query(
          `insert into photo_embeddings (photo_id, embedding) values ($1, $2)
           on conflict (photo_id) do update set embedding = excluded.embedding`,
          [photoId, JSON.stringify(vec)],
        );
      } catch (err) {
        console.warn(
          `[embed] skipped for ${photoId} (non-fatal): ${err instanceof Error ? err.message : err}`,
        );
      }
    }

    await setStatus(photoId, 'done');

    // Tell the coordinator a photo finished; it decides whether to cluster.
    // singletonKey + a short debounce collapse the burst of completions.
    await enqueue(
      JOBS.checkCluster,
      {},
      { singletonKey: 'cluster', singletonSeconds: 5, startAfter: 5 },
    );
  } catch (err) {
    await markError(photoId, err);
    throw err;
  }
}
