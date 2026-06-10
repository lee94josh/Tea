/**
 * Reasoning LLM — seed generation and the conversation engine. Two providers
 * behind one interface, picked at runtime:
 *   - Anthropic (Claude Opus) when ANTHROPIC_API_KEY is set
 *   - Gemini otherwise — so a single GEMINI_API_KEY runs the whole product
 * By this stage inputs are text + a few images, so any frontier model works.
 */

import Anthropic from '@anthropic-ai/sdk';
import { GoogleGenAI } from '@google/genai';
import type { MomentAnalysis, MomentResearch, Message, SeedDraft } from '@lookback/shared';
import { env } from '../env';

export interface SeedContext {
  analysis: MomentAnalysis;
  venueName?: string | null;
  date?: string | null;
  research?: MomentResearch | null;
}

export interface ConversationImage {
  base64: string;
  mimeType: string;
}

export interface ConversationContext {
  analysis: MomentAnalysis | null;
  venueName?: string | null;
  date?: string | null;
  research?: MomentResearch | null;
  images: ConversationImage[];
  history: Pick<Message, 'role' | 'content'>[];
}

export interface LlmClient {
  generateSeed(ctx: SeedContext): Promise<SeedDraft>;
  /** Streams the assistant reply token-by-token via the onDelta callback. */
  streamConversation(ctx: ConversationContext, onDelta: (text: string) => void): Promise<string>;
  /** Three fresh user-voice replies to keep the back-and-forth going. */
  suggestReplies(ctx: ConversationContext): Promise<string[]>;
}

// --- prompts -------------------------------------------------------------

const SEED_SYSTEM = `You turn a structured description of a photographed moment into the FIRST thing a perceptive friend would say about it.

Return JSON: { "openers": string[3], "suggested_replies": string[3], "quality_score": number }.

Rules:
- openers are THREE genuinely different ways to open this conversation — different angles, not rephrasings: e.g. one built on the most surprising verified research fact, one reacting to a specific visual detail, one more playful/curious take. The user picks their favorite.
- Every opener MUST reference concrete specifics from the moment (the venue, an activity, a notable detail, a food, legible text). A generic opener ("looks like you had fun!") is a failure. casual ≠ vague.
- If a Place is known, NEVER ask where it is — talk like you know the spot ("honeysuckle for the birthday? strong choice"). Asking "what spot is this?" when the place is given is a failure.
- If verified research facts/hooks are provided, ground at least one opener in the most interesting one — knowing something real about the place or moment is what makes this feel like magic. Don't ask about things the research already answers.
- Each opener is a first TEXT about this moment: all lowercase, casual like texting a friend, short (one or two lines), ending in one genuine, specific question. a reaction + question is great too ("wait is that the spot on bedford? what'd you get?"). no flattery, no assistant-speak, barely any emoji.
- suggested_replies are THREE genuine branches the user could pick, written as the USER texting back — also lowercase and casual:
    1. one that goes deeper into the moment,
    2. one that corrects or redirects ("nah it was actually..."),
    3. one tangent.
  They must NOT be three rephrasings of "tell me more."
- quality_score (0.0–1.0) reflects how specific and conversation-worthy this moment is. Thin/ambiguous moments score low.`;

export const CONVERSATION_SYSTEM = `you're a curious friend going through someone's photos with them, figuring out
together what they've been up to. you're genuinely nosy in the best way — not
interviewing them, just actually interested in the stuff you notice.

how you talk:
- all lowercase, casual, like texting a friend. loose punctuation is fine.
- keep it short — usually a line or two, like a real text.
- ask one good question at a time, never a list. make it specific to what's in
  the photo, something you'd actually want to know — not a generic "how was it?"
- it's fine to just react like a person ("wait is that—", "ok that looks unreal")
  instead of always asking.
- reference what's actually in the photos and what you know (the place, the date).
  notice concrete, specific details.
- you may be given verified background facts about the place/moment — drop them in
  naturally, like a friend who happens to know the spot. never ask where something
  is if the place is already known; never ask things the facts already answer.
- no flattery, no therapy-speak, no assistant-speak, and don't narrate what you're
  doing. barely any emoji — let the words carry it.
- let them lead; follow whatever they seem into.

you're not completing a task. you're someone good to text with.`;

const SUGGEST_SYSTEM = `given a texting conversation about someone's photos, write THREE short things the USER might text back next, in the user's own voice.

rules:
- all lowercase, casual, like texting. each under ~12 words.
- make them genuinely different directions: one that answers/goes deeper, one that pivots or pushes back, one tangent or new thread. not three rephrasings of the same thing.
- they reply to the LAST thing the friend said. don't repeat things already said.
- no quotes, no numbering, no emoji.
return JSON: { "replies": ["...", "...", "..."] }`;

function contextBlock(
  analysis: MomentAnalysis | null,
  venueName?: string | null,
  date?: string | null,
  research?: MomentResearch | null,
): string {
  const lines = ['Here is what I know about this moment:'];
  if (venueName) lines.push(`Place: ${venueName}`);
  if (date) lines.push(`Date: ${date}`);
  if (analysis) lines.push(`Analysis: ${JSON.stringify(analysis)}`);
  if (research && (research.facts.length || research.hooks.length)) {
    lines.push(
      'Verified research (from web search — safe to treat as known):',
      ...research.facts.map((f) => `- ${f.fact}${f.source ? ` [${f.source}]` : ''}`),
    );
    if (research.hooks.length) {
      lines.push('Conversation-worthy angles:', ...research.hooks.map((h) => `- ${h}`));
    }
    const askUser = (research.curiosity ?? []).filter(
      (a) => a.kind === 'ask_user' && a.status === 'open',
    );
    if (askUser.length) {
      lines.push(
        'Things only THEY can answer — these are the genuinely curious questions worth asking (one at a time, never as a list):',
        ...askUser.map((a) => `- ${a.question}`),
      );
    }
    if (research.anomalies?.length) {
      lines.push(
        'Surprising/out-of-place observations (great conversation material):',
        ...research.anomalies.map((s) => `- ${s}`),
      );
    }
    const v = research.verification;
    if (v) {
      if (v.confirmations.length)
        lines.push('Confirmed by looking at the photos again:', ...v.confirmations.map((s) => `- ${s}`));
      if (v.new_details.length)
        lines.push('Newly spotted in the photos:', ...v.new_details.map((s) => `- ${s}`));
      if (v.contradictions.length)
        lines.push(
          'CAUTION — photos contradict these claims (do not assert them):',
          ...v.contradictions.map((s) => `- ${s}`),
        );
    }
  }
  return lines.join('\n');
}

/** Render history as a transcript for the suggestion prompt ("you" = the user). */
function transcript(history: Pick<Message, 'role' | 'content'>[]): string {
  return history
    .map((m) => `${m.role === 'assistant' ? 'friend' : 'you'}: ${m.content}`)
    .join('\n');
}

function suggestPrompt(ctx: ConversationContext): string {
  return [
    contextBlock(ctx.analysis, ctx.venueName, ctx.date, ctx.research),
    '',
    'the conversation so far:',
    transcript(ctx.history),
    '',
    "write 3 things 'you' might text back next.",
  ].join('\n');
}

function normalizeReplies(text: string): string[] {
  try {
    const match = text.match(/\{[\s\S]*\}/);
    const parsed = match ? JSON.parse(match[0]) : {};
    if (Array.isArray(parsed.replies)) {
      return parsed.replies.filter((x: unknown): x is string => typeof x === 'string').slice(0, 3);
    }
  } catch {
    /* fall through */
  }
  return [];
}

export class AnthropicLlm implements LlmClient {
  private client = new Anthropic({ apiKey: env.anthropic.apiKey });

  async generateSeed(ctx: SeedContext): Promise<SeedDraft> {
    const res = await this.client.messages.create({
      model: env.anthropic.model,
      max_tokens: 1024,
      system: SEED_SYSTEM,
      messages: [
        {
          role: 'user',
          content: contextBlock(ctx.analysis, ctx.venueName, ctx.date, ctx.research),
        },
      ],
    });

    const text = res.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('');
    return normalizeSeed(text);
  }

  async streamConversation(
    ctx: ConversationContext,
    onDelta: (text: string) => void,
  ): Promise<string> {
    // The moment's context + images ride on the first user turn.
    const messages: Anthropic.MessageParam[] = [];

    const firstUserContent: Anthropic.ContentBlockParam[] = [
      { type: 'text', text: contextBlock(ctx.analysis, ctx.venueName, ctx.date, ctx.research) },
    ];
    for (const img of ctx.images.slice(0, 8)) {
      firstUserContent.push({
        type: 'image',
        source: {
          type: 'base64',
          media_type: img.mimeType as Anthropic.Base64ImageSource['media_type'],
          data: img.base64,
        },
      });
    }

    // Anthropic requires the first message to be from the user; we prepend the
    // context as a synthetic user turn, then replay history.
    messages.push({ role: 'user', content: firstUserContent });
    if (ctx.history.length === 0 || ctx.history[0]?.role !== 'assistant') {
      messages.push({ role: 'assistant', content: 'ok, looking through these now' });
    }
    for (const m of ctx.history) {
      messages.push({ role: m.role, content: m.content });
    }

    let full = '';
    const stream = this.client.messages.stream({
      model: env.anthropic.model,
      max_tokens: 1024,
      system: CONVERSATION_SYSTEM,
      messages,
    });
    stream.on('text', (t) => {
      full += t;
      onDelta(t);
    });
    await stream.finalMessage();
    return full;
  }

  async suggestReplies(ctx: ConversationContext): Promise<string[]> {
    const res = await this.client.messages.create({
      model: env.anthropic.model,
      max_tokens: 256,
      system: SUGGEST_SYSTEM,
      messages: [{ role: 'user', content: suggestPrompt(ctx) }],
    });
    const text = res.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('');
    return normalizeReplies(text);
  }
}

function normalizeSeed(text: string): SeedDraft {
  let parsed: Record<string, unknown> = {};
  try {
    // Tolerate prose-wrapped JSON.
    const match = text.match(/\{[\s\S]*\}/);
    parsed = match ? JSON.parse(match[0]) : {};
  } catch {
    parsed = {};
  }
  const replies = Array.isArray(parsed.suggested_replies)
    ? parsed.suggested_replies.filter((x): x is string => typeof x === 'string')
    : [];
  const score = typeof parsed.quality_score === 'number' ? parsed.quality_score : 0.5;
  // Prefer the three-opener shape; tolerate a legacy single `opener`.
  let openers = Array.isArray(parsed.openers)
    ? parsed.openers.filter((x): x is string => typeof x === 'string' && x.trim().length > 0)
    : [];
  if (openers.length === 0 && typeof parsed.opener === 'string' && parsed.opener.trim()) {
    openers = [parsed.opener];
  }
  return {
    openers: openers.slice(0, 3),
    suggested_replies: replies,
    quality_score: Math.min(1, Math.max(0, score)),
  };
}

// --- Gemini provider ------------------------------------------------------

const SEED_SCHEMA = {
  type: 'object',
  properties: {
    openers: { type: 'array', items: { type: 'string' } },
    suggested_replies: { type: 'array', items: { type: 'string' } },
    quality_score: { type: 'number' },
  },
  required: ['openers', 'suggested_replies', 'quality_score'],
} as const;

export class GeminiLlm implements LlmClient {
  private ai = new GoogleGenAI({ apiKey: env.gemini.apiKey });

  async generateSeed(ctx: SeedContext): Promise<SeedDraft> {
    const res = await this.ai.models.generateContent({
      model: env.gemini.visionModel, // seeds are background work: use the pro model
      contents: [
        { role: 'user', parts: [{ text: contextBlock(ctx.analysis, ctx.venueName, ctx.date, ctx.research) }] },
      ],
      config: {
        systemInstruction: SEED_SYSTEM,
        responseMimeType: 'application/json',
        responseSchema: SEED_SCHEMA as unknown as object,
        temperature: 0.8,
      },
    });
    return normalizeSeed(res.text ?? '');
  }

  async streamConversation(
    ctx: ConversationContext,
    onDelta: (text: string) => void,
  ): Promise<string> {
    // Context + images ride on a synthetic first user turn, mirroring the
    // Anthropic provider so history replays identically.
    const firstParts: Array<Record<string, unknown>> = [
      { text: contextBlock(ctx.analysis, ctx.venueName, ctx.date, ctx.research) },
    ];
    for (const img of ctx.images.slice(0, 8)) {
      firstParts.push({ inlineData: { mimeType: img.mimeType, data: img.base64 } });
    }

    const contents: Array<{ role: 'user' | 'model'; parts: Array<Record<string, unknown>> }> = [
      { role: 'user', parts: firstParts },
    ];
    if (ctx.history.length === 0 || ctx.history[0]?.role !== 'assistant') {
      contents.push({ role: 'model', parts: [{ text: 'ok, looking through these now' }] });
    }
    for (const m of ctx.history) {
      contents.push({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }],
      });
    }

    // Interactive path: if the preferred chat model is overloaded (Gemini flash
    // tiers 503 under "high demand" spikes), fall back through rolling aliases
    // instead of failing the user's message. Only models that error BEFORE
    // emitting a token are retried, so the user never sees duplicated text.
    const chain = [...new Set([env.gemini.chatModel, 'gemini-flash-latest', 'gemini-flash-lite-latest'])];
    let lastErr: unknown = null;

    for (const model of chain) {
      let full = '';
      try {
        const stream = await this.ai.models.generateContentStream({
          model,
          contents,
          config: { systemInstruction: CONVERSATION_SYSTEM, temperature: 0.9 },
        });
        for await (const chunk of stream) {
          const t = chunk.text;
          if (t) {
            full += t;
            onDelta(t);
          }
        }
        return full;
      } catch (err) {
        if (full.length > 0) throw err; // mid-stream failure: don't re-run
        lastErr = err;
        console.warn(`[llm] chat model ${model} unavailable, trying next: ${err instanceof Error ? err.message.slice(0, 120) : err}`);
      }
    }
    throw lastErr instanceof Error ? lastErr : new Error('all chat models unavailable');
  }

  async suggestReplies(ctx: ConversationContext): Promise<string[]> {
    // Same rolling-alias fallback as the chat stream: flash tiers 503 under load.
    const chain = [
      ...new Set([env.gemini.chatModel, 'gemini-flash-latest', 'gemini-flash-lite-latest']),
    ];
    let lastErr: unknown = null;
    for (const model of chain) {
      try {
        const res = await this.ai.models.generateContent({
          model,
          contents: [{ role: 'user', parts: [{ text: suggestPrompt(ctx) }] }],
          config: {
            systemInstruction: SUGGEST_SYSTEM,
            responseMimeType: 'application/json',
            responseSchema: {
              type: 'object',
              properties: { replies: { type: 'array', items: { type: 'string' } } },
              required: ['replies'],
            } as unknown as object,
            temperature: 0.9,
          },
        });
        return normalizeReplies(res.text ?? '');
      } catch (err) {
        lastErr = err;
      }
    }
    throw lastErr instanceof Error ? lastErr : new Error('all suggestion models unavailable');
  }
}

let _llm: LlmClient | null = null;
export function llm(): LlmClient {
  if (!_llm) {
    _llm = env.anthropic.apiKey ? new AnthropicLlm() : new GeminiLlm();
  }
  return _llm;
}
