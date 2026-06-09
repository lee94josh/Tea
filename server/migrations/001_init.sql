-- Lookback initial schema. pgvector is OPTIONAL: embeddings are a v2 nicety
-- (sub-event splitting); the MVP pipeline never reads them. If the extension
-- isn't available on the host, we skip it and the photo_embeddings table —
-- everything else works. The vector dimension must match EMBED_DIM.

do $$ begin
  create extension if not exists vector;
exception when others then
  raise notice 'pgvector unavailable — skipping (embeddings disabled, MVP unaffected)';
end $$;

create extension if not exists "pgcrypto"; -- gen_random_uuid()

create table if not exists photos (
  id              uuid primary key default gen_random_uuid(),
  original_key    text not null,        -- object storage key for untouched original
  vision_key      text,                 -- high-res JPEG derivative for the VLM
  thumb_key       text,                 -- small thumbnail for UI
  mime_original   text not null,
  taken_at        timestamptz,          -- from EXIF DateTimeOriginal
  lat             double precision,     -- from EXIF GPS
  lng             double precision,
  camera_make     text,
  camera_model    text,
  width           int,
  height          int,
  is_screenshot   boolean default false,
  exif_raw        jsonb,                -- full extracted EXIF, for safety/debugging
  ingest_status   text default 'uploaded', -- uploaded|exif|geocoded|derived|embedded|done|error
  ingest_error    text,
  created_at      timestamptz default now()
);
create index if not exists photos_taken_at_idx on photos (taken_at);
create index if not exists photos_status_idx on photos (ingest_status);

create table if not exists venues (
  id              uuid primary key default gen_random_uuid(),
  photo_id        uuid references photos(id) on delete cascade,
  name            text,
  category        text,
  address         text,
  place_id        text,
  confidence      real,
  source          text
);
create index if not exists venues_photo_idx on venues (photo_id);

do $$ begin
  if exists (select 1 from pg_type where typname = 'vector') then
    create table if not exists photo_embeddings (
      photo_id    uuid primary key references photos(id) on delete cascade,
      embedding   vector(1408)
    );
  end if;
end $$;

create table if not exists moments (
  id              uuid primary key default gen_random_uuid(),
  title           text,
  started_at      timestamptz,
  ended_at        timestamptz,
  venue_name      text,
  lat             double precision,
  lng             double precision,
  analysis        jsonb,
  status          text default 'pending', -- pending|analyzed|seeded|error
  created_at      timestamptz default now()
);
create index if not exists moments_status_idx on moments (status);

create table if not exists moment_photos (
  moment_id       uuid references moments(id) on delete cascade,
  photo_id        uuid references photos(id) on delete cascade,
  primary key (moment_id, photo_id)
);

create table if not exists conversation_seeds (
  id                uuid primary key default gen_random_uuid(),
  moment_id         uuid references moments(id) on delete cascade,
  opener            text not null,
  suggested_replies jsonb not null,     -- string[]
  status            text default 'unused', -- unused|started|done
  quality_score     real,
  created_at        timestamptz default now()
);
create index if not exists seeds_status_score_idx on conversation_seeds (status, quality_score desc);

create table if not exists conversations (
  id              uuid primary key default gen_random_uuid(),
  seed_id         uuid references conversation_seeds(id),
  created_at      timestamptz default now()
);

create table if not exists messages (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid references conversations(id) on delete cascade,
  role            text not null,        -- user|assistant
  content         text not null,
  created_at      timestamptz default now()
);
create index if not exists messages_conv_idx on messages (conversation_id, created_at);

create table if not exists push_subscriptions (
  id              uuid primary key default gen_random_uuid(),
  subscription    jsonb not null,
  created_at      timestamptz default now()
);
