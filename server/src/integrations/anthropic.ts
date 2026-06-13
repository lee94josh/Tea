/**
 * Anthropic integration — the judging + writing half of the model split.
 *
 * Why two providers: Gemini keeps the multimodal work (vision, curiosity,
 * search-grounded research) on its own quota pool; Anthropic takes the two
 * text-only judgment/prose stages on a SEPARATE pool, so one provider's rate
 * limit can never freeze the whole paper again.
 *
 *   - judgeTopic    → Haiku  (cheap, structured outputs guarantee the JSON)
 *   - writeArticle  → Sonnet (best plain-factual prose; server-side web_search
 *                     verifies facts mid-draft, replacing Gemini grounding)
 *
 * Both throw on API errors so the article coordinator's backoff logic applies.
 */

import Anthropic from '@anthropic-ai/sdk';
import { env } from '../env';

let _client: Anthropic | null = null;
function client(): Anthropic {
  if (!_client) _client = new Anthropic({ apiKey: env.anthropic.apiKey });
  return _client;
}

export function anthropicEnabled(): boolean {
  return Boolean(env.anthropic.apiKey);
}

// ---------------------------------------------------------------------------
// Topic worthiness judge
// ---------------------------------------------------------------------------

export interface TopicScore {
  /** 0–100 article-worthiness. */
  score: number;
  /** Per-dimension breakdown (attention/specificity/depth/teachability). */
  reasons: Record<string, number>;
  /** One-line rationale, auditable later ("why did it write about X?"). */
  rationale: string;
}

/** score → editorial tier (1 best … 5 skip). Shared by API + iOS. */
export function tierForScore(score: number): number {
  if (score >= 80) return 1;
  if (score >= 65) return 2;
  if (score >= 50) return 3;
  if (score >= 35) return 4;
  return 5;
}

const JUDGE_SYSTEM = `You are the editor of a one-reader personalized newspaper. Each candidate topic was surfaced from the reader's own photos. Your job: score how much this topic deserves a ~400-word factual feature article. The reader loves food, design, art, history, and culture.

THE INTENT THESIS — a photo is a vote of attention:
- Judge what the photo was OF (the deliberately framed subject), never what was merely IN it (backgrounds, logos, objects, decor).
- Effort implies intent: places traveled to, events attended, meals sought out. Ambient daily life is not effort.

Score 0–100 across four dimensions:
- attention (0–25): how strongly did the photos vote? Multiple shots, a deliberately framed subject, a sought-out experience = high. Incidental = near zero.
- specificity (0–25): a NAMED, particular subject (a restaurant, an artist, a ceremony tradition, a performer) = high. Categories, commodities, brands = near zero.
- depth (0–25): does the subject have a real story to research — a history, a maker, a craft, a tradition? Things that merely exist (products, generic scenery) have specs, not stories.
- teachability (0–25): will the reader genuinely learn something? Obscure-but-true beats well-known; encyclopedia boilerplate scores low.

CALIBRATED EXAMPLES (anchor to these):
- 85–95: the pyebaek ceremony and its ducks · a named chef-driven restaurant (Honeysuckle) · a performer seen live (Baby Keem at Brooklyn Paramount) · an artist whose work was photographed (Arthur Jafa)
- 60–75: the storied venue building itself · a named local ice-cream shop · the artist behind one photographed mural
- 35–50: a neighborhood's general history · a dish style (not the restaurant) · a designer chair spotted in an office
- 0–25: a NASA logo on a mug · a MacBook (never Apple, never Steve Jobs) · sourdough toast · skylines, brownstones, fire escapes · receipts, screenshots, posters of comedians the reader didn't see live`;

export async function judgeTopic(
  topic: { name: string; kind: string | null; blurb: string | null },
  context: {
    venueName: string | null;
    date: string | null;
    facts: string[];
    analysisSummary: string | null;
  },
  exemplars: { liked: string[]; disliked: string[] },
): Promise<TopicScore> {
  const lines = [
    `CANDIDATE TOPIC: ${topic.name}${topic.kind ? ` (${topic.kind})` : ''}`,
    topic.blurb ? `Blurb: ${topic.blurb}` : '',
    context.venueName ? `Moment venue: ${context.venueName}` : '',
    context.date ? `Moment date: ${context.date}` : '',
    context.analysisSummary ? `What the photos show: ${context.analysisSummary}` : '',
    context.facts.length ? `Researched facts: ${context.facts.slice(0, 8).join(' | ')}` : '',
  ];
  if (exemplars.liked.length) {
    lines.push(
      '',
      'The reader rated articles on these topics HIGHLY (tier 1–2) — this register works:',
      ...exemplars.liked.slice(0, 8).map((t) => `- ${t}`),
    );
  }
  if (exemplars.disliked.length) {
    lines.push(
      '',
      'The reader rated articles on these topics POORLY (tier 4–5) — avoid this register:',
      ...exemplars.disliked.slice(0, 8).map((t) => `- ${t}`),
    );
  }

  const res = await client().messages.create({
    model: env.anthropic.judgeModel,
    max_tokens: 500,
    system: JUDGE_SYSTEM,
    messages: [{ role: 'user', content: lines.filter(Boolean).join('\n') }],
    output_config: {
      format: {
        type: 'json_schema',
        schema: {
          type: 'object',
          // Structured outputs reject min/max on integers; the rubric states
          // the 0–25 range and dim() clamps defensively after parsing.
          properties: {
            attention: { type: 'integer', description: '0-25' },
            specificity: { type: 'integer', description: '0-25' },
            depth: { type: 'integer', description: '0-25' },
            teachability: { type: 'integer', description: '0-25' },
            rationale: { type: 'string' },
          },
          required: ['attention', 'specificity', 'depth', 'teachability', 'rationale'],
          additionalProperties: false,
        },
      },
    },
  });

  const text = res.content.find((b): b is Anthropic.TextBlock => b.type === 'text')?.text ?? '{}';
  const o = JSON.parse(text) as Record<string, unknown>;
  const dim = (k: string): number =>
    typeof o[k] === 'number' ? Math.min(25, Math.max(0, Math.round(o[k] as number))) : 0;
  const reasons = {
    attention: dim('attention'),
    specificity: dim('specificity'),
    depth: dim('depth'),
    teachability: dim('teachability'),
  };
  return {
    score: reasons.attention + reasons.specificity + reasons.depth + reasons.teachability,
    reasons,
    rationale: typeof o.rationale === 'string' ? o.rationale : '',
  };
}

// ---------------------------------------------------------------------------
// Article writer
// ---------------------------------------------------------------------------

/** Same contract as GeminiResearch.writeArticle — the coordinator can fall
 *  back between providers without caring which one wrote the piece. */
export async function writeArticleAnthropic(
  topic: { name: string; kind: string | null },
  context: { venueName: string | null; date: string | null; facts: string[]; blurb: string | null },
): Promise<{ headline: string; dek: string; body_paragraphs: string[] } | null> {
  const prompt = [
    `Teach the reader about: ${topic.name}${topic.kind ? ` (${topic.kind})` : ''}.`,
    'This runs in a personalized newspaper that turns the things someone photographs',
    'into short, scannable lessons. A photo is only the SEED — the piece is about the',
    "SUBJECT itself, not the reader's visit or the event they attended.",
    '',
    'WHAT TO WRITE ABOUT:',
    '- The history and substance of the subject itself. Photographed a Korean wedding?',
    '  Write the pyebaek tradition and the duck/geese symbolism — not "the wedding you',
    '  attended." Photographed Mr. Cheeks ice cream? Write the story of Mr. Cheeks or',
    '  that style of ice cream — not "the day you were there."',
    '- Never mention the reader, "you," "your visit," the date, or that they were',
    '  present. No second person. It is the only piece that will ever exist on this',
    '  subject, so make it the substance: origins, how it works / what makes it',
    '  distinct, the people or culture behind it, why it matters.',
    context.facts.length ? `Verified facts to use/extend: ${context.facts.join(' | ')}` : '',
    '- Use web search to verify and find real specifics before writing. Concrete',
    '  details (names, dates, numbers, how it actually works) over generalities.',
    '',
    'FORMAT — built to scan, not to read like an essay:',
    '- Open with one or two plain sentences: what this is and why it is worth knowing.',
    '  No scene-setting, no throat-clearing.',
    '- Then a handful of short, self-contained paragraphs: ONE idea each, 1-2',
    '  sentences, front-loaded with the fact. Briefing notes, not an essay - someone',
    '  skimming the first few words of each should get it.',
    '- You MAY open a paragraph with a short bold lead-in and an em-dash when it',
    '  sharpens the scan ("**Origin -** opened in 2019 by ...") but do not force it on',
    '  every one. Do NOT use bullet glyphs, hyphens, or numbering; write plain',
    '  paragraphs.',
    '- ~180-280 words total. Dense and skimmable beats long and padded.',
    '',
    'VOICE — kill the AI-essay tells:',
    '- BANNED words/phrases: nestled, hidden gem, testament to, steeped in, rich',
    '  history, rich tapestry, vibrant, bustling, boasts, delve, dive into, "it\'s',
    '  worth noting", "stands as", "at its core", "in conclusion", "whether you\'re",',
    '  "more than just", "not only ... but also", "from ... to ...".',
    '- No moralizing wrap-up sentence, no rule-of-three lists, no rhetorical questions,',
    '  no exclamation marks, no hedging ("perhaps", "arguably", "some might say").',
    '- Plain, confident, specific. If a sentence does not carry a fact, cut it.',
    '',
    'HEADLINE: plain and descriptive — name the subject and the angle ("The pyebaek,',
    'and why Korean weddings involve ducks"). Not clever, not a pun.',
    'DEK: leave it an empty string "" (the reader shows no subheading).',
    '',
    'Return body_paragraphs as that sequence of short paragraphs (the intro first).',
    'Respond with ONLY this JSON (no prose around it):',
    '{ "headline": "...", "dek": "", "body_paragraphs": ["..."] }',
  ]
    .filter(Boolean)
    .join('\n');

  const res = await client().messages.create({
    model: env.anthropic.writerModel,
    max_tokens: 4000,
    thinking: { type: 'adaptive' },
    tools: [{ type: 'web_search_20260209', name: 'web_search', max_uses: 4 }],
    messages: [{ role: 'user', content: prompt }],
  });

  const text = res.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('\n');
  const cleaned = text.replace(/```(?:json)?/gi, '').trim();
  let parsed: Record<string, unknown> = {};
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    try {
      const match = cleaned.match(/\{[\s\S]*\}/);
      parsed = match ? JSON.parse(match[0]) : {};
    } catch {
      parsed = {};
    }
  }
  const body = Array.isArray(parsed.body_paragraphs)
    ? parsed.body_paragraphs.filter((x): x is string => typeof x === 'string')
    : [];
  if (body.length === 0) return null;
  return {
    headline:
      typeof parsed.headline === 'string' && parsed.headline ? parsed.headline : topic.name,
    dek: typeof parsed.dek === 'string' ? parsed.dek : '',
    body_paragraphs: body,
  };
}
