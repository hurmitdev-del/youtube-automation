import path from 'node:path';
import fs from 'fs-extra';
import { env } from '../../config/env.js';
import { StorageError, type DiscoveredVideo } from '../../types/index.js';
import { logger } from '../../utils/logger.js';

const SUPPORTED_EXTENSIONS = new Set(['.mp4', '.mov', '.mkv']);

/**
 * Responsible for everything filesystem-related: locating candidate
 * videos, filtering unsupported formats, and moving files between the
 * videos/uploaded/failed folders once processing finishes.
 */
export class StorageService {
  private readonly videosDir: string;
  private readonly uploadedDir: string;
  private readonly failedDir: string;

  constructor(
    videosDir: string = env.VIDEOS_FOLDER,
    uploadedDir: string = env.UPLOADED_FOLDER,
    failedDir: string = env.FAILED_FOLDER,
  ) {
    this.videosDir = path.resolve(process.cwd(), videosDir);
    this.uploadedDir = path.resolve(process.cwd(), uploadedDir);
    this.failedDir = path.resolve(process.cwd(), failedDir);
  }

  async ensureFolders(): Promise<void> {
    await Promise.all([
      fs.ensureDir(this.videosDir),
      fs.ensureDir(this.uploadedDir),
      fs.ensureDir(this.failedDir),
    ]);
  }

  /** Lists all supported video files in the watch folder. */
  async listCandidateVideos(): Promise<DiscoveredVideo[]> {
    await this.ensureFolders();

    let entries: string[];
    try {
      entries = await fs.readdir(this.videosDir);
    } catch (error) {
      throw new StorageError(`Unable to read videos folder: ${this.videosDir}`, error);
    }

    const videos: DiscoveredVideo[] = [];

    for (const entry of entries) {
      const extension = path.extname(entry).toLowerCase();
      const absolutePath = path.join(this.videosDir, entry);

      const stat = await fs.stat(absolutePath).catch(() => null);
      if (!stat || !stat.isFile()) {
        continue;
      }

      if (!SUPPORTED_EXTENSIONS.has(extension)) {
        logger.debug({ file: entry }, 'Skipping unsupported file type');
        continue;
      }

      videos.push({
        filename: entry,
        absolutePath,
        extension,
        sizeBytes: stat.size,
        createdAt: stat.birthtime,
      });
    }

    return videos;
  }

  /** Returns the oldest supported video by creation time, or null if none exist. */
  async findOldestVideo(): Promise<DiscoveredVideo | null> {
    const videos = await this.listCandidateVideos();
    if (videos.length === 0) {
      return null;
    }

    return videos.reduce((oldest, current) =>
      current.createdAt.getTime() < oldest.createdAt.getTime() ? current : oldest,
    );
  }

  async moveToUploaded(video: DiscoveredVideo): Promise<string> {
    return this.moveFile(video, this.uploadedDir);
  }

  async moveToFailed(video: DiscoveredVideo): Promise<string> {
    return this.moveFile(video, this.failedDir);
  }

  private async moveFile(video: DiscoveredVideo, destinationDir: string): Promise<string> {
    const destinationPath = path.join(destinationDir, video.filename);
    try {
      await fs.ensureDir(destinationDir);
      await fs.move(video.absolutePath, destinationPath, { overwrite: true });
      logger.info(
        { file: video.filename, destination: destinationDir },
        'File moved',
      );
      return destinationPath;
    } catch (error) {
      throw new StorageError(`Failed to move ${video.filename} to ${destinationDir}`, error);
    }
  }
}
