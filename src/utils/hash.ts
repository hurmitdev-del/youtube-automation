import crypto from 'node:crypto';
import fs from 'fs-extra';

/**
 * Computes a SHA-256 hash of a file's contents. Used for duplicate
 * detection so the same physical video is never uploaded twice, even if
 * it has been renamed.
 */
export async function hashFile(absolutePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(absolutePath);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', (error) => reject(error));
  });
}
