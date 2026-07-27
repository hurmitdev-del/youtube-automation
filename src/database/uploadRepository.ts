import type Database from 'better-sqlite3';
import { DatabaseError, type UploadRecord, type UploadStatus } from '../types/index.js';

interface UploadRow {
  id: number;
  filename: string;
  fileHash: string | null;
  youtubeVideoId: string | null;
  title: string | null;
  description: string | null;
  status: UploadStatus;
  scheduledTime: string | null;
  uploadedAt: string | null;
  createdAt: string;
  error: string | null;
}

function rowToRecord(row: UploadRow): UploadRecord {
  return { ...row };
}

/**
 * Encapsulates all SQL access for the `uploads` table. Keeping queries in
 * one place (repository pattern) means the rest of the app never writes
 * raw SQL and can be unit-tested against an interface if needed.
 */
export class UploadRepository {
  constructor(private readonly db: Database.Database) {}

  create(filename: string, fileHash: string | null): UploadRecord {
    try {
      const stmt = this.db.prepare(
        `INSERT INTO uploads (filename, fileHash, status) VALUES (?, ?, 'pending')`,
      );
      const result = stmt.run(filename, fileHash);
      const record = this.findById(Number(result.lastInsertRowid));
      if (!record) {
        throw new Error('Failed to read back inserted upload record');
      }
      return record;
    } catch (error) {
      throw new DatabaseError(`Failed to create upload record for ${filename}`, error);
    }
  }

  findById(id: number): UploadRecord | null {
    const row = this.db.prepare(`SELECT * FROM uploads WHERE id = ?`).get(id) as
      | UploadRow
      | undefined;
    return row ? rowToRecord(row) : null;
  }

  findByFileHash(fileHash: string): UploadRecord | null {
    const row = this.db
      .prepare(`SELECT * FROM uploads WHERE fileHash = ? AND status = 'uploaded'`)
      .get(fileHash) as UploadRow | undefined;
    return row ? rowToRecord(row) : null;
  }

  findByFilename(filename: string): UploadRecord | null {
    const row = this.db.prepare(`SELECT * FROM uploads WHERE filename = ?`).get(filename) as
      | UploadRow
      | undefined;
    return row ? rowToRecord(row) : null;
  }

  updateStatus(id: number, status: UploadStatus, error: string | null = null): void {
    try {
      this.db
        .prepare(`UPDATE uploads SET status = ?, error = ? WHERE id = ?`)
        .run(status, error, id);
    } catch (dbError) {
      throw new DatabaseError(`Failed to update status for upload ${id}`, dbError);
    }
  }

  markUploaded(
    id: number,
    fields: { youtubeVideoId: string; title: string; description: string; scheduledTime: string | null },
  ): void {
    try {
      this.db
        .prepare(
          `UPDATE uploads
           SET status = 'uploaded',
               youtubeVideoId = ?,
               title = ?,
               description = ?,
               scheduledTime = ?,
               uploadedAt = datetime('now'),
               error = NULL
           WHERE id = ?`,
        )
        .run(fields.youtubeVideoId, fields.title, fields.description, fields.scheduledTime, id);
    } catch (dbError) {
      throw new DatabaseError(`Failed to mark upload ${id} as uploaded`, dbError);
    }
  }

  saveMetadata(id: number, title: string, description: string): void {
    this.db.prepare(`UPDATE uploads SET title = ?, description = ? WHERE id = ?`).run(
      title,
      description,
      id,
    );
  }

  listByStatus(status: UploadStatus): UploadRecord[] {
    const rows = this.db.prepare(`SELECT * FROM uploads WHERE status = ?`).all(status) as UploadRow[];
    return rows.map(rowToRecord);
  }

  listRecent(limit = 20): UploadRecord[] {
    const rows = this.db
      .prepare(`SELECT * FROM uploads ORDER BY createdAt DESC LIMIT ?`)
      .all(limit) as UploadRow[];
    return rows.map(rowToRecord);
  }
}
