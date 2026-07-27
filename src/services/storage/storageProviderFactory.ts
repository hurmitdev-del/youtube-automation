import { env } from '../../config/env.js';
import { logger } from '../../utils/logger.js';
import { GDriveStorageProvider } from './gdriveStorageProvider.js';
import { LocalStorageProvider } from './localStorageProvider.js';
import type { StorageProvider } from './storageProvider.js';

/**
 * Selects and constructs the active storage provider based on
 * STORAGE_PROVIDER. This is the ONLY place in the app that knows about
 * concrete provider classes — everything else depends on the
 * `StorageProvider` interface.
 */
export function createStorageProvider(): StorageProvider {
  if (env.STORAGE_PROVIDER === 'gdrive') {
    logger.info('Storage Provider: Google Drive');
    return new GDriveStorageProvider();
  }

  logger.info('Storage Provider: Local');
  return new LocalStorageProvider();
}
