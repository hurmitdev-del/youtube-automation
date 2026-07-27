import { StorageError, type DiscoveredVideo } from '../../types/index.js';
import { StorageService } from './storageService.js';
import type { PendingVideo, StorageProvider } from './storageProvider.js';

/**
 * Adapts the existing, unmodified `StorageService` (local filesystem) to
 * the provider-agnostic `StorageProvider` interface. `StorageService`
 * itself is untouched so behaviour for STORAGE_PROVIDER=local is byte-for-
 * byte identical to before this change.
 */
export class LocalStorageProvider implements StorageProvider {
  private readonly discoveredByFilename = new Map<string, DiscoveredVideo>();

  constructor(private readonly storageService: StorageService = new StorageService()) {}

  async initialize(): Promise<void> {
    await this.storageService.ensureFolders();
  }

  async listPendingVideos(): Promise<PendingVideo[]> {
    const videos = await this.storageService.listCandidateVideos();
    return videos.map((video) => this.toPendingVideo(video));
  }

  async getNextVideo(): Promise<PendingVideo | null> {
    const video = await this.storageService.findOldestVideo();
    return video ? this.toPendingVideo(video) : null;
  }

  /**
   * Local videos are already on disk, so "downloading" is just resolving
   * the absolute path discovered earlier. No file is copied or moved.
   */
  async downloadVideo(video: PendingVideo): Promise<string> {
    return this.getDiscovered(video).absolutePath;
  }

  async moveToUploaded(video: PendingVideo): Promise<void> {
    await this.storageService.moveToUploaded(this.getDiscovered(video));
    this.discoveredByFilename.delete(video.id);
  }

  async moveToFailed(video: PendingVideo): Promise<void> {
    await this.storageService.moveToFailed(this.getDiscovered(video));
    this.discoveredByFilename.delete(video.id);
  }

  /**
   * No-op: the local provider never creates a separate temporary copy —
   * the original file itself is moved directly to uploaded/ or failed/.
   */
  async deleteTempFile(_video: PendingVideo): Promise<void> {
    return Promise.resolve();
  }

  /** No-op: nothing provider-wide to tear down for local storage. */
  async cleanup(): Promise<void> {
    return Promise.resolve();
  }

  private toPendingVideo(video: DiscoveredVideo): PendingVideo {
    this.discoveredByFilename.set(video.filename, video);
    return {
      id: video.filename,
      filename: video.filename,
      sizeBytes: video.sizeBytes,
      createdAt: video.createdAt,
    };
  }

  private getDiscovered(video: PendingVideo): DiscoveredVideo {
    const discovered = this.discoveredByFilename.get(video.id);
    if (!discovered) {
      throw new StorageError(`Unknown local video reference: ${video.filename}`);
    }
    return discovered;
  }
}
