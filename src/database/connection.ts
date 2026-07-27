import path from 'node:path';
import Database from 'better-sqlite3';
import fs from 'fs-extra';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';
import { CREATE_INDEXES_SQL, CREATE_UPLOADS_TABLE_SQL } from './schema.js';

let db: Database.Database | null = null;

/**
 * Returns a singleton SQLite connection, creating the database file and
 * applying the schema migration on first use.
 */
export function getDatabase(): Database.Database {
  if (db) {
    return db;
  }

  const dbPath = path.resolve(process.cwd(), env.DATABASE_PATH);
  fs.ensureDirSync(path.dirname(dbPath));

  const isNewDatabase = !fs.existsSync(dbPath);

  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  db.exec(CREATE_UPLOADS_TABLE_SQL);
  db.exec(CREATE_INDEXES_SQL);

  if (isNewDatabase) {
    logger.info({ dbPath }, 'Database created and migrated');
  } else {
    logger.debug({ dbPath }, 'Database connection established');
  }

  return db;
}

export function closeDatabase(): void {
  if (db) {
    db.close();
    db = null;
  }
}
