import crypto from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import fs from 'fs-extra';
import { google, type drive_v3 } from 'googleapis';
import type { OAuth2Client } from 'google-auth-library';
import { env } from '../../config/env.js';
import { StorageError } from '../../types/index.js';
import { logger } from '../../utils/logger.js';
import { withRetry } from '../../utils/retry.js';
import { createGoogleDriveOAuthClient } from './gdriveAuth.js';
import type { PendingVideo, StorageProvider } from './storageProvider.js';

export const FOLDER_MIME_TYPE = 'application/vnd.google-apps.folder';
const SUPPORTED_EXTENSIONS = new Set(['.mp4', '.mov', '.mkv']);
const DRIVE_FILE_FIELDS = 'id, name, size, createdTime, mimeType, parents';

interface DriveFolderIds {
  videos: string;
  uploaded: string;
  failed: string;
}

/** Transient Drive API failures (rate limiting, server errors) are worth retrying. */
function isTransientDriveError(error: unknown): boolean {
  const status =
    (error as { code?: number }).code ?? (error as { response?: { status?: number } }).response?.status;
  return typeof status === 'number' && [429, 500, 502, 503, 504].includes(status);
}

function isSupportedVideoFile(file: drive_v3.Schema$File): boolean {
  if (file.mimeType?.startsWith('video/')) {
    return true;
  }
  const extension = path.extname(file.name ?? '').toLowerCase();
  return SUPPORTED_EXTENSIONS.has(extension);
}

/**
 * Google Drive-backed implementation of StorageProvider. Videos live in a
 * "videos" folder on Drive; uploaded/failed files are moved (re-parented)
 * into sibling "uploaded"/"failed" folders. Videos are downloaded to a
 * local temp directory only for the duration of processing and are never
 * permanently stored on the server.
 */
export class GDriveStorageProvider implements StorageProvider {
  private readonly drive: drive_v3.Drive;
  private readonly tempDir: string;
  private readonly tempPathByFileId = new Map<string, string>();
  private folderIds: DriveFolderIds | null = null;

  constructor(authClient?: OAuth2Client, driveClient?: drive_v3.Drive) {
    this.drive = driveClient ?? google.drive({ version: 'v3', auth: authClient ?? createGoogleDriveOAuthClient() });
    this.tempDir = path.join(os.tmpdir(), 'youtube-ai-automation-gdrive');
  }

  async initialize(): Promise<void> {
    await fs.ensureDir(this.tempDir);

    this.folderIds = {
      videos: await this.resolveFolder('videos', env.GOOGLE_DRIVE_FOLDER_VIDEOS),
      uploaded: await this.resolveFolder('uploaded', env.GOOGLE_DRIVE_FOLDER_UPLOADED),
      failed: await this.resolveFolder('failed', env.GOOGLE_DRIVE_FOLDER_FAILED),
    };

    logger.info({ folderIds: this.folderIds }, 'Google Drive storage initialized');
  }

  async listPendingVideos(): Promise<PendingVideo[]> {
    const files = await this.listAllFilesInFolder(this.requireFolderIds().videos);

    return files.filter(isSupportedVideoFile).map((file) => ({
      id: this.requireField(file.id, 'id'),
      filename: this.requireField(file.name, 'name'),
      sizeBytes: file.size ? Number(file.size) : 0,
      createdAt: file.createdTime ? new Date(file.createdTime) : new Date(),
    }));
  }

  async getNextVideo(): Promise<PendingVideo | null> {
    const videos = await this.listPendingVideos();
    if (videos.length === 0) {
      return null;
    }
    return videos.reduce((oldest, current) =>
      current.createdAt.getTime() < oldest.createdAt.getTime() ? current : oldest,
    );
  }

  async downloadVideo(video: PendingVideo): Promise<string> {
    await fs.ensureDir(this.tempDir);
    logger.info({
      tempDir: this.tempDir,
      exists: await fs.pathExists(this.tempDir),
    });

    const destination = path.join(
      this.tempDir,
      `${crypto.randomUUID()}-${video.filename}`,
    );

    await withRetry(() => this.downloadToPath(video.id, destination), {
      retries: 3,
      label: `Google Drive download of ${video.filename}`,
      shouldRetry: isTransientDriveError,
    });

    this.tempPathByFileId.set(video.id, destination);
    logger.debug({ file: video.filename, destination }, 'Video downloaded from Google Drive');
    return destination;
  }

  async moveToUploaded(video: PendingVideo): Promise<void> {
    await this.moveFileToFolder(video, this.requireFolderIds().uploaded);
  }

  async moveToFailed(video: PendingVideo): Promise<void> {
    await this.moveFileToFolder(video, this.requireFolderIds().failed);
  }

  async deleteTempFile(video: PendingVideo): Promise<void> {
    const tempPath = this.tempPathByFileId.get(video.id);
    if (!tempPath) {
      return;
    }

    await fs.remove(tempPath).catch((error: unknown) => {
      logger.warn({ file: video.filename, err: error }, 'Failed to delete local temp file');
    });
    this.tempPathByFileId.delete(video.id);
  }

  /** Removes the files from temp directory used for Drive downloads. */
  async cleanup(): Promise<void> {
    for (const file of this.tempPathByFileId.values()) {
      await fs.remove(file).catch((error: unknown) => {
      logger.warn({ err: error }, 'Failed to remove Google Drive temp files');
    });
    }
    this.tempPathByFileId.clear();
  }

  // ---------------------------------------------------------------------
  // Internal helpers
  // ---------------------------------------------------------------------

  private requireFolderIds(): DriveFolderIds {
    if (!this.folderIds) {
      throw new StorageError('Google Drive storage provider used before initialize()');
    }
    return this.folderIds;
  }

  private requireField<T>(value: T | null | undefined, field: string): T {
    if (value === null || value === undefined) {
      throw new StorageError(`Google Drive file is missing required field "${field}"`);
    }
    return value;
  }

  /** Finds a folder by name at Drive root, or creates it if it doesn't exist. */
  private async resolveFolder(name: string, configuredId: string): Promise<string> {
    if (configuredId) {
      return configuredId;
    }

    try {
      const existing = await withRetry(
        () =>
          this.drive.files.list({
            q: `mimeType='${FOLDER_MIME_TYPE}' and name='${name}' and trashed=false`,
            fields: 'files(id, name)',
            spaces: 'drive',
          }),
        { retries: 3, label: `Google Drive folder lookup (${name})`, shouldRetry: isTransientDriveError },
      );

      const found = existing.data.files?.[0]?.id;
      if (found) {
        return found;
      }

      const created = await withRetry(
        () =>
          this.drive.files.create({
            requestBody: { name, mimeType: FOLDER_MIME_TYPE },
            fields: 'id',
          }),
        { retries: 3, label: `Google Drive folder creation (${name})`, shouldRetry: isTransientDriveError },
      );

      const createdId = created.data.id;
      if (!createdId) {
        throw new StorageError(`Google Drive did not return an ID for newly created folder "${name}"`);
      }

      logger.info({ folder: name, folderId: createdId }, 'Created Google Drive folder');
      return createdId;
    } catch (error) {
      throw new StorageError(`Failed to find or create Google Drive folder "${name}"`, error);
    }
  }

  /** Lists every file in a Drive folder, following pagination to the end. */
  private async listAllFilesInFolder(folderId: string): Promise<drive_v3.Schema$File[]> {
    const files: drive_v3.Schema$File[] = [];
    let pageToken: string | undefined;

    try {
      do {
        const response = await withRetry(
          () =>
            this.drive.files.list({
              q: `'${folderId}' in parents and trashed=false`,
              fields: `nextPageToken, files(${DRIVE_FILE_FIELDS})`,
              pageToken,
              pageSize: 100,
              spaces: 'drive',
            }),
          { retries: 3, label: 'Google Drive file listing', shouldRetry: isTransientDriveError },
        );

        files.push(...(response.data.files ?? []));
        pageToken = response.data.nextPageToken ?? undefined;
      } while (pageToken);

      return files;
    } catch (error) {
      throw new StorageError(`Failed to list files in Google Drive folder ${folderId}`, error);
    }
  }

  private async downloadToPath(fileId: string, destination: string): Promise<void> {
    try {
      const response = await this.drive.files.get(
        { fileId, alt: 'media' },
        { responseType: 'stream' },
      );

      await new Promise<void>((resolve, reject) => {
        const writeStream = fs.createWriteStream(destination);
        response.data
          .on('end', () => resolve())
          .on('error', (error: unknown) => reject(error))
          .pipe(writeStream)
          .on('error', (error: unknown) => reject(error));
      });
    } catch (error) {
      throw new StorageError(`Failed to download Google Drive file ${fileId}`, error);
    }
  }

  private async moveFileToFolder(video: PendingVideo, destinationFolderId: string): Promise<void> {
    try {
      const current = await withRetry(
        () => this.drive.files.get({ fileId: video.id, fields: 'parents' }),
        { retries: 3, label: `Google Drive get parents for ${video.filename}`, shouldRetry: isTransientDriveError },
      );

      const previousParents = (current.data.parents ?? []).join(',');

      await withRetry(
        () =>
          this.drive.files.update({
            fileId: video.id,
            addParents: destinationFolderId,
            removeParents: previousParents,
            fields: 'id, parents',
          }),
        { retries: 3, label: `Google Drive move ${video.filename}`, shouldRetry: isTransientDriveError },
      );

      logger.info({ file: video.filename, destinationFolderId }, 'File moved');
    } catch (error) {
      throw new StorageError(`Failed to move Google Drive file ${video.filename}`, error);
    }
  }
}
