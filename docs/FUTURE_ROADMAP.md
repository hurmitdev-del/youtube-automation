# Future Roadmap

Ideas for extending `youtube-ai-automation`, roughly grouped by theme. None
of these are implemented yet; each is designed to slot into the existing
architecture (see [FLOW.md](FLOW.md#4-extension-points)) without a rewrite.

## Storage sources

- ~~**Google Drive integration**~~ — ✅ implemented. Set
  `STORAGE_PROVIDER=gdrive`; see [SETUP.md](SETUP.md#google-drive-storage-setup).
- **Dropbox integration** — same idea as Google Drive, via the Dropbox
  API. Implement the `StorageProvider` interface
  (`src/services/storage/storageProvider.ts`) the same way
  `GDriveStorageProvider` does, and add a branch in
  `storageProviderFactory.ts`.

## Notifications

- **Telegram notifications** — post upload success/failure summaries to a
  Telegram chat via a bot.
- **Discord notifications** — post to a Discord channel via a webhook.

## Content enhancement

- **Automatic thumbnail generation** — generate a thumbnail image (e.g. via
  an image model or frame extraction) and feed it into the already-wired
  `YouTubeService.uploadThumbnail()`.
- **Automatic subtitles** — generate and upload caption tracks via the
  YouTube Captions API.
- **Auto translation / multi-language uploads** — translate titles,
  descriptions, and subtitles into multiple languages and upload localized
  metadata.

## Analytics & intelligence

- **Analytics dashboard** — a small web UI reading from the `uploads` table
  plus the YouTube Analytics API to show performance over time.
- **YouTube Analytics API integration** — pull view counts, watch time, and
  retention per upload back into SQLite for reporting.
- **Google Trends integration** — inform metadata generation with trending
  topics relevant to the channel's niche.
- **Trend analysis** — surface which title/hashtag patterns correlate with
  better performance over time, feeding back into the Gemini prompt.

## Scale

- **Multiple channels** — parameterize `YouTubeService` and the pipeline per
  channel, run several pipelines concurrently or on independent schedules.

## AI providers

- **OpenAI support** — implement a `generateMetadata` provider backed by the
  OpenAI API as an alternative to Gemini.
- **Claude support** — same idea, backed by the Anthropic API.

Because `UploadPipeline` depends only on the `generateMetadata(filename):
Promise<VideoMetadata>` shape for AI providers, and only on the
`StorageProvider` interface for storage, any of these can be added as a new
class in `src/services/` and injected without touching the rest of the app.
