import { test } from 'node:test';
import assert from 'node:assert/strict';

// This test needs a different STORAGE_PROVIDER (and gdrive credentials)
// than every other test file, so the env vars are set BEFORE importing
// anything that transitively loads src/config/env.ts. Node's test runner
// executes each test file in its own process, so this doesn't leak into
// other test files.
process.env.STORAGE_PROVIDER = 'gdrive';
process.env.GOOGLE_DRIVE_CLIENT_ID = 'test-gdrive-client-id';
process.env.GOOGLE_DRIVE_CLIENT_SECRET = 'test-gdrive-client-secret';
process.env.GOOGLE_DRIVE_REFRESH_TOKEN = 'test-gdrive-refresh-token';

await import('../testEnv.js');

const { createStorageProvider } = await import('../../src/services/storage/storageProviderFactory.js');
const { GDriveStorageProvider } = await import('../../src/services/storage/gdriveStorageProvider.js');

test('createStorageProvider selects GDriveStorageProvider when STORAGE_PROVIDER=gdrive', () => {
  const provider = createStorageProvider();
  assert.ok(provider instanceof GDriveStorageProvider);
});
