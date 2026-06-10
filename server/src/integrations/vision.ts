/**
 * Vision integration — moment analysis (Requirement 2: image-recognition
 * quality). We feed ALL photos of a moment in ONE call with grounding context
 * (venue, date, location) and require structured JSON back.
 *
 * Default model: Gemini 3 Pro. Swap the model id via GEMINI_VISION_MODEL.
 */

import { GoogleGenAI } from '@google/genai';
import type { MomentAnalysis } from '@lookback/shared';
import { env } from '../env';

export interface MomentGrounding {
  venueName?: string | null;
  address?: string | null;
  date?: string | null; // human-readable
  lat?: number | null;
  lng?: number | null;
  /** Nearby place candidates from GPS — vision picks by visual evidence. */
  venueCandidates?: Array<{ name: string | null; category: string | null }>;
}

export interface VisionImage {
  bytes: Buffer;
  mimeType: string; // e.g. image/jpeg
}

export interface VisionClient {
  analyzeMoment(images: VisionImage[], grounding: MomentGrounding): Promise<MomentAnalysis>;
}

const ANALYSIS_SCHEMA = {
  type: 'object',
  properties: {
    title: { type: 'string' },
    summary: { type: 'string' },
    activities: { type: 'array', items: { type: 'string' } },
    foods: { type: 'array', items: { type: 'string' } },
    people_present: { type: 'integer' },
    text_in_images: { type: 'array', items: { type: 'string' } },
    mood: { type: 'string' },
    notable: { type: 'array', items: { type: 'string' } },
    venue_guess: {
      type: 'object',
      nullable: true,
      properties: {
        name: { type: 'string', nullable: true },
        confidence: { type: 'number' },
        reasoning: { type: 'string' },
      },
      required: ['name', 'confidence', 'reasoning'],
    },
  },
  required: [
    'title',
    'summary',
    'activities',
    'foods',
    'people_present',
    'text_in_images',
    'mood',
    'notable',
  ],
} as const;

function groundingText(g: MomentGrounding): string {
  const where = g.venueName
    ? `at ${g.venueName}${g.address ? ` (${g.address})` : ''}`
    : g.lat != null && g.lng != null
      ? `near ${g.lat.toFixed(4)}, ${g.lng.toFixed(4)}`
      : 'at an unknown location';
  const when = g.date ? ` on ${g.date}` : '';
  const lines = [
    `These photos were all taken ${where}${when}. They are from a single moment/event.`,
    'Describe what is happening as one coherent scene — not photo by photo.',
    'Anchor on the facts above and on what is actually visible. Do NOT invent a venue,',
    'people, or details you cannot see. If unsure, leave the relevant field empty.',
    'Read any legible text (signs, menus, labels) into text_in_images.',
  ];
  if (g.venueCandidates && g.venueCandidates.length > 0) {
    const list = g.venueCandidates
      .filter((c) => c.name)
      .map((c) => `${c.name}${c.category ? ` (${c.category})` : ''}`)
      .join('; ');
    lines.push(
      `GPS says these places are within ~120m: ${list}.`,
      'Judge from VISUAL evidence (food style, packaging, signage, interior, vibe) which',
      'one this moment most likely happened at, and fill venue_guess with your pick,',
      'a 0-1 confidence, and one line of reasoning. If none fit, set name to null.',
    );
  }
  lines.push('Return ONLY JSON matching the provided schema.');
  return lines.join(' ');
}

export class GeminiVision implements VisionClient {
  private ai = new GoogleGenAI({ apiKey: env.gemini.apiKey });

  async analyzeMoment(images: VisionImage[], grounding: MomentGrounding): Promise<MomentAnalysis> {
    const parts: Array<Record<string, unknown>> = [{ text: groundingText(grounding) }];
    for (const img of images) {
      parts.push({
        inlineData: { mimeType: img.mimeType, data: img.bytes.toString('base64') },
      });
    }

    const res = await this.ai.models.generateContent({
      model: env.gemini.visionModel,
      contents: [{ role: 'user', parts }],
      config: {
        responseMimeType: 'application/json',
        responseSchema: ANALYSIS_SCHEMA as unknown as object,
        temperature: 0.4,
      },
    });

    const text = res.text ?? '';
    return normalizeAnalysis(JSON.parse(text));
  }
}

function normalizeAnalysis(raw: unknown): MomentAnalysis {
  const o = (raw ?? {}) as Record<string, unknown>;
  const arr = (v: unknown): string[] =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];

  let venueGuess: MomentAnalysis['venue_guess'] = null;
  if (o.venue_guess && typeof o.venue_guess === 'object') {
    const g = o.venue_guess as Record<string, unknown>;
    venueGuess = {
      name: typeof g.name === 'string' && g.name.trim() ? g.name : null,
      confidence: typeof g.confidence === 'number' ? Math.min(1, Math.max(0, g.confidence)) : 0,
      reasoning: typeof g.reasoning === 'string' ? g.reasoning : '',
    };
  }

  return {
    title: typeof o.title === 'string' ? o.title : 'Untitled moment',
    summary: typeof o.summary === 'string' ? o.summary : '',
    activities: arr(o.activities),
    foods: arr(o.foods),
    people_present: typeof o.people_present === 'number' ? o.people_present : 0,
    text_in_images: arr(o.text_in_images),
    mood: typeof o.mood === 'string' ? o.mood : '',
    notable: arr(o.notable),
    venue_guess: venueGuess,
  };
}

let _vision: VisionClient | null = null;
export function vision(): VisionClient {
  if (!_vision) _vision = new GeminiVision();
  return _vision;
}
