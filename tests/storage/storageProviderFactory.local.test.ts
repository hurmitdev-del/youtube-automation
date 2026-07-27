import { test } from 'node:test';
import assert from 'node:assert/strict';
import '../testEnv.js';
import { createStorageProvider } from '../../src/services/storage/storageProviderFactory.js';
import { LocalStorageProvider } from '../../src/services/storage/localStorageProvider.js';

test('createStorageProvider defaults to LocalStorageProvider when STORAGE_PROVIDER is unset', () => {
  const provider = createStorageProvider();
  assert.ok(provider instanceof LocalStorageProvider);
});
