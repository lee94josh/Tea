/**
 * @lookback/shared — types shared across the server and web PWA.
 *
 * These intentionally mirror the Postgres schema (see server/migrations) plus
 * the structured JSON contracts for the vision/seed steps of the pipeline.
 */

// ---------------------------------------------------------------------------
// Pipeline status enums
// ---------------------------------------------------------------------------

export const INGEST_STATUSES = [
  'uploaded',
  'exif',
  'geocoded',
  'derived',
  'embedded',
  'done',
  'error',
] as const;
export type IngestStatus = (typeof INGEST_STATUSES)[number];

export const MOMENT_STATUSES = ['pending', 'analyzed', 'seeded', 'error'] as const;
export type MomentStatus = (typeof MOMENT_STATUSES)[number];

export const SEED_STATUSES = ['unused', 'started', 'done'] as const;
export type SeedStatus = (typeof SEED_STATUSES)[number];

export type MessageRole = 'user' | 'assistant';

// ---------------------------------------------------------------------------
// Core entities (DB row shapes, camelCased for the API layer)
// ---------------------------------------------------------------------------

export interface Photo {
  id: string;
  originalKey: string;
  visionKey: string | null;
  thumbKey: string | null;
  mimeOriginal: string;
  takenAt: string | null; // ISO timestamp
  lat: number | null;
  lng: number | null;
  cameraMake: string | null;
  cameraModel: string | null;
  width: number | null;
  height: number | null;
  isScreenshot: boolean;
  ingestStatus: IngestStatus;
  createdAt: string;
}

export interface Venue {
  id: string;
  photoId: string;
  name: string | null;
  category: string | null;
  address: string | null;
  placeId: string | null;
  confidence: number | null;
  source: string | null;
}

export interface Moment {
  id: string;
  title: string | null;
  startedAt: string | null;
  endedAt: string | null;
  venueName: string | null;
  lat: number | null;
  lng: number | null;
  analysis: MomentAnalysis | null;
  status: MomentStatus;
  createdAt: string;
}

export interface ConversationSeed {
  id: string;
  momentId: string;
  opener: string;
  suggestedReplies: string[];
  status: SeedStatus;
  qualityScore: number | null;
  createdAt: string;
}

export interface Conversation {
  id: string;
  seedId: string | null;
  createdAt: string;
}

export interface Message {
  id: string;
  conversationId: string;
  role: MessageRole;
  content: string;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Structured model contracts
// ---------------------------------------------------------------------------

/** Output of the `analyze:moment` step (Gemini, structured JSON). */
export interface MomentAnalysis {
  title: string;
  summary: string;
  activities: string[];
  foods: string[];
  people_present: number;
  text_in_images: string[];
  mood: string;
  notable: string[];
}

/** Output of the `seed:generate` step (reasoning LLM). */
export interface SeedDraft {
  opener: string;
  suggested_replies: string[];
  quality_score: number; // 0.0 - 1.0
}

// ---------------------------------------------------------------------------
// API request/response shapes
// ---------------------------------------------------------------------------

export interface UploadResult {
  batchId: string;
  accepted: Array<{ id: string; filename: string }>;
  rejected: Array<{ filename: string; reason: string }>;
}

/** Honest metadata-health report — Requirement 1 observability. */
export interface MetadataHealth {
  totalPhotos: number;
  withGps: number;
  withTimestamp: number;
  withNeither: number;
  gpsPct: number;
  timestampPct: number;
  screenshots: number;
}

export interface StatusReport {
  metadata: MetadataHealth;
  byIngestStatus: Record<IngestStatus, number>;
  moments: {
    total: number;
    analyzed: number;
  };
  seeds: {
    total: number;
    ready: number; // unused seeds available to serve
  };
  pipelineComplete: boolean;
}

/** A photo reference returned to the UI, with signed/served URLs. */
export interface PhotoRef {
  id: string;
  thumbUrl: string | null;
  visionUrl: string | null;
  takenAt: string | null;
}

/** `GET /seeds/next` payload. */
export interface NextSeed {
  seed: ConversationSeed;
  moment: Moment;
  photos: PhotoRef[];
}

/** `POST /seeds/:id/start` payload. */
export interface StartedConversation {
  conversation: Conversation;
  opener: string;
  suggestedReplies: string[];
  moment: Moment;
  photos: PhotoRef[];
}

export interface ConversationHistory {
  conversation: Conversation;
  messages: Message[];
  moment: Moment | null;
  photos: PhotoRef[];
}
