/**
 * Imported for its side effects at the top of every test file, before any
 * module that transitively imports src/config/env.ts. Provides dummy
 * values for variables the Zod schema requires so tests don't need real
 * credentials.
 *
 * Uses `??=` so a test file that needs a specific value (e.g.
 * STORAGE_PROVIDER=gdrive) can set it *before* importing this file and
 * have that value respected.
 */
process.env.YOUTUBE_CLIENT_ID ??= 'test-youtube-client-id';
process.env.YOUTUBE_CLIENT_SECRET ??= 'test-youtube-client-secret';
process.env.YOUTUBE_REFRESH_TOKEN ??= 'test-youtube-refresh-token';
process.env.GEMINI_API_KEY ??= 'test-gemini-api-key';
process.env.NODE_ENV ??= 'test';
process.env.LOG_LEVEL ??= 'error';
process.env.DATABASE_PATH ??= './data/test-uploads.sqlite';

export {};
