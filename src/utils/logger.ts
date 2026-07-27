import pino from 'pino';
import path from 'node:path';
import fs from 'fs-extra';
import { env } from '../config/env.js';

const LOG_DIR = path.resolve(process.cwd(), 'logs');
fs.ensureDirSync(LOG_DIR);

const LOG_FILE = path.join(LOG_DIR, 'app.log');

/**
 * Structured logger used across the whole application.
 * - Pretty-printed to stdout in development for readability.
 * - Always written as newline-delimited JSON to logs/app.log for auditing.
 */
export const logger = pino(
  {
    level: env.LOG_LEVEL,
    base: { service: 'youtube-ai-automation' },
    timestamp: pino.stdTimeFunctions.isoTime,
  },
  pino.transport({
    targets: [
      {
        target: 'pino-pretty',
        level: env.LOG_LEVEL,
        options: { colorize: env.NODE_ENV !== 'production', translateTime: 'SYS:standard' },
      },
      {
        target: 'pino/file',
        level: env.LOG_LEVEL,
        options: { destination: LOG_FILE, mkdir: true },
      },
    ],
  }),
);

export type Logger = typeof logger;
