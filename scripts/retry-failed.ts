/**
 * `npm run retry-failed`
 *
 * Moves every file currently sitting in the `failed/` folder back into
 * `videos/` and resets its database status to 'pending' (if a record
 * exists), so the next scheduled run will attempt it again.
 *
 * This script operates on the local filesystem folders and is only
 * applicable when STORAGE_PROVIDER=local. When STORAGE_PROVIDER=gdrive,
 * requeue failed videos by moving them back to the "videos" folder in
 * Google Drive directly (drag-and-drop in the Drive UI, or move them
 * programmatically the same way GDriveStorageProvider does).
 */
import path from 'node:path';
import fs from 'fs-extra';
import { env } from '../src/config/env.js';
import { getDatabase, closeDatabase } from '../src/database/connection.js';
import { UploadRepository } from '../src/database/uploadRepository.js';
import { logger } from '../src/utils/logger.js';

async function main(): Promise<void> {
  if (env.STORAGE_PROVIDER === 'gdrive') {
    console.log(
      'STORAGE_PROVIDER=gdrive: this script only requeues local files.\n' +
        'To retry a failed video on Google Drive, move it from the "failed" folder\n' +
        'back into the "videos" folder in Drive — it will be picked up on the next run.',
    );
    return;
  }

  const failedDir = path.resolve(process.cwd(), env.FAILED_FOLDER);
  const videosDir = path.resolve(process.cwd(), env.VIDEOS_FOLDER);

  await fs.ensureDir(failedDir);
  await fs.ensureDir(videosDir);

  const db = getDatabase();
  const uploadRepository = new UploadRepository(db);

  const entries = await fs.readdir(failedDir);
  let requeued = 0;

  for (const entry of entries) {
    const sourcePath = path.join(failedDir, entry);
    const stat = await fs.stat(sourcePath).catch(() => null);
    if (!stat || !stat.isFile()) {
      continue;
    }

    const destinationPath = path.join(videosDir, entry);
    await fs.move(sourcePath, destinationPath, { overwrite: true });

    const record = uploadRepository.findByFilename(entry);
    if (record) {
      uploadRepository.updateStatus(record.id, 'pending', null);
    }

    logger.info({ file: entry }, 'Requeued failed upload for retry');
    requeued += 1;
  }

  console.log(`Requeued ${requeued} file(s) from failed/ back into videos/.`);
  closeDatabase();
}

main().catch((error) => {
  console.error('Failed to requeue failed uploads:', error);
  process.exit(1);
});
