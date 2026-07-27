/**
 * `npm run health-check`
 * Verifies configuration, storage access, database connectivity, and
 * (lightly) that the YouTube and Gemini credentials are well-formed,
 * without performing an actual upload or spending API quota. Checks the
 * storage backend currently selected via STORAGE_PROVIDER (local or
 * gdrive) and, for gdrive, that Drive OAuth credentials are valid too.
 */
import { env } from '../src/config/env.js';
import { getDatabase, closeDatabase } from '../src/database/connection.js';
import { createStorageProvider } from '../src/services/storage/storageProviderFactory.js';
import { createGoogleDriveOAuthClient } from '../src/services/storage/gdriveAuth.js';
import { createYouTubeOAuthClient } from '../src/services/youtube/youtubeAuth.js';

async function healthCheck(): Promise<Array<{ check: string; ok: boolean; detail?: string }>> {
  const results: Array<{ check: string; ok: boolean; detail?: string }> = [];

  console.log(`\nStorage Provider: ${env.STORAGE_PROVIDER === 'gdrive' ? 'Google Drive' : 'Local'}`);

  try {
    getDatabase();
    results.push({ check: 'Database connection', ok: true });
  } catch (error) {
    results.push({ check: 'Database connection', ok: false, detail: String(error) });
  }

  try {
    const storageProvider = createStorageProvider();
    await storageProvider.initialize();
    results.push({ check: 'Storage provider initialized', ok: true });
    await storageProvider.cleanup();
  } catch (error) {
    results.push({ check: 'Storage provider initialized', ok: false, detail: String(error) });
  }

  if (env.STORAGE_PROVIDER === 'gdrive') {
    try {
      const client = createGoogleDriveOAuthClient();
      await client.getAccessToken();
      results.push({ check: 'Google Drive OAuth credentials valid', ok: true });
    } catch (error) {
      results.push({ check: 'Google Drive OAuth credentials valid', ok: false, detail: String(error) });
    }
  }

  try {
    const client = createYouTubeOAuthClient();
    await client.getAccessToken();
    results.push({ check: 'YouTube OAuth credentials valid', ok: true });
  } catch (error) {
    results.push({ check: 'YouTube OAuth credentials valid', ok: false, detail: String(error) });
  }

  results.push({
    check: 'Gemini API key present',
    ok: env.GEMINI_API_KEY.length > 0,
  });

  console.log('\nHealth Check Results');
  console.log('=====================');
  for (const result of results) {
    console.log(`${result.ok ? '✅' : '❌'} ${result.check}${result.detail ? ` — ${result.detail}` : ''}`);
  }

  closeDatabase();
  const allOk = results.every((r) => r.ok)
  process.exit(allOk ? 0 : 1)
}

healthCheck().catch((error) => {
  console.error('Health check crashed:', error);
  process.exit(1);
});

module.exports = healthCheck
