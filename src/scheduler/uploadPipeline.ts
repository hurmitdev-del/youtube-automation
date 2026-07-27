import { env } from '../config/env.js';
import { UploadRepository } from '../database/uploadRepository.js';
import { GeminiService } from '../services/gemini/geminiService.js';
import type { PendingVideo, StorageProvider } from '../services/storage/storageProvider.js';
import { YouTubeService } from '../services/youtube/youtubeService.js';
import { hashFile } from '../utils/hash.js';
import { logger } from '../utils/logger.js';
import type { PrivacyStatus, UploadOptions } from '../types/index.js';

export interface PipelineDependencies {
  storageProvider: StorageProvider;
  geminiService: GeminiService;
  youtubeService: YouTubeService;
  uploadRepository: UploadRepository;
}

export interface PipelineOptions {
  dryRun?: boolean;
}

/**
 * Orchestrates a single end-to-end run of the pipeline:
 * storage -> (download) -> Gemini metadata -> validation -> upload -> SQLite -> move file.
 *
 * Dependencies are injected so each service can be unit tested or swapped
 * independently (basic dependency injection, as requested). The pipeline
 * talks to storage exclusively through the `StorageProvider` interface and
 * contains no logic specific to local disk vs. Google Drive vs. any future
 * backend.
 */
export class UploadPipeline {
  constructor(private readonly deps: PipelineDependencies) { }

  private running = false;

  public isRunning() {
    return this.running;
  }

  async run(options: PipelineOptions = {}): Promise<void> {
    if (this.running) {
      throw new Error("Pipeline already running");
    }
    const { storageProvider } = this.deps;
    const dryRun = options.dryRun ?? false;

    logger.info({ dryRun }, 'Cron started');

    for (let i = 0; i < env.MAX_UPLOADS_PER_RUN; i += 1) {
      const video = await storageProvider.getNextVideo();

      if (!video) {
        logger.info('No pending videos found in watch folder');
        break;
      }

      logger.info({ file: video.filename }, 'Video discovered');

      await this.processVideo(video, { dryRun, deps: this.deps });
    }

    logger.info('Cron finished');
    this.running = false
  }

  private async processVideo(
    video: PendingVideo,
    ctx: { dryRun: boolean; deps: PipelineDependencies },
  ): Promise<void> {
    const { storageProvider, geminiService, youtubeService, uploadRepository } = ctx.deps;

    let localPath: string;
    try {
      localPath = await storageProvider.downloadVideo(video);
    } catch (error) {
      logger.error({ file: video.filename, err: error }, 'Failed to prepare video for processing');
      return;
    }

    const fileHash = await hashFile(localPath).catch((error) => {
      logger.warn({ file: video.filename, err: error }, 'Failed to hash file, continuing without dedupe');
      return null;
    });

    if (fileHash) {
      const duplicate = uploadRepository.findByFileHash(fileHash);
      if (duplicate) {
        logger.warn(
          { file: video.filename, duplicateOf: duplicate.filename },
          'Duplicate video detected by hash, skipping and moving to failed',
        );
        await storageProvider.moveToFailed(video);
        await storageProvider.deleteTempFile(video);
        return;
      }
    }

    const existing = uploadRepository.findByFilename(video.filename);
    if (existing && existing.status === 'uploaded') {
      logger.info({ file: video.filename }, 'Video already uploaded, skipping');
      await storageProvider.deleteTempFile(video);
      return;
    }

    const record = existing ?? uploadRepository.create(video.filename, fileHash);

    try {
      uploadRepository.updateStatus(record.id, 'generating_metadata');
      const metadata = await geminiService.generateMetadata();
      logger.info({ file: video.filename, title: metadata.title }, 'Metadata generated');
      uploadRepository.saveMetadata(record.id, metadata.title, metadata.description);

      if (ctx.dryRun) {
        logger.info(
          { file: video.filename, metadata },
          'Dry run enabled: skipping actual upload',
        );
        await storageProvider.deleteTempFile(video);
        return;
      }

      uploadRepository.updateStatus(record.id, 'uploading');
      logger.info({ file: video.filename }, 'Upload started');

      const uploadOptions: UploadOptions = this.buildUploadOptions(metadata.suggestedUploadTime);

      const result = await youtubeService.uploadVideo(localPath, metadata, uploadOptions);

      await youtubeService.postPinnedComment(result.youtubeVideoId, metadata.pinnedComment);
      await youtubeService.uploadThumbnail(result.youtubeVideoId);

      uploadRepository.markUploaded(record.id, {
        youtubeVideoId: result.youtubeVideoId,
        title: metadata.title,
        description: metadata.description,
        scheduledTime: result.scheduledPublishAt,
      });
      logger.info({ file: video.filename }, 'Database updated');

      await storageProvider.moveToUploaded(video);
      await storageProvider.deleteTempFile(video);
    } catch (error) {
      const message = (error as Error).message ?? 'Unknown error during processing';
      logger.error({ file: video.filename, err: error }, 'Upload failed');
      uploadRepository.updateStatus(record.id, 'failed', message);
      await storageProvider.moveToFailed(video).catch((moveError) => {
        logger.error({ file: video.filename, err: moveError }, 'Failed to move file to failed folder');
      });
      await storageProvider.deleteTempFile(video).catch((cleanupError) => {
        logger.error({ file: video.filename, err: cleanupError }, 'Failed to delete temp file');
      });
    }
  }

  private buildUploadOptions(_suggestedUploadTime: string): UploadOptions {
    const privacyStatus = env.DEFAULT_PRIVACY as PrivacyStatus;
    const categoryId = env.DEFAULT_CATEGORY;

    let publishAt: string | undefined;
    if (env.UPLOAD_SCHEDULE_DELAY_MINUTES > 0) {
      const scheduled = new Date(Date.now() + env.UPLOAD_SCHEDULE_DELAY_MINUTES * 60_000);
      publishAt = scheduled.toISOString();
    }

    return { privacyStatus, categoryId, publishAt };
  }
}
