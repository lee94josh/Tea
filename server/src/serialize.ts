/** Row → API-shape mappers, plus signed/served photo URL building. */

import type { Conversation, Message, Moment, ConversationSeed, PhotoRef } from '@lookback/shared';
import { storage } from './storage';

export function toMoment(r: Record<string, unknown>): Moment {
  return {
    id: r.id as string,
    title: (r.title as string) ?? null,
    startedAt: r.started_at ? new Date(r.started_at as string).toISOString() : null,
    endedAt: r.ended_at ? new Date(r.ended_at as string).toISOString() : null,
    venueName: (r.venue_name as string) ?? null,
    lat: (r.lat as number) ?? null,
    lng: (r.lng as number) ?? null,
    analysis: (r.analysis as Moment['analysis']) ?? null,
    research: (r.research as Moment['research']) ?? null,
    status: r.status as Moment['status'],
    createdAt: new Date(r.created_at as string).toISOString(),
  };
}

export function toSeed(r: Record<string, unknown>): ConversationSeed {
  const replies = r.suggested_replies;
  return {
    id: r.id as string,
    momentId: r.moment_id as string,
    opener: r.opener as string,
    suggestedReplies: Array.isArray(replies) ? (replies as string[]) : [],
    status: r.status as ConversationSeed['status'],
    qualityScore: (r.quality_score as number) ?? null,
    createdAt: new Date(r.created_at as string).toISOString(),
  };
}

export function toConversation(r: Record<string, unknown>): Conversation {
  return {
    id: r.id as string,
    seedId: (r.seed_id as string) ?? null,
    createdAt: new Date(r.created_at as string).toISOString(),
  };
}

export function toMessage(r: Record<string, unknown>): Message {
  return {
    id: r.id as string,
    conversationId: r.conversation_id as string,
    role: r.role as Message['role'],
    content: r.content as string,
    createdAt: new Date(r.created_at as string).toISOString(),
  };
}

/** Build a UI photo reference with resolved (signed/served) URLs. */
export async function toPhotoRef(r: {
  id: string;
  thumb_key: string | null;
  vision_key: string | null;
  taken_at: string | null;
}): Promise<PhotoRef> {
  const s = storage();
  return {
    id: r.id,
    thumbUrl: r.thumb_key ? await s.url(r.thumb_key) : null,
    visionUrl: r.vision_key ? await s.url(r.vision_key) : null,
    takenAt: r.taken_at ? new Date(r.taken_at).toISOString() : null,
  };
}
