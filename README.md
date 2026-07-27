# youtube-ai-automation

A production-grade Node.js + TypeScript background worker that watches a local
folder for YouTube Shorts, generates SEO-optimized metadata with Google
Gemini, uploads the video via the YouTube Data API v3, and keeps a full
history of everything it does in SQLite.

Clone it, fill in a `.env` file, run one command — it works.

---

## Features

- 📁 **Folder watching** — polls a `videos/` folder on a configurable cron
  schedule and always processes the oldest file first.
- 🔌 **Pluggable storage backend** — choose `local` (the default filesystem
  folders) or `gdrive` (Google Drive folders) via `STORAGE_PROVIDER`. The
  upload pipeline talks only to a `StorageProvider` interface, so switching
  backends requires no code changes — just configuration.
- 🤖 **AI metadata generation** — Google Gemini produces a title, description,
  15 hashtags, 20 tags, category, pinned comment suggestion, target audience,
  suggested upload time, and reasoning for every video, validated with Zod.
- ⬆️ **YouTube upload** — uploads via the official `googleapis` client with
  support for private, public, unlisted, and scheduled publishing.
- 🗃️ **SQLite history** — every video's lifecycle (pending → generating
  metadata → uploading → uploaded/failed) is tracked with `better-sqlite3`.
- 🪵 **Structured logging** — every step is logged with `pino`, both to the
  console and to `logs/app.log`.
- 🔁 **Resilience** — exponential backoff retries for transient failures,
  graceful handling of YouTube quota errors, duplicate detection via file
  hashing, and a `retry-failed` script to requeue failed uploads.
- 🧱 **Clean architecture** — layered into config / database / services /
  scheduler / utils / types, with dependency injection so each service can be
  tested or swapped independently. Strict TypeScript, no `any`.

## Architecture

```
videos/ (local)          Scheduler (node-cron)     Gemini metadata     Zod validation
   or Drive "videos" ─┐         ↓                         ↓                  ↓
                       └──> StorageProvider ──────────────────────────> YouTube upload
                                                                                ↓
                                                                       SQLite (uploads table)
                                                                                ↓
                                                          Move file → uploaded/ or failed/
                                                          (local folder, or Drive folder)
```

Storage is provider-agnostic: `STORAGE_PROVIDER=local` (default) uses the
filesystem folders described below; `STORAGE_PROVIDER=gdrive` uses Google
Drive folders of the same names instead. The pipeline itself never knows
which one is active — see [docs/FLOW.md](docs/FLOW.md#storage-abstraction).

See [docs/FLOW.md](docs/FLOW.md) for a detailed, diagrammed walkthrough of
every module and extension point.

## Folder Structure

```
youtube-ai-automation/
  src/
    config/       # Environment schema + validated config (Zod)
    database/     # SQLite connection, schema, repository
    services/
      youtube/    # OAuth2 client + YouTube Data API upload logic
      gemini/     # Gemini REST client + metadata schema
      storage/    # StorageProvider interface, local + Google Drive implementations, factory
    scheduler/     # node-cron wiring + the end-to-end pipeline
    utils/         # Logger, retry helper, file hashing
    types/         # Shared domain types and typed error classes
    prompts/       # Gemini prompt templates
  scripts/         # generate-refresh-token, health-check, retry-failed
  docs/            # FLOW.md, SETUP.md, API_KEYS.md, FUTURE_ROADMAP.md
  videos/          # Drop new videos here
  uploaded/         # Successfully uploaded videos are moved here
  failed/          # Failed uploads are moved here
  logs/            # app.log
  .env.example
```

## Installation

Requires Node.js 20+ (LTS).

```bash
git clone <your-fork-url> youtube-ai-automation
cd youtube-ai-automation
npm install
cp .env.example .env
```

Then follow [docs/SETUP.md](docs/SETUP.md) to obtain and fill in your YouTube
and Gemini credentials — it assumes zero prior Google Cloud experience.

## Configuration

All configuration is environment-driven — nothing is hardcoded. See
[.env.example](.env.example) for the full list of variables and
[docs/API_KEYS.md](docs/API_KEYS.md) for exactly where each value comes from.
Configuration is validated at startup with Zod; the app refuses to start with
missing or malformed values and tells you exactly what's wrong.

### Storage backend

Set `STORAGE_PROVIDER` to choose where videos live:

- `local` (default) — the `videos/`, `uploaded/`, `failed/` folders on disk.
  Behaves exactly as it always has.
- `gdrive` — folders of the same names in Google Drive. Videos are
  downloaded to a temporary local file only for the duration of processing
  and deleted immediately after; the server never permanently stores video
  content. See [docs/SETUP.md](docs/SETUP.md#google-drive-storage-setup)
  for the full walkthrough.

Both backends implement the same `StorageProvider` interface
(`src/services/storage/storageProvider.ts`), so the upload pipeline and
every other part of the app work identically regardless of which is active.

## Running

```bash
# Apply the database schema (also happens automatically on first run)
npm run migrate

# Verify configuration, folders, database, and credentials without uploading
npm run health-check

# Dry run: generates metadata and logs what WOULD happen, uploads nothing
npm run dry-run

# Development (auto-restarts on file changes)
npm run dev

# Production
npm run build
npm start
```

Drop a `.mp4`, `.mov`, or `.mkv` file into `videos/` and it will be picked up
on the next scheduled run (`CRON_EXPRESSION` in `.env`, default every 30
minutes), processed one video at a time, and moved to `uploaded/` or
`failed/` depending on the outcome.

### Development

- `npm run dev` — runs with `tsx watch` for fast iteration.
- `npm run lint` / `npm run lint:fix` — ESLint with strict TypeScript rules.
- `npm run format` — Prettier.
- `npm run typecheck` — `tsc --noEmit`.
- `npm test` — runs the test suite (Node's built-in test runner via `tsx`).
  Covers both storage providers: folder/file discovery, moving files,
  duplicate/invalid-reference handling, temp file cleanup, and provider
  selection. Local-provider tests run against real temp folders; the
  Google Drive provider tests run against an in-memory fake Drive client,
  so no real credentials or network access are needed to run them.

### Production

- `npm run build` compiles to `dist/`.
- `npm start` runs the compiled worker.
- Run it under a process manager (`pm2`, `systemd`, etc.) so it restarts on
  crash — the app itself never throws unhandled exceptions during normal
  operation, but process supervision is still good practice for a long-running
  worker.
- `SIGINT`/`SIGTERM` trigger a graceful shutdown (stops the cron scheduler,
  closes the database cleanly).

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| App exits immediately with "Invalid environment configuration" | Missing/malformed `.env` value | Check the printed list of issues; compare against `.env.example` |
| `YouTube API quota exceeded` | Daily quota (10,000 units/day by default) exhausted | Wait for the daily reset (midnight Pacific Time) or request a quota increase in Google Cloud Console |
| `No refresh token was returned` when running `generate-refresh-token` | You already authorized this app before | Revoke access at https://myaccount.google.com/permissions and re-run the script |
| Video sits in `videos/` and never uploads | Wrong file extension, or cron hasn't fired yet | Only `.mp4`, `.mov`, `.mkv` are picked up; check `CRON_EXPRESSION` and `logs/app.log` |
| Video keeps moving to `failed/` | Check `logs/app.log` and the `error` column in the `uploads` table for the exact cause | Run `npm run retry-failed` after fixing the underlying issue |
| Gemini returns invalid JSON / validation errors | Rare model formatting issue | The app retries automatically; check `logs/app.log` for the raw response if it persists |
| `Invalid environment configuration` mentioning `GOOGLE_DRIVE_*` | `STORAGE_PROVIDER=gdrive` but Drive credentials are missing | Fill in `GOOGLE_DRIVE_CLIENT_ID`/`GOOGLE_DRIVE_CLIENT_SECRET`/`GOOGLE_DRIVE_REFRESH_TOKEN` — see [docs/SETUP.md](docs/SETUP.md#google-drive-storage-setup) |
| Google Drive folders keep getting re-created | `GOOGLE_DRIVE_FOLDER_*` left blank and folder lookup is failing | Check Drive OAuth scope includes `drive` access; or set the folder IDs explicitly in `.env` |
| Video stuck after "downloaded from Google Drive" | YouTube upload step failed | Check `logs/app.log` for the underlying YouTube error; the Drive file is still moved to `failed/` and the local temp copy is cleaned up automatically |

## FAQ

**Does this generate the actual video content?**
No. You provide the video files; the app only generates metadata (title,
description, tags, etc.) and handles uploading.

**Can I upload more than one video per run?**
Yes, set `MAX_UPLOADS_PER_RUN` in `.env`, though the default of 1 is
recommended to stay well within YouTube's daily quota.

**Does it generate thumbnails?**
Not yet — `uploadThumbnail()` is a working, wired-up placeholder ready for a
thumbnail-generation pipeline. See [docs/FUTURE_ROADMAP.md](docs/FUTURE_ROADMAP.md).

**Is my API key ever logged or committed?**
No. All credentials come from `.env` (gitignored) and are never logged or
written to the database.

**Can I run this on a schedule other than cron intervals, e.g. specific times?**
Yes — `CRON_EXPRESSION` accepts any standard 5-field cron syntax, e.g.
`0 9,17 * * *` for 9am and 5pm daily.

**Can I use Google Drive instead of a local folder?**
Yes — set `STORAGE_PROVIDER=gdrive` and fill in the Google Drive credentials
in `.env`. See [docs/SETUP.md](docs/SETUP.md#google-drive-storage-setup).
Local-storage behavior is completely unaffected either way.
