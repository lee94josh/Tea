# Lookback

A photo-*conversation* PWA. Upload photos; the app analyzes them in the
background, then serves pre-generated, highly personalized conversation openers
grounded in what the photos actually show and where/when they were taken. Reply
via guided "choose-your-own-adventure" chips or free text.

Single-user MVP. Two non-negotiable requirements drive the design:

1. **Zero metadata loss** — GPS and timestamps are load-bearing. Originals
   upload untouched; EXIF is read from the original bytes (HEIC included) before
   any derivative is made; `/status` reports strip-rate honestly.
2. **Image-recognition quality** — moments (not single photos) are analyzed in
   one grounded VLM call (Gemini 3 Pro), fed venue/date/location so it anchors on
   facts, with high-res derivatives (~2048px).

## Layout (pnpm workspaces, TypeScript end-to-end)

```
lookback/
  shared/   # shared TS types + the canonical EXIF extractor
  server/   # Fastify API + in-process pg-boss worker
  web/      # Vite + React PWA
  scripts/  # day-0 metadata validation harness
```

## Build order (do not skip step 0)

### 0. Prove metadata survives on YOUR photos — before anything else

```bash
pnpm install
# Drop ~20 real iPhone photos (HEIC + JPEG, some with location) here:
#   scripts/test-assets/
pnpm check-exif                 # or: pnpm check-exif /path/to/photos
```

The harness runs the *exact* server-side EXIF path (`@lookback/shared/exif`) and
prints a per-file table plus a metadata-health summary. It **exits non-zero if any
file that has GPS in its bytes lost lat/lng**, so it doubles as a CI gate. Ship
nothing else until this is clean.

### 1+. The rest

```bash
# 1. Postgres + pgvector
docker compose up -d
cp .env.example .env            # fill in APP_TOKEN, API keys, VAPID, etc.

# 2. Migrate + run the server (API + worker in one process)
pnpm --filter @lookback/server migrate
pnpm dev:server

# 3. Run the web PWA
pnpm dev:web                    # http://localhost:5173
```

Then: enter `APP_TOKEN` in the web app → **Upload** photos → watch **Status**
(metadata health + pipeline) → **Talk** once seeds are ready.

## Environment

See `.env.example`. Required to boot: `APP_TOKEN`, `DATABASE_URL`. Required for
the full pipeline: `GEMINI_API_KEY` (vision + embeddings),
`GOOGLE_PLACES_API_KEY` (venues), `ANTHROPIC_API_KEY` (seeds + conversation),
and VAPID keys for push (`npx web-push generate-vapid-keys`). Storage defaults to
local disk (`STORAGE_DRIVER=disk`); set `STORAGE_DRIVER=r2` for Cloudflare R2.

## Pipeline (pg-boss jobs)

`upload → ingest:exif → {ingest:geocode, ingest:derivatives} → ingest:embed →`
`cluster:moments → analyze:moment → seed:generate → notify:push`

Per-photo jobs run in parallel; coordinators (`coordinator:check-cluster`,
`coordinator:check-notify`) fire the batch stages once per-item work completes.

## Models (swappable behind thin interfaces in `server/src/integrations/`)

- Vision / moment analysis: **Gemini 3 Pro**
- Multimodal embeddings: Gemini embedding model (`EMBED_DIM` must match the
  migration's `vector(N)`)
- Venues: **Google Places** (Nearby Search → Reverse Geocode fallback)
- Seeds + conversation: **Claude Opus**

## Deferred (v2+)

Embedding-based sub-event splitting, multi-user/auth, native app, Foursquare
venue upgrade, seed-ranking from engagement.
