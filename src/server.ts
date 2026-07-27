import Fastify from 'fastify';

import { env } from './config/env.js';

import { GeminiService } from './services/gemini/geminiService.js';
import { YouTubeService } from './services/youtube/youtubeService.js';
import { createStorageProvider } from './services/storage/storageProviderFactory.js';

import { UploadRepository } from './database/uploadRepository.js';
import { UploadPipeline } from './scheduler/uploadPipeline.js';

import { logger } from './utils/logger.js';
import { getDatabase } from './database/connection.js';
import { healthCheck } from './utils/health.js';


const app = Fastify({
    logger: false,
});

let running = false;

const db = getDatabase();

// Instantiate dependencies once
const storageProvider = createStorageProvider();
await storageProvider.initialize();
const geminiService = new GeminiService();
const youtubeService = new YouTubeService();
const uploadRepository = new UploadRepository(db);

const pipeline = new UploadPipeline({
    storageProvider,
    geminiService,
    youtubeService,
    uploadRepository,
});

app.get('/health', async () => {
    const healthCheckStatus = await healthCheck();
    return healthCheckStatus
});

app.post('/upload', async (request: any, reply: any) => {
    const auth = request.headers.authorization;

    if (auth !== `Bearer ${env.API_TOKEN}`) {
        return reply.status(401).send({
            success: false,
            message: 'Unauthorized',
        });
    }

    if (running) {
        return reply.status(409).send({
            success: false,
            message: 'Upload pipeline already running',
        });
    }

    running = true;

    try {
        logger.info('Upload requested via HTTP');

        await pipeline.run();

        return {
            success: true,
            message: 'Upload pipeline completed',
        };
    } catch (err) {
        logger.error(err, 'Pipeline execution failed');

        return reply.status(500).send({
            success: false,
            message: 'Pipeline execution failed',
        });
    } finally {
        running = false;
    }
});

const port = Number(process.env.PORT ?? 8080);

await app.listen({
    host: '0.0.0.0',
    port,
});

logger.info(`HTTP server listening on port ${port}`);