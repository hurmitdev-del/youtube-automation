import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs-extra';
import type { drive_v3 } from 'googleapis';
import '../testEnv.js';
import { GDriveStorageProvider } from '../../src/services/storage/gdriveStorageProvider.js';
import { FakeDrive } from './fakeDrive.js';

/**
 * FakeDrive only implements the subset of `drive_v3.Drive` that
 * GDriveStorageProvider actually calls (files.list/get/create/update).
 * Casting through `unknown` is the narrow, standard way to inject that
 * test double where the real, much larger `drive_v3.Drive` type is
 * expected.
 */
function providerWith(fake: FakeDrive): GDriveStorageProvider {
  return new GDriveStorageProvider(undefined, fake as unknown as drive_v3.Drive);
}

test('initialize creates videos/uploaded/failed folders when none exist', async () => {
  const fake = new FakeDrive();
  const provider = providerWith(fake);

  await provider.initialize();

  const names = [...fake.filesById.values()].map((f) => f.name).sort();
  assert.deepEqual(names, ['failed', 'uploaded', 'videos']);
});

test('initialize reuses an existing folder instead of creating a duplicate', async () => {
  const fake = new FakeDrive();
  fake.addFolder('videos');
  const provider = providerWith(fake);

  await provider.initialize();

  const videoFolders = [...fake.filesById.values()].filter((f) => f.name === 'videos');
  assert.equal(videoFolders.length, 1);
});

test('listPendingVideos only returns supported video files from the videos folder', async () => {
  const fake = new FakeDrive();
  const provider = providerWith(fake);
  await provider.initialize();

  const videosFolder = fake.findFolderByName('videos')!;
  fake.addVideoFile('clip-a.mp4', [videosFolder.id]);
  fake.addVideoFile('clip-b.mov', [videosFolder.id]);
  // A non-video file in the same folder should be ignored.
  fake.filesById.set('doc-1', {
    id: 'doc-1',
    name: 'notes.txt',
    mimeType: 'text/plain',
    parents: [videosFolder.id],
  });

  const pending = await provider.listPendingVideos();

  assert.equal(pending.length, 2);
  assert.deepEqual(
    pending.map((v) => v.filename).sort(),
    ['clip-a.mp4', 'clip-b.mov'],
  );
});

test('listPendingVideos follows pagination across multiple pages', async () => {
  const fake = new FakeDrive();
  const provider = providerWith(fake);
  await provider.initialize();

  const videosFolder = fake.findFolderByName('videos')!;
  for (let i = 0; i < 5; i += 1) {
    fake.addVideoFile(`clip-${i}.mp4`, [videosFolder.id]);
  }

  const pending = await provider.listPendingVideos();

  assert.equal(pending.length, 5);
});

test('getNextVideo returns the oldest file by createdTime', async () => {
  const fake = new FakeDrive();
  const provider = providerWith(fake);
  await provider.initialize();

  const videosFolder = fake.findFolderByName('videos')!;
  fake.addVideoFile('newer.mp4', [videosFolder.id], { createdTime: '2026-01-02T00:00:00.000Z' });
  fake.addVideoFile('older.mp4', [videosFolder.id], { createdTime: '2026-01-01T00:00:00.000Z' });

  const next = await provider.getNextVideo();

  assert.equal(next?.filename, 'older.mp4');
});

test('getNextVideo returns null when the videos folder is empty', async () => {
  const fake = new FakeDrive();
  const provider = providerWith(fake);
  await provider.initialize();

  const next = await provider.getNextVideo();

  assert.equal(next, null);
});

test('downloadVideo writes Drive file content to a local temp file, deleteTempFile removes it', async () => {
  const fake = new FakeDrive();
  const provider = providerWith(fake);
  await provider.initialize();

  const videosFolder = fake.findFolderByName('videos')!;
  const file = fake.addVideoFile('clip.mp4', [videosFolder.id], { content: 'hello world' });
  const video = { id: file.id, filename: file.name, sizeBytes: 0, createdAt: new Date() };

  const localPath = await provider.downloadVideo(video);
  assert.ok(await fs.pathExists(localPath));
  assert.equal((await fs.readFile(localPath)).toString(), 'hello world');

  await provider.deleteTempFile(video);
  assert.ok(!(await fs.pathExists(localPath)));
});

test('moveToUploaded re-parents the Drive file into the uploaded folder', async () => {
  const fake = new FakeDrive();
  const provider = providerWith(fake);
  await provider.initialize();

  const videosFolder = fake.findFolderByName('videos')!;
  const uploadedFolder = fake.findFolderByName('uploaded')!;
  const file = fake.addVideoFile('clip.mp4', [videosFolder.id]);
  const video = { id: file.id, filename: file.name, sizeBytes: 0, createdAt: new Date() };

  await provider.moveToUploaded(video);

  const updated = fake.filesById.get(file.id)!;
  assert.ok(updated.parents.includes(uploadedFolder.id));
  assert.ok(!updated.parents.includes(videosFolder.id));
});

test('moveToFailed re-parents the Drive file into the failed folder', async () => {
  const fake = new FakeDrive();
  const provider = providerWith(fake);
  await provider.initialize();

  const videosFolder = fake.findFolderByName('videos')!;
  const failedFolder = fake.findFolderByName('failed')!;
  const file = fake.addVideoFile('clip.mp4', [videosFolder.id]);
  const video = { id: file.id, filename: file.name, sizeBytes: 0, createdAt: new Date() };

  await provider.moveToFailed(video);

  const updated = fake.filesById.get(file.id)!;
  assert.ok(updated.parents.includes(failedFolder.id));
  assert.ok(!updated.parents.includes(videosFolder.id));
});

test('cleanup removes the temp directory without throwing', async () => {
  const fake = new FakeDrive();
  const provider = providerWith(fake);
  await provider.initialize();

  await assert.doesNotReject(() => provider.cleanup());
});
