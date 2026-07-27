import { env } from './config/env.js';
import { getDatabase, closeDatabase } from './database/connection.js';
import { UploadRepository } from './database/uploadRepository.js';
import { GeminiService } from './services/gemini/geminiService.js';
import { createStorageProvider } from './services/storage/storageProviderFactory.js';
import { YouTubeService } from './services/youtube/youtubeService.js';
import { CronScheduler } from './scheduler/cronScheduler.js';
import { UploadPipeline } from './scheduler/uploadPipeline.js';
import { logger } from './utils/logger.js';

interface CliFlags {
  dryRun: boolean;
  runOnce: boolean;
}

function parseCliFlags(argv: string[]): CliFlags {
  return {
    dryRun: argv.includes('--dry-run'),
    runOnce: argv.includes('--run-once'),
  };
}

async function main(): Promise<void> {
  const flags = parseCliFlags(process.argv.slice(2));

  logger.info({ nodeEnv: env.NODE_ENV, dryRun: flags.dryRun }, 'Starting youtube-ai-automation');

  const storageProvider = createStorageProvider();
  await storageProvider.initialize();

  const db = getDatabase();
  const uploadRepository = new UploadRepository(db);
  const geminiService = new GeminiService();
  const youtubeService = new YouTubeService();

  const pipeline = new UploadPipeline({
    storageProvider,
    geminiService,
    youtubeService,
    uploadRepository,
  });

  const scheduler = new CronScheduler(pipeline);

  if (flags.runOnce || flags.dryRun) {
    await scheduler.runOnce({ dryRun: flags.dryRun });
    await storageProvider.cleanup();
    closeDatabase();
    return;
  }

  scheduler.start({ dryRun: false });

  const shutdown = (signal: string): void => {
    logger.info({ signal }, 'Shutdown signal received, closing gracefully');
    scheduler.stop();
    void storageProvider.cleanup().finally(() => {
      closeDatabase();
      process.exit(0);
    });
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((error) => {
  logger.fatal({ err: error }, 'Fatal error during startup');
  process.exit(1);
});
