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
import type { MomentAnalysis, MomentResearch, ResearchFact } from '@lookback/shared';
import { env } from '../env';

export interface ResearchInput {
  analysis: MomentAnalysis;
  venueName: string | null;
  venueCandidates: Array<{ name: string | null; category: string | null; address: string | null }>;
  date: string | null;
  lat: number | null;
  lng: number | null;
}

const RESEARCH_SYSTEM = `You are a meticulous researcher preparing background for a personal conversation about someone's photos. You have Google Search. Verify, don't assume.

Your job each pass:
1. Confirm or correct the venue (search the candidate names + location).
2. Research what's specific here: the venue's signature dishes/known-for, any text seen in the images (posters, menus, signs — find what they refer to, including exact dates/editions), and anything date/location relevant (events that day, openings, history).
3. Collect FACTS — each one verified via search, with the source domain. If search contradicts the analysis, say so. Never present a guess as a fact.
4. Write HOOKS: specific, conversation-worthy angles a curious friend could bring up ("their tasting menu changes monthly", "that poster is from the Dec 2012 shows").
5. List OPEN_QUESTIONS you couldn't resolve — a later pass will search them.

Respond with ONLY a JSON object:
{
  "venue": { "name": "...", "confidence": 0.0-1.0, "evidence": "one line" } or null,
  "facts": [ { "fact": "...", "source": "domain.com" } ],
  "hooks": [ "..." ],
  "open_questions": [ "..." ]
}`;

function passPrompt(input: ResearchInput, prior: MomentResearch | null): string {
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

  if (prior) {
    lines.push(
      '',
      'PRIOR PASS RESULTS (build on these, do not repeat verified facts):',
      JSON.stringify({ venue: prior.venue, facts: prior.facts, hooks: prior.hooks }),
      '',
      'THIS PASS: focus on resolving these open questions:',
      ...prior.open_questions.map((q) => `- ${q}`),
    );
  }
  return lines.join('\n');
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

  /** One search-grounded pass. Search tools disallow JSON mode → parse prose. */
  private async onePass(input: ResearchInput, prior: MomentResearch | null, passNum: number) {
    const res = await this.ai.models.generateContent({
      model: env.gemini.visionModel,
      contents: [{ role: 'user', parts: [{ text: passPrompt(input, prior) }] }],
      config: {
        systemInstruction: RESEARCH_SYSTEM,
        tools: [{ googleSearch: {} }],
        temperature: 0.3,
      },
    });
    return normalizeResearch(res.text ?? '', passNum);
  }

  async research(input: ResearchInput): Promise<MomentResearch> {
    let result: MomentResearch | null = null;
    for (let pass = 1; pass <= env.research.passes; pass++) {
      const next = await this.onePass(input, result, pass);
      result = result ? mergeResearch(result, next) : next;
      // Stop early if nothing left to chase.
      if (result.open_questions.length === 0) break;
    }
    return (
      result ?? { venue: null, facts: [], hooks: [], open_questions: [], passes: 0 }
    );
  }
}

let _research: GeminiResearch | null = null;
export function research(): GeminiResearch {
  if (!_research) _research = new GeminiResearch();
  return _research;
}
