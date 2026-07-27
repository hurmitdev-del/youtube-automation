/**
 * A video reference as seen by the upload pipeline. Deliberately provider-
 * agnostic: for the local provider `id` is the filename; for the Google
 * Drive provider `id` is the Drive file ID. The pipeline never needs to
 * know which.
 */
export interface PendingVideo {
  id: string;
  filename: string;
  sizeBytes: number;
  createdAt: Date;
}

/**
 * Storage abstraction implemented by every backend (local filesystem,
 * Google Drive, ...). The upload pipeline depends only on this interface
 * and contains no provider-specific logic.
 *
 * Contract:
 * - `initialize()` prepares folders/credentials and must be called once
 *   before any other method.
 * - `getNextVideo()` returns the oldest pending video, or null if none.
 * - `downloadVideo()` guarantees the video is available at a local
 *   filesystem path afterwards (a no-op resolution for local storage, an
 *   actual download for remote storage).
 * - `moveToUploaded()` / `moveToFailed()` relocate the *source* video
 *   (local file or Drive file) once processing finishes.
 * - `deleteTempFile()` removes any local temporary copy created by
 *   `downloadVideo()`. It is always safe to call, even if no temp file
 *   exists.
 * - `cleanup()` performs provider-wide teardown (e.g. removing a temp
 *   directory) and is called on application shutdown.
 */
export interface StorageProvider {
  initialize(): Promise<void>;
  listPendingVideos(): Promise<PendingVideo[]>;
  getNextVideo(): Promise<PendingVideo | null>;
  downloadVideo(video: PendingVideo): Promise<string>;
  moveToUploaded(video: PendingVideo): Promise<void>;
  moveToFailed(video: PendingVideo): Promise<void>;
  deleteTempFile(video: PendingVideo): Promise<void>;
  cleanup(): Promise<void>;
}
