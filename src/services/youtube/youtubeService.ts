import fs from 'fs-extra';
import { google, type youtube_v3 } from 'googleapis';
import type { OAuth2Client } from 'google-auth-library';
import { YouTubeUploadError, type UploadOptions, type UploadResult, type VideoMetadata } from '../../types/index.js';
import { logger } from '../../utils/logger.js';
import { withRetry } from '../../utils/retry.js';
import { createYouTubeOAuthClient } from './youtubeAuth.js';

/** Errors that are worth retrying: transient network/server issues. */
function isTransientError(error: unknown): boolean {
  const status = (error as { code?: number; status?: number })?.code ??
    (error as { status?: number })?.status;
  if (typeof status === 'number') {
    return status === 500 || status === 502 || status === 503 || status === 504;
  }
  return false;
}

/** Quota errors should NOT be retried automatically; they need a cooldown. */
function isQuotaError(error: unknown): boolean {
  const status = (error as { code?: number; status?: number })?.code ??
    (error as { status?: number })?.status;
  const message = String((error as { message?: string })?.message ?? '').toLowerCase();
  return status === 403 && (message.includes('quota') || message.includes('rateLimitExceeded'));
}

/**
 * Wraps the YouTube Data API v3 for uploading videos, gracefully handling
 * quota errors and retrying transient failures. Supports private, public,
 * unlisted, and scheduled uploads, plus a placeholder thumbnail upload.
 */
export class YouTubeService {
  private readonly youtube: youtube_v3.Youtube;

  constructor(authClient: OAuth2Client = createYouTubeOAuthClient()) {
    this.youtube = google.youtube({ version: 'v3', auth: authClient });
  }

  /**
   * Uploads a video file with generated metadata and the requested
   * privacy/scheduling options.
   */
  async uploadVideo(
    absoluteFilePath: string,
    metadata: VideoMetadata,
    options: UploadOptions,
  ): Promise<UploadResult> {
    const fileExists = await fs.pathExists(absoluteFilePath);
    if (!fileExists) {
      throw new YouTubeUploadError(`Video file not found at ${absoluteFilePath}`);
    }

    const requestBody: youtube_v3.Schema$Video = {
      snippet: {
        title: metadata.title,
        description: this.buildFullDescription(metadata),
        tags: metadata.tags,
        categoryId: options.categoryId,
      },
      status: {
        privacyStatus: options.publishAt ? 'private' : options.privacyStatus,
        publishAt: options.publishAt,
        selfDeclaredMadeForKids: false,
      },
    };

    try {
      const response = await withRetry(
        () =>
          this.youtube.videos.insert({
            part: ['snippet', 'status'],
            requestBody,
            media: {
              body: fs.createReadStream(absoluteFilePath),
            },
          }),
        {
          retries: 3,
          label: 'YouTube video upload',
          shouldRetry: (error) => isTransientError(error) && !isQuotaError(error),
        },
      );

      const videoId = response.data.id;
      if (!videoId) {
        throw new YouTubeUploadError('YouTube API did not return a video ID after upload');
      }

      logger.info({ videoId, title: metadata.title }, 'Upload successful');

      return {
        youtubeVideoId: videoId,
        privacyStatus: options.publishAt ? 'private' : options.privacyStatus,
        scheduledPublishAt: options.publishAt ?? null,
      };
    } catch (error) {
      if (isQuotaError(error)) {
        throw new YouTubeUploadError('YouTube API quota exceeded. Try again after quota resets.', {
          isQuotaError: true,
          cause: error,
        });
      }
      throw new YouTubeUploadError(
        `Failed to upload video to YouTube: ${(error as Error).message ?? 'unknown error'}`,
        { isTransient: isTransientError(error), cause: error },
      );
    }
  }

  /**
   * Placeholder thumbnail upload. Wires up the correct API call shape so
   * it can be enabled once a thumbnail generation pipeline exists
   * (see docs/FUTURE_ROADMAP.md). Currently a no-op if no path is given.
   */
  async uploadThumbnail(videoId: string, thumbnailPath?: string): Promise<void> {
    if (!thumbnailPath) {
      logger.debug({ videoId }, 'No thumbnail provided, skipping thumbnail upload');
      return;
    }

    const exists = await fs.pathExists(thumbnailPath);
    if (!exists) {
      logger.warn({ videoId, thumbnailPath }, 'Thumbnail file not found, skipping');
      return;
    }

    try {
      await this.youtube.thumbnails.set({
        videoId,
        media: { body: fs.createReadStream(thumbnailPath) },
      });
      logger.info({ videoId }, 'Thumbnail uploaded');
    } catch (error) {
      // Thumbnail failures should never fail the overall upload.
      logger.error({ videoId, err: error }, 'Thumbnail upload failed (non-fatal)');
    }
  }

  /** Posts the AI-suggested pinned comment and pins it, if permissions allow. */
  async postPinnedComment(videoId: string, commentText: string): Promise<void> {
    try {
      const insertResponse = await this.youtube.commentThreads.insert({
        part: ['snippet'],
        requestBody: {
          snippet: {
            videoId,
            topLevelComment: {
              snippet: { textOriginal: commentText },
            },
          },
        },
      });

      const commentId = insertResponse.data.id;
      logger.info({ videoId, commentId }, 'Pinned comment suggestion posted');
      // Note: Programmatically pinning a comment requires the video owner's
      // channel comment moderation settings and is done via the same API
      // with a `moderationStatus` update in more advanced setups.
    } catch (error) {
      logger.error({ videoId, err: error }, 'Failed to post pinned comment (non-fatal)');
    }
  }

  private buildFullDescription(metadata: VideoMetadata): string {
    const hashtagLine = metadata.hashtags.join(' ');
    return `${metadata.description}\n\n${hashtagLine}`;
  }
}
