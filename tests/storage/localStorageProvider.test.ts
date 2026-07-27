import { test } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'fs-extra';
import '../testEnv.js';
import { LocalStorageProvider } from '../../src/services/storage/localStorageProvider.js';
import { StorageService } from '../../src/services/storage/storageService.js';

async function makeTempFolders(): Promise<{ videosDir: string; uploadedDir: string; failedDir: string }> {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), 'local-storage-test-'));
  const videosDir = path.join(base, 'videos');
  const uploadedDir = path.join(base, 'uploaded');
  const failedDir = path.join(base, 'failed');
  await fs.ensureDir(videosDir);
  await fs.ensureDir(uploadedDir);
  await fs.ensureDir(failedDir);
  return { videosDir, uploadedDir, failedDir };
}

test('getNextVideo returns null when the videos folder is empty', async () => {
  const { videosDir, uploadedDir, failedDir } = await makeTempFolders();
  const provider = new LocalStorageProvider(new StorageService(videosDir, uploadedDir, failedDir));

  await provider.initialize();
  const next = await provider.getNextVideo();

  assert.equal(next, null);
});

test('listPendingVideos only includes supported extensions', async () => {
  const { videosDir, uploadedDir, failedDir } = await makeTempFolders();
  await fs.writeFile(path.join(videosDir, 'clip.mp4'), 'fake mp4 content');
  await fs.writeFile(path.join(videosDir, 'notes.txt'), 'not a video');

  const provider = new LocalStorageProvider(new StorageService(videosDir, uploadedDir, failedDir));
  await provider.initialize();

  const pending = await provider.listPendingVideos();

  assert.equal(pending.length, 1);
  assert.equal(pending[0]?.filename, 'clip.mp4');
});

test('downloadVideo resolves to the file already on disk without copying it', async () => {
  const { videosDir, uploadedDir, failedDir } = await makeTempFolders();
  await fs.writeFile(path.join(videosDir, 'clip.mp4'), 'fake mp4 content');

  const provider = new LocalStorageProvider(new StorageService(videosDir, uploadedDir, failedDir));
  await provider.initialize();

  const video = await provider.getNextVideo();
  assert.ok(video);

  const localPath = await provider.downloadVideo(video!);

  assert.equal(localPath, path.join(videosDir, 'clip.mp4'));
  assert.ok(await fs.pathExists(localPath));
});

test('moveToUploaded moves the file into the uploaded folder', async () => {
  const { videosDir, uploadedDir, failedDir } = await makeTempFolders();
  await fs.writeFile(path.join(videosDir, 'clip.mp4'), 'fake mp4 content');

  const provider = new LocalStorageProvider(new StorageService(videosDir, uploadedDir, failedDir));
  await provider.initialize();

  const video = await provider.getNextVideo();
  assert.ok(video);
  await provider.downloadVideo(video!);
  await provider.moveToUploaded(video!);

  assert.ok(!(await fs.pathExists(path.join(videosDir, 'clip.mp4'))));
  assert.ok(await fs.pathExists(path.join(uploadedDir, 'clip.mp4')));
});

test('moveToFailed moves the file into the failed folder', async () => {
  const { videosDir, uploadedDir, failedDir } = await makeTempFolders();
  await fs.writeFile(path.join(videosDir, 'clip.mp4'), 'fake mp4 content');

  const provider = new LocalStorageProvider(new StorageService(videosDir, uploadedDir, failedDir));
  await provider.initialize();

  const video = await provider.getNextVideo();
  assert.ok(video);
  await provider.downloadVideo(video!);
  await provider.moveToFailed(video!);

  assert.ok(!(await fs.pathExists(path.join(videosDir, 'clip.mp4'))));
  assert.ok(await fs.pathExists(path.join(failedDir, 'clip.mp4')));
});

test('deleteTempFile and cleanup are safe no-ops for the local provider', async () => {
  const { videosDir, uploadedDir, failedDir } = await makeTempFolders();
  await fs.writeFile(path.join(videosDir, 'clip.mp4'), 'fake mp4 content');

  const provider = new LocalStorageProvider(new StorageService(videosDir, uploadedDir, failedDir));
  await provider.initialize();

  const video = await provider.getNextVideo();
  assert.ok(video);
  await provider.downloadVideo(video!);

  // Should not throw, and should not touch the original file.
  await provider.deleteTempFile(video!);
  await provider.cleanup();

  assert.ok(await fs.pathExists(path.join(videosDir, 'clip.mp4')));
});
