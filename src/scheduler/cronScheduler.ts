import cron, { type ScheduledTask } from 'node-cron';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';
import type { UploadPipeline } from './uploadPipeline.js';

/**
 * Wraps node-cron to run the upload pipeline on the schedule defined by
 * CRON_EXPRESSION. Guards against overlapping runs so a slow upload
 * cannot cause two pipeline executions to race each other.
 */
export class CronScheduler {
  private task: ScheduledTask | null = null;
  private isRunning = false;

  constructor(
    private readonly pipeline: UploadPipeline,
    private readonly cronExpression: string = env.CRON_EXPRESSION,
  ) {}

  start(options: { dryRun?: boolean } = {}): void {
    if (!cron.validate(this.cronExpression)) {
      throw new Error(`Invalid CRON_EXPRESSION: "${this.cronExpression}"`);
    }

    this.task = cron.schedule(
      this.cronExpression,
      () => {
        void this.runOnce(options);
      },
      { timezone: env.DEFAULT_TIMEZONE },
    );

    logger.info(
      { cronExpression: this.cronExpression, timezone: env.DEFAULT_TIMEZONE },
      'Scheduler started',
    );
  }

  /** Runs the pipeline immediately, useful for --dry-run and manual triggers. */
  async runOnce(options: { dryRun?: boolean } = {}): Promise<void> {
    if (this.isRunning) {
      logger.warn('Previous run still in progress, skipping this trigger');
      return;
    }

    this.isRunning = true;
    try {
      await this.pipeline.run(options);
    } catch (error) {
      logger.error({ err: error }, 'Unhandled error during pipeline run');
    } finally {
      this.isRunning = false;
    }
  }

  stop(): void {
    this.task?.stop();
    logger.info('Scheduler stopped');
  }
}
