/**
 * SQL schema for the `uploads` table. Applied automatically at startup
 * if the table does not already exist ("create migration automatically
 * if database doesn't exist").
 */
export const CREATE_UPLOADS_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS uploads (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  filename        TEXT NOT NULL,
  fileHash        TEXT,
  youtubeVideoId  TEXT,
  title           TEXT,
  description     TEXT,
  status          TEXT NOT NULL DEFAULT 'pending',
  scheduledTime   TEXT,
  uploadedAt      TEXT,
  createdAt       TEXT NOT NULL DEFAULT (datetime('now')),
  error           TEXT
);
`;

export const CREATE_INDEXES_SQL = `
CREATE INDEX IF NOT EXISTS idx_uploads_filename ON uploads (filename);
CREATE INDEX IF NOT EXISTS idx_uploads_fileHash ON uploads (fileHash);
CREATE INDEX IF NOT EXISTS idx_uploads_status ON uploads (status);
`;
