/**
 * Background research loop — the "it doesn't have to be instant" engine.
 *
 * Uses Gemini with built-in Google Search grounding (no extra API key) to turn
 * a moment's analysis into VERIFIED, specific knowledge before any seed is
 * written: confirm the venue, find what it's known for, decode legible text
 * (posters, menus), pin dates/events, surface conversation-worthy angles.
 *
 * Recursive by design: each pass emits `open_questions`; the next pass
 * searches those. RESEARCH_PASSES caps the loop (default 2). The pipeline is
 * async and push-notifies when done, so passes can be slow and thorough.
 */

import { GoogleGenAI } from '@google/genai';
import type {
  CuriosityAngle,
  DeepDive,
  MomentAnalysis,
  MomentResearch,
  ResearchFact,
} from '@lookback/shared';
import { env } from '../env';

export interface ResearchInput {
  analysis: MomentAnalysis;
  venueName: string | null;
  venueCandidates: Array<{ name: string | null; category: string | null; address: string | null }>;
  date: string | null;
  lat: number | null;
  lng: number | null;
  /** Facts the user has flagged "not interesting" — negative examples. */
  dislikedFacts?: string[];
}

/** Pull the real cited web sources out of a grounded response. */
function extractSources(res: unknown): Array<{ title: string; uri: string }> {
  const chunks =
    (res as { candidates?: Array<{ groundingMetadata?: { groundingChunks?: Array<{ web?: { title?: string; uri?: string } }> } }> })
      ?.candidates?.[0]?.groundingMetadata?.groundingChunks ?? [];
  const out: Array<{ title: string; uri: string }> = [];
  const seen = new Set<string>();
  for (const c of chunks) {
    const uri = c.web?.uri;
    if (!uri || seen.has(uri)) continue;
    seen.add(uri);
    out.push({ title: c.web?.title ?? uri, uri });
  }
  return out;
}

export interface ResearchImage {
  bytes: Buffer;
  mimeType: string;
}

const CURIOSITY_SYSTEM = `You are the curiosity engine for a photo-memory app. Given someone's photos plus every scrap of metadata, produce the QUESTION PLAN a relentlessly nosy, perceptive friend would have.

Rules:
- 8 to 12 angles, genuinely distinct — no rephrasings of each other.
- Reason across signals IN COMBINATION, not field by field: venue × date ("who played there that night?"), time × scene ("why 2am?"), legible text × location ("what does that poster refer to?"), date × library context (holiday? opening night?). Combination questions beat single-field questions.
- For each piece of metadata, ask yourself: what would a nosy friend wonder about THIS?
- Hunt anomalies: list separately anything surprising, missing, or out of place (a restaurant with no food shots, a party with no people, a 4am timestamp, an empty venue).
- Tag each angle:
  - "searchable" — the web can answer it (events that night, what a sign/poster refers to, a venue's history/menu/known-for, public facts about anything visible). Phrase as a concrete research task.
  - "ask_user" — only the person can answer (who they were with, why they went, what they ordered if not visible, how it went). Phrase as a warm, specific question a friend would text.
- Do NOT answer anything. Plan only.

Return ONLY JSON: { "angles": [ { "question": "...", "kind": "searchable" } ], "anomalies": [ "..." ] }`;

const RESEARCH_SYSTEM = `You are a meticulous researcher preparing background for a personal conversation about someone's photos. You have Google Search. Verify, don't assume.

RELEVANCE GATE — apply before anything else:
- This is worth researching only if the moment centers on an EXPERIENCE or place of cultural interest: a restaurant/bar/café, a venue/concert/show/exhibition, a museum or artwork, a landmark or characterful neighborhood, a named person (chef, artist, performer), or travel.
- If the moment is a mundane everyday scene — a laptop/phone/device on a desk, a screenshot, groceries, a receipt, a generic home or office interior, a product shot — return EMPTY facts and hooks. Do NOT research consumer-electronics brands, warranties (e.g. AppleCare), generic product specs, or everyday-object trivia. Silence is correct for boring moments.
- A fact must be genuinely interesting: specific, a little obscure, and tied to something that clearly happened here — the kind of tidbit that makes a friend say "oh wow, I didn't know that." Generic encyclopedia background ("X was founded in 1990") only counts if it's surprising. When in doubt, leave it out.

Your job each pass:
1. Confirm or correct the venue. If text in the images shows the venue's own name (a menu/receipt/marquee/sign), trust THAT over GPS guesses, and search it to confirm what kind of place it is.
2. CRITICAL — if the venue is an entertainment venue (music hall, theater, comedy club, arena, stadium, nightclub, cinema) AND a date is known, you MUST search for the specific event that night: "who performed/played at {venue} on {date}", "{venue} {date} lineup/setlist/show". Identify the exact artist(s), tour, opener, or film and record it. This is usually the single most interesting fact about the moment — do not skip it.
3. Research what else is specific here: the venue's signature dishes/known-for, what any legible text refers to (posters, menus, signs — including exact dates/editions), and anything date/location relevant (events that day, openings, history).
4. Work the ANGLE CHECKLIST you are given: investigate every OPEN searchable angle this pass. For each, report an outcome — "resolved" (with the finding), "dead_end" (searched, nothing), or "unknowable" (search can't answer this). Coverage matters: an angle silently skipped is a failure.
5. Collect FACTS — for each, actually run a web search to confirm it, and cite the specific PUBLICATION domain you found it on (e.g. "brooklynvegan.com", "eater.com") — never "google.com". If search contradicts the analysis, say so. Never present a guess as a fact.
6. Write HOOKS: specific, conversation-worthy angles a curious friend could bring up ("you saw X on the opening night of their tour", "their tasting menu changes monthly").
7. List OPEN_QUESTIONS you couldn't resolve — a later pass will search them.

Respond with ONLY a JSON object:
{
  "venue": { "name": "...", "confidence": 0.0-1.0, "evidence": "one line" } or null,
  "facts": [ { "fact": "...", "source": "domain.com" } ],
  "hooks": [ "..." ],
  "open_questions": [ "..." ],
  "angle_updates": [ { "index": 0, "status": "resolved" | "dead_end" | "unknowable", "finding": "one line" } ]
}`;

function metadataBlock(input: ResearchInput): string[] {
  const lines: string[] = ['MOMENT DATA:'];
  if (input.venueName) lines.push(`Current venue attribution: ${input.venueName}`);
  if (input.venueCandidates.length) {
    lines.push(
      'Nearby place candidates (from GPS): ' +
        input.venueCandidates
          .filter((c) => c.name)
          .map((c) => `${c.name}${c.category ? ` (${c.category})` : ''}`)
          .join('; '),
    );
  }
  if (input.date) lines.push(`Date: ${input.date}`);
  if (input.lat != null && input.lng != null)
    lines.push(`Location: ${input.lat.toFixed(5)}, ${input.lng.toFixed(5)}`);
  lines.push(`Vision analysis: ${JSON.stringify(input.analysis)}`);
  if (input.dislikedFacts && input.dislikedFacts.length) {
    lines.push(
      '',
      "The user has flagged facts like these as NOT interesting — learn their taste and avoid this register (mundane, product/spec trivia, generic background):",
      ...input.dislikedFacts.slice(0, 12).map((f) => `- ${f}`),
    );
  }
  return lines;
}

function passPrompt(
  input: ResearchInput,
  prior: MomentResearch | null,
  angles: CuriosityAngle[],
): string {
  const lines = metadataBlock(input);

  const checklist = angles
    .map((a, i) =>
      a.kind === 'searchable'
        ? `[${i}] (${a.status}) ${a.question}${a.finding ? ` — prior finding: ${a.finding}` : ''}`
        : null,
    )
    .filter((s): s is string => !!s);
  if (checklist.length) {
    lines.push(
      '',
      'ANGLE CHECKLIST (investigate every OPEN one; report angle_updates by index):',
      ...checklist,
    );
  }

  if (prior) {
    lines.push(
      '',
      'PRIOR PASS RESULTS (build on these, do not repeat verified facts):',
      JSON.stringify({ venue: prior.venue, facts: prior.facts, hooks: prior.hooks }),
    );
    if (prior.open_questions.length) {
      lines.push('Also still open from last pass:', ...prior.open_questions.map((q) => `- ${q}`));
    }
  }
  return lines.join('\n');
}

interface AngleUpdate {
  index: number;
  status: 'resolved' | 'dead_end' | 'unknowable';
  finding?: string;
}

function parseAngleUpdates(text: string): AngleUpdate[] {
  try {
    const match = text.match(/\{[\s\S]*\}/);
    const parsed = match ? JSON.parse(match[0]) : {};
    if (!Array.isArray(parsed.angle_updates)) return [];
    return parsed.angle_updates
      .filter((u: unknown): u is Record<string, unknown> => !!u && typeof u === 'object')
      .map((u: Record<string, unknown>) => ({
        index: typeof u.index === 'number' ? u.index : -1,
        status: (['resolved', 'dead_end', 'unknowable'].includes(u.status as string)
          ? u.status
          : 'open') as AngleUpdate['status'],
        finding: typeof u.finding === 'string' ? u.finding : undefined,
      }))
      .filter((u: AngleUpdate) => u.index >= 0 && u.status !== ('open' as never));
  } catch {
    return [];
  }
}

function normalizeResearch(text: string, passes: number): MomentResearch {
  let parsed: Record<string, unknown> = {};
  try {
    const match = text.match(/\{[\s\S]*\}/);
    parsed = match ? JSON.parse(match[0]) : {};
  } catch {
    parsed = {};
  }
  const strArr = (v: unknown): string[] =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
  const facts: ResearchFact[] = Array.isArray(parsed.facts)
    ? parsed.facts
        .filter((f): f is Record<string, unknown> => !!f && typeof f === 'object')
        .map((f) => ({
          fact: typeof f.fact === 'string' ? f.fact : '',
          source: typeof f.source === 'string' ? f.source : undefined,
        }))
        .filter((f) => f.fact)
    : [];
  let venue: MomentResearch['venue'] = null;
  if (parsed.venue && typeof parsed.venue === 'object') {
    const v = parsed.venue as Record<string, unknown>;
    venue = {
      name: typeof v.name === 'string' && v.name.trim() ? v.name : null,
      confidence: typeof v.confidence === 'number' ? Math.min(1, Math.max(0, v.confidence)) : 0,
      evidence: typeof v.evidence === 'string' ? v.evidence : '',
    };
  }
  return {
    venue,
    facts,
    hooks: strArr(parsed.hooks),
    open_questions: strArr(parsed.open_questions),
    passes,
  };
}

function mergeResearch(prior: MomentResearch, next: MomentResearch): MomentResearch {
  const seen = new Set(prior.facts.map((f) => f.fact));
  return {
    // Later passes refine the venue; keep the higher-confidence answer.
    venue:
      next.venue && (!prior.venue || next.venue.confidence >= prior.venue.confidence)
        ? next.venue
        : prior.venue,
    facts: [...prior.facts, ...next.facts.filter((f) => !seen.has(f.fact))],
    hooks: [...new Set([...prior.hooks, ...next.hooks])],
    open_questions: next.open_questions, // only the still-open ones
    passes: next.passes,
  };
}

export class GeminiResearch {
  private ai = new GoogleGenAI({ apiKey: env.gemini.apiKey });

  /**
   * Divergent curiosity planning: SEES the photos + metadata, emits the angle
   * list (searchable vs ask_user) and anomalies. Higher temperature on purpose
   * — breadth before depth.
   */
  async planCuriosity(
    input: ResearchInput,
    images: ResearchImage[],
  ): Promise<{ angles: CuriosityAngle[]; anomalies: string[] }> {
    const parts: Array<Record<string, unknown>> = [
      { text: metadataBlock(input).join('\n') },
    ];
    for (const img of images.slice(0, 6)) {
      parts.push({ inlineData: { mimeType: img.mimeType, data: img.bytes.toString('base64') } });
    }
    const res = await this.ai.models.generateContent({
      model: env.gemini.visionModel,
      contents: [{ role: 'user', parts }],
      config: {
        systemInstruction: CURIOSITY_SYSTEM,
        responseMimeType: 'application/json',
        responseSchema: {
          type: 'object',
          properties: {
            angles: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  question: { type: 'string' },
                  kind: { type: 'string', enum: ['searchable', 'ask_user'] },
                },
                required: ['question', 'kind'],
              },
            },
            anomalies: { type: 'array', items: { type: 'string' } },
          },
          required: ['angles', 'anomalies'],
        } as unknown as object,
        temperature: 0.9,
      },
    });
    const o = (JSON.parse(res.text ?? '{}') ?? {}) as Record<string, unknown>;
    const angles: CuriosityAngle[] = Array.isArray(o.angles)
      ? o.angles
          .filter((a): a is Record<string, unknown> => !!a && typeof a === 'object')
          .map((a) => ({
            question: typeof a.question === 'string' ? a.question : '',
            kind: a.kind === 'ask_user' ? ('ask_user' as const) : ('searchable' as const),
            status: 'open' as const,
          }))
          .filter((a) => a.question)
          .slice(0, 12)
      : [];
    const anomalies = Array.isArray(o.anomalies)
      ? o.anomalies.filter((x): x is string => typeof x === 'string')
      : [];
    return { angles, anomalies };
  }

  /** One search-grounded pass. Search tools disallow JSON mode → parse prose. */
  private async onePass(
    input: ResearchInput,
    prior: MomentResearch | null,
    angles: CuriosityAngle[],
    passNum: number,
  ): Promise<{ result: MomentResearch; updates: AngleUpdate[]; sources: Array<{ title: string; uri: string }> }> {
    const res = await this.ai.models.generateContent({
      model: env.gemini.visionModel,
      contents: [{ role: 'user', parts: [{ text: passPrompt(input, prior, angles) }] }],
      config: {
        systemInstruction: RESEARCH_SYSTEM,
        tools: [{ googleSearch: {} }],
        temperature: 0.3,
      },
    });
    const text = res.text ?? '';
    return {
      result: normalizeResearch(text, passNum),
      updates: parseAngleUpdates(text),
      sources: extractSources(res),
    };
  }

  async research(input: ResearchInput, images: ResearchImage[] = []): Promise<MomentResearch> {
    // Phase 1: divergent planning (non-fatal — fall back to plan-free passes).
    let angles: CuriosityAngle[] = [];
    let anomalies: string[] = [];
    try {
      const plan = await this.planCuriosity(input, images);
      angles = plan.angles;
      anomalies = plan.anomalies;
    } catch (err) {
      console.warn(
        `[research] curiosity planning failed (non-fatal): ${err instanceof Error ? err.message : err}`,
      );
    }

    // Phase 2: convergent passes working the checklist.
    let result: MomentResearch | null = null;
    const sources: Array<{ title: string; uri: string }> = [];
    const seenSources = new Set<string>();
    for (let pass = 1; pass <= env.research.passes; pass++) {
      const { result: next, updates, sources: passSources } = await this.onePass(
        input,
        result,
        angles,
        pass,
      );
      for (const s of passSources) {
        if (!seenSources.has(s.uri)) {
          seenSources.add(s.uri);
          sources.push(s);
        }
      }
      for (const u of updates) {
        const a = angles[u.index];
        if (a && a.kind === 'searchable' && a.status === 'open') {
          a.status = u.status;
          if (u.finding) a.finding = u.finding;
        }
      }
      result = result ? mergeResearch(result, next) : next;
      const openSearchable = angles.some((a) => a.kind === 'searchable' && a.status === 'open');
      if (result.open_questions.length === 0 && !openSearchable) break;
    }

    const out: MomentResearch = result ?? {
      venue: null,
      facts: [],
      hooks: [],
      open_questions: [],
      passes: 0,
    };
    out.curiosity = angles.length ? angles : null;
    out.anomalies = anomalies;
    out.sources = sources;
    return out;
  }

  /**
   * Discover view: extract 2-4 learnable topics from a moment's analysis +
   * research (the venue, people/artists, artworks, dishes, events, history).
   */
  async extractTopics(
    analysis: MomentAnalysis,
    researchData: MomentResearch | null,
    venueName: string | null,
  ): Promise<Array<{ name: string; kind: string; blurb: string }>> {
    const prompt = [
      'From this photo-moment, list 1-3 TOPICS the person would genuinely want to learn',
      'more about. The bar is high — only topics tied to THEIR specific experience:',
      '- the named venue (restaurant, music hall, museum, bar)',
      '- a named person: the chef, the artist whose work they saw, the performer they watched',
      '- a named event (the show/exhibition/festival they attended)',
      '- the neighborhood, if it is genuinely characterful',
      '- a signature dish or named artwork they actually encountered',
      '',
      'EXCLUDE generic background subjects that would apply to any city photo: fire',
      'escapes, cast-iron architecture, brownstones, street furniture, generic food',
      'categories ("bread", "cocktails"), generic concepts ("tasting menus", "live music").',
      'Test: would a curious friend say "oh, tell me more about THAT"? If it is scenery',
      'rather than the experience, drop it. Fewer, better topics — zero is acceptable.',
      '',
      'Each topic needs:',
      '- name: the proper noun or concrete named subject',
      '- kind: place | person | artwork | food | event | history | other',
      '- blurb: ONE intriguing sentence grounded in the data below (no invention).',
      '',
      venueName ? `Venue: ${venueName}` : '',
      `Analysis: ${JSON.stringify(analysis)}`,
      researchData
        ? `Research: ${JSON.stringify({ facts: researchData.facts, hooks: researchData.hooks })}`
        : '',
    ].join('\n');

    const res = await this.ai.models.generateContent({
      model: env.gemini.chatModel,
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: 'object',
          properties: {
            topics: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  name: { type: 'string' },
                  kind: { type: 'string' },
                  blurb: { type: 'string' },
                },
                required: ['name', 'kind', 'blurb'],
              },
            },
          },
          required: ['topics'],
        } as unknown as object,
        temperature: 0.6,
      },
    });
    const o = (JSON.parse(res.text ?? '{}') ?? {}) as Record<string, unknown>;
    return Array.isArray(o.topics)
      ? o.topics
          .filter((t): t is Record<string, unknown> => !!t && typeof t === 'object')
          .map((t) => ({
            name: typeof t.name === 'string' ? t.name : '',
            kind: typeof t.kind === 'string' ? t.kind : 'other',
            blurb: typeof t.blurb === 'string' ? t.blurb : '',
          }))
          .filter((t) => t.name)
          .slice(0, 3)
      : [];
  }

  /** Search-grounded deep dive on a topic, in the user's personal context. */
  async deepDive(
    topic: { name: string; kind: string | null },
    context: { venueName: string | null; date: string | null; facts: string[] },
  ): Promise<DeepDive> {
    const prompt = [
      `Write a deep-dive about: ${topic.name}${topic.kind ? ` (${topic.kind})` : ''}.`,
      'Audience: one person who encountered this in their own life — personal context:',
      context.venueName ? `they were at ${context.venueName}` : '',
      context.date ? `on ${context.date}` : '',
      context.facts.length ? `Already known: ${context.facts.join(' | ')}` : '',
      '',
      'Use Google Search to verify and to find what is genuinely fascinating — history,',
      'connections, the stuff a great docent would tell you. Friendly and smart, not',
      'academic. Do not pad; every sentence should earn its place.',
      '',
      'Return ONLY JSON:',
      '{ "title": "...", "body_paragraphs": ["3-5 short paragraphs"],',
      '  "fun_facts": ["3-5 verified, surprising facts"],',
      '  "further_questions": ["2-3 things to explore next"] }',
    ]
      .filter(Boolean)
      .join('\n');

    // One retry: search-grounded calls occasionally return empty under load.
    let text = '';
    for (let attempt = 0; attempt < 2 && !text.trim(); attempt++) {
      const res = await this.ai.models.generateContent({
        model: env.gemini.visionModel,
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        config: { tools: [{ googleSearch: {} }], temperature: 0.5 },
      });
      text = res.text ?? '';
      if (!text.trim()) console.warn(`[research] empty deep-dive response (attempt ${attempt + 1})`);
    }
    // Models with search grounding often fence their JSON — strip fences, try a
    // direct parse, then fall back to the outermost-braces match.
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
    const arr = (v: unknown): string[] =>
      Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
    const body = arr(parsed.body_paragraphs);
    const proseFallback = cleaned.replace(/\{[\s\S]*\}/, '').trim();
    return {
      title: typeof parsed.title === 'string' && parsed.title ? parsed.title : topic.name,
      // Tolerate prose-only responses so the dive never comes back empty.
      body_paragraphs: body.length ? body : proseFallback ? [proseFallback] : [],
      fun_facts: arr(parsed.fun_facts),
      further_questions: arr(parsed.further_questions),
    };
  }
}

let _research: GeminiResearch | null = null;
export function research(): GeminiResearch {
  if (!_research) _research = new GeminiResearch();
  return _research;
}
