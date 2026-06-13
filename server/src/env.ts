/** Centralised, typed env access. Fails fast on what's truly required. */

// Auto-load a .env file if one exists (repo root or server/). Real deployments
// (Railway etc.) inject env vars directly and have no .env file.
for (const candidate of ['../.env', '.env']) {
  try {
    process.loadEnvFile(candidate);
    break;
  } catch {
    /* no .env there — fine */
  }
}

function req(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

function opt(name: string, fallback = ''): string {
  return process.env[name] ?? fallback;
}

function num(name: string, fallback: number): number {
  const v = process.env[name];
  if (!v) return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export const env = {
  appToken: req('APP_TOKEN'),
  databaseUrl: req('DATABASE_URL'),

  port: num('PORT', 8080),
  // Empty string = relative URLs, correct when the server serves the PWA itself
  // (single-origin deploy). Set absolute only for cross-origin dev (5173→8080).
  publicBaseUrl: opt('PUBLIC_BASE_URL', ''),
  webOrigin: opt('WEB_ORIGIN', 'http://localhost:5173'),

  storage: {
    driver: (opt('STORAGE_DRIVER', 'disk') as 'disk' | 'r2'),
    diskPath: opt('STORAGE_DISK_PATH', './.storage'),
    r2: {
      accountId: opt('R2_ACCOUNT_ID'),
      accessKeyId: opt('R2_ACCESS_KEY_ID'),
      secretAccessKey: opt('R2_SECRET_ACCESS_KEY'),
      bucket: opt('R2_BUCKET'),
    },
  },

  gemini: {
    apiKey: opt('GEMINI_API_KEY'),
    // Rolling alias — survives Google's preview-model retirements. Flash tier:
    // benchmarks put it within a few points of pro on image understanding
    // (MMMU-Pro parity) at a fraction of the quota pressure.
    visionModel: opt('GEMINI_VISION_MODEL', 'gemini-flash-latest'),
    // Interactive conversation: flash for instant-feeling streamed replies.
    chatModel: opt('GEMINI_CHAT_MODEL', 'gemini-3.5-flash'),
    embedModel: opt('GEMINI_EMBED_MODEL', 'gemini-embedding-001'),
    embedDim: num('EMBED_DIM', 1408),
  },

  research: {
    /** Search-grounded research passes per moment (0 disables the loop). */
    passes: num('RESEARCH_PASSES', 2),
  },

  anthropic: {
    apiKey: opt('ANTHROPIC_API_KEY'),
    model: opt('ANTHROPIC_MODEL', 'claude-opus-4-8'),
    // Topic worthiness judging: cheap classification against a rubric.
    judgeModel: opt('ANTHROPIC_JUDGE_MODEL', 'claude-haiku-4-5'),
    // Article writing: Opus for the sharpest, least-formulaic prose;
    // web_search grounds it.
    writerModel: opt('ANTHROPIC_WRITER_MODEL', 'claude-opus-4-8'),
  },

  articles: {
    /** Topics scoring below this are shelved, not written (0–100). */
    scoreMin: num('ARTICLE_SCORE_MIN', 50),
    /** One-time backlog cull target: total articles to keep after scoring. */
    cullTarget: num('ARTICLE_CULL_TARGET', 35),
    /** Articles are write-once: refuse to print unscored topics when the
     *  judge isn't configured (ARTICLE_REQUIRE_JUDGE=0 restores old behavior). */
    requireJudge: num('ARTICLE_REQUIRE_JUDGE', 1) !== 0,
  },

  googlePlaces: {
    apiKey: opt('GOOGLE_PLACES_API_KEY'),
  },

  vapid: {
    publicKey: opt('VAPID_PUBLIC_KEY'),
    privateKey: opt('VAPID_PRIVATE_KEY'),
    subject: opt('VAPID_SUBJECT', 'mailto:you@example.com'),
  },
} as const;

export type Env = typeof env;
