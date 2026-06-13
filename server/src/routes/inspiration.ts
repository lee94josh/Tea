/**
 * GET /inspiration/test — the cheap inspiration-mode probe.
 *
 * Pairs photos the user already indexed (using the embeddings we already have)
 * and asks Gemini Flash for ONE non-obvious thread between each pair — a
 * historical fact, a surprising link, a creative prompt. Returns an HTML gallery
 * (two seed thumbnails + the spark per row) so the concept can be eyeballed for
 * pennies before any of it is built into the app.
 *
 * Throwaway/diagnostic: open in a browser with ?token=APP_TOKEN. Tunables:
 *   ?k=16    how many pairs (hard-capped at 40 to bound cost)
 *   ?pool=120  how many candidate photos to draw from
 *   ?strategy=contrast|bridge   far-apart vs. mid-distance pairings
 */

import type { FastifyInstance } from 'fastify';
import { GoogleGenAI } from '@google/genai';
import { query } from '../db';
import { storage } from '../storage';
import { requireAuth } from '../auth';
import { env } from '../env';

interface Photo {
  id: string;
  thumb_key: string;
  taken_at: string | null;
}

const SPARK_SCHEMA = {
  type: 'object',
  properties: { title: { type: 'string' }, spark: { type: 'string' } },
  required: ['title', 'spark'],
};

const PROMPT = [
  'You are an inspiration engine. Below are TWO photos the same person took, at',
  'different times. Do not just describe them.',
  'Find ONE genuinely interesting, non-obvious thread that connects them: a',
  'historical fact, a surprising hidden link, or a creative idea/prompt they spark',
  'together. Be specific and surprising — never generic, never "both show...".',
  'Two or three sentences. Also a punchy title (max 6 words).',
  'Return ONLY JSON: { "title": "...", "spark": "..." }',
].join(' ');

export function inspirationRoutes(app: FastifyInstance): void {
  app.get<{ Querystring: { k?: string; pool?: string; strategy?: string } }>(
    '/inspiration/test',
    { preHandler: requireAuth },
    async (req, reply) => {
      if (!env.gemini.apiKey) {
        return reply.type('text/html').send('<p>GEMINI_API_KEY not set.</p>');
      }
      const k = Math.min(40, Math.max(1, Number(req.query.k ?? 16)));
      const pool = Math.min(400, Math.max(10, Number(req.query.pool ?? 120)));
      const strategy = req.query.strategy === 'bridge' ? 'bridge' : 'contrast';

      // Candidate pool: indexed, non-screenshot photos that have both a thumbnail
      // and an embedding to pair on.
      const photos = (
        await query<Photo>(
          `select p.id, p.thumb_key, p.taken_at::text as taken_at
             from photos p join photo_embeddings e on e.photo_id = p.id
            where p.is_screenshot = false and p.thumb_key is not null
            order by random() limit $1`,
          [pool],
        )
      ).rows;
      if (photos.length < 2) {
        return reply
          .type('text/html')
          .send('<p>Not enough indexed photos with embeddings yet. Index more first.</p>');
      }

      // Build pairs by embedding distance. contrast = far apart (surprising);
      // bridge = mid-distance (a thread, not a non-sequitur). Pick from a small
      // top-band with randomness so re-runs vary; never reuse a photo.
      const used = new Set<string>();
      const pairs: Array<[Photo, Photo]> = [];
      const byId = new Map(photos.map((p) => [p.id, p]));
      for (const anchor of photos) {
        if (pairs.length >= k) break;
        if (used.has(anchor.id)) continue;
        const cand = (
          await query<{ id: string; dist: number }>(
            `select p.id,
                    (e.embedding <=> (select embedding from photo_embeddings where photo_id = $1)) as dist
               from photo_embeddings e join photos p on p.id = e.photo_id
              where p.is_screenshot = false and p.thumb_key is not null and p.id <> $1
              order by dist ${strategy === 'contrast' ? 'desc' : 'asc'}
              limit 40`,
            [anchor.id],
          )
        ).rows;
        // contrast: top of the far end; bridge: skip the near-duplicates, take
        // the middle band. Then a random pick within the band for variety.
        const band = strategy === 'contrast' ? cand.slice(0, 8) : cand.slice(12, 24);
        const partnerRow = band[Math.floor(Math.random() * band.length)] ?? band[0];
        const partner = partnerRow && byId.get(partnerRow.id);
        if (!partner || used.has(partner.id)) continue;
        used.add(anchor.id);
        used.add(partner.id);
        pairs.push([anchor, partner]);
      }

      // Generate sparks with bounded concurrency (vision calls are slow).
      const ai = new GoogleGenAI({ apiKey: env.gemini.apiKey });
      const results = await mapPool(pairs, 4, async ([a, b]) => {
        try {
          const [ba, bb] = await Promise.all([
            storage().get(a.thumb_key),
            storage().get(b.thumb_key),
          ]);
          const res = await ai.models.generateContent({
            model: env.gemini.visionModel,
            contents: [
              {
                role: 'user',
                parts: [
                  { text: PROMPT },
                  { inlineData: { mimeType: 'image/jpeg', data: ba.toString('base64') } },
                  { inlineData: { mimeType: 'image/jpeg', data: bb.toString('base64') } },
                ],
              },
            ],
            config: {
              responseMimeType: 'application/json',
              responseSchema: SPARK_SCHEMA as unknown as object,
              temperature: 0.95,
            },
          });
          const parsed = JSON.parse(res.text ?? '{}');
          return {
            a: ba.toString('base64'),
            b: bb.toString('base64'),
            title: String(parsed.title ?? ''),
            spark: String(parsed.spark ?? ''),
          };
        } catch (err) {
          console.warn('[inspiration] pair failed:', err instanceof Error ? err.message : err);
          return null;
        }
      });

      return reply.type('text/html').send(renderHtml(results.filter(Boolean) as Spark[], strategy));
    },
  );
}

interface Spark {
  a: string;
  b: string;
  title: string;
  spark: string;
}

/** Run `fn` over `items` with at most `n` in flight; preserves order. */
async function mapPool<T, R>(items: T[], n: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, items.length) }, async () => {
      while (i < items.length) {
        const idx = i++;
        out[idx] = await fn(items[idx]!);
      }
    }),
  );
  return out;
}

function renderHtml(sparks: Spark[], strategy: string): string {
  const cards = sparks
    .map(
      (s) => `
    <div class="card">
      <div class="imgs">
        <img src="data:image/jpeg;base64,${s.a}" />
        <span class="plus">+</span>
        <img src="data:image/jpeg;base64,${s.b}" />
      </div>
      <h2>${escapeHtml(s.title)}</h2>
      <p>${escapeHtml(s.spark)}</p>
    </div>`,
    )
    .join('');
  return `<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    body{background:#f4f2e8;color:#17170f;font:16px/1.5 -apple-system,Georgia,serif;margin:0;padding:24px;}
    h1{font-size:15px;letter-spacing:2px;text-transform:uppercase;opacity:.6;font-weight:700;}
    .card{max-width:520px;margin:0 auto 56px;}
    .imgs{display:flex;align-items:center;gap:10px;}
    .imgs img{width:46%;border-radius:4px;object-fit:cover;aspect-ratio:1;box-shadow:0 4px 14px rgba(0,0,0,.16);}
    .plus{font-size:24px;opacity:.5;}
    h2{font-size:23px;margin:18px 0 6px;line-height:1.15;}
    p{margin:0;font-size:17px;}
  </style></head><body>
  <h1>Inspiration test · ${strategy} · ${sparks.length} pairs</h1>
  ${cards || '<p>No pairs generated.</p>'}
  </body></html>`;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
}
