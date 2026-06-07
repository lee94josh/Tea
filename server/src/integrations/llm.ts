/**
 * Reasoning LLM — seed generation and the conversation engine. Default: Claude
 * Opus via the Anthropic API. Swappable here in one place (by this stage inputs
 * are text + a few images, so any frontier model works).
 */

import Anthropic from '@anthropic-ai/sdk';
import type { MomentAnalysis, Message, SeedDraft } from '@lookback/shared';
import { env } from '../env';

export interface SeedContext {
  analysis: MomentAnalysis;
  venueName?: string | null;
  date?: string | null;
}

export interface ConversationImage {
  base64: string;
  mimeType: string;
}

export interface ConversationContext {
  analysis: MomentAnalysis | null;
  venueName?: string | null;
  date?: string | null;
  images: ConversationImage[];
  history: Pick<Message, 'role' | 'content'>[];
}

export interface LlmClient {
  generateSeed(ctx: SeedContext): Promise<SeedDraft>;
  /** Streams the assistant reply token-by-token via the onDelta callback. */
  streamConversation(ctx: ConversationContext, onDelta: (text: string) => void): Promise<string>;
}

// --- prompts -------------------------------------------------------------

const SEED_SYSTEM = `You turn a structured description of a photographed moment into the FIRST thing a perceptive friend would say about it.

Return JSON: { "opener": string, "suggested_replies": string[3], "quality_score": number }.

Rules:
- The opener MUST reference concrete specifics from the moment (the venue, an activity, a notable detail, a food, legible text). A generic opener ("looks like you had fun!") is a failure. casual ≠ vague.
- The opener is your first TEXT about this moment: all lowercase, casual like texting a friend, short (one or two lines), ending in one genuine, specific question. a reaction + question is great too ("wait is that the spot on bedford? what'd you get?"). no flattery, no assistant-speak, barely any emoji.
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
- no flattery, no therapy-speak, no assistant-speak, and don't narrate what you're
  doing. barely any emoji — let the words carry it.
- let them lead; follow whatever they seem into.

you're not completing a task. you're someone good to text with.`;

function contextBlock(
  analysis: MomentAnalysis | null,
  venueName?: string | null,
  date?: string | null,
): string {
  const lines = ['Here is what I know about this moment:'];
  if (venueName) lines.push(`Place: ${venueName}`);
  if (date) lines.push(`Date: ${date}`);
  if (analysis) lines.push(`Analysis: ${JSON.stringify(analysis)}`);
  return lines.join('\n');
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
          content: contextBlock(ctx.analysis, ctx.venueName, ctx.date),
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
      { type: 'text', text: contextBlock(ctx.analysis, ctx.venueName, ctx.date) },
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
  return {
    opener: typeof parsed.opener === 'string' && parsed.opener.trim() ? parsed.opener : '',
    suggested_replies: replies,
    quality_score: Math.min(1, Math.max(0, score)),
  };
}

let _llm: LlmClient | null = null;
export function llm(): LlmClient {
  if (!_llm) _llm = new AnthropicLlm();
  return _llm;
}
