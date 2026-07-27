import 'dotenv/config';
import { z } from 'zod';

/**
 * Every configuration value the application needs comes from the environment.
 * Nothing is ever hardcoded. This schema is the single source of truth for
 * what environment variables exist, their types, and their defaults.
 */
const envSchema = z.object({
  // General
  PORT: z.coerce.number().int().positive().default(3000),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),

  // YouTube OAuth2 credentials (from Google Cloud Console)
  YOUTUBE_CLIENT_ID: z.string().min(1, 'YOUTUBE_CLIENT_ID is required'),
  YOUTUBE_CLIENT_SECRET: z.string().min(1, 'YOUTUBE_CLIENT_SECRET is required'),
  YOUTUBE_REDIRECT_URI: z.string().url().default('http://localhost:3000/oauth2callback'),
  YOUTUBE_REFRESH_TOKEN: z.string().min(1, 'YOUTUBE_REFRESH_TOKEN is required'),

  // Gemini
  GEMINI_API_KEY: z.string().min(1, 'GEMINI_API_KEY is required'),
  GEMINI_MODEL: z.string().default('gemini-1.5-flash'),

  // Folders
  VIDEOS_FOLDER: z.string().default('./videos'),
  UPLOADED_FOLDER: z.string().default('./uploaded'),
  FAILED_FOLDER: z.string().default('./failed'),

  // Database
  DATABASE_PATH: z.string().default('./data/uploads.sqlite'),

  // Scheduler
  CRON_EXPRESSION: z.string().default('*/30 * * * *'),
  MAX_UPLOADS_PER_RUN: z.coerce.number().int().positive().default(1),

  // Upload defaults
  DEFAULT_CATEGORY: z.string().default('22'), // 22 = People & Blogs
  DEFAULT_PRIVACY: z.enum(['private', 'public', 'unlisted']).default('private'),
  DEFAULT_TIMEZONE: z.string().default('UTC'),
  UPLOAD_SCHEDULE_DELAY_MINUTES: z.coerce.number().int().min(0).default(0),

  // Logging
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),

  // --- Storage provider selection -------------------------------------------
  // 'local' (default) uses the existing videos/uploaded/failed folders on
  // disk, exactly as before. 'gdrive' uses Google Drive folders instead.
  STORAGE_PROVIDER: z.enum(['local', 'gdrive']).default('local'),

  // Google Drive credentials (only required when STORAGE_PROVIDER=gdrive)
  GOOGLE_DRIVE_CLIENT_ID: z.string().optional().default(''),
  GOOGLE_DRIVE_CLIENT_SECRET: z.string().optional().default(''),
  GOOGLE_DRIVE_REDIRECT_URI: z.string().url().default('http://localhost:3000/oauth2callback'),
  GOOGLE_DRIVE_REFRESH_TOKEN: z.string().optional().default(''),

  // Google Drive folder IDs. If left blank, the app finds-or-creates
  // folders named "videos", "uploaded", "failed" in the Drive root.
  GOOGLE_DRIVE_FOLDER_VIDEOS: z.string().optional().default(''),
  GOOGLE_DRIVE_FOLDER_UPLOADED: z.string().optional().default(''),
  GOOGLE_DRIVE_FOLDER_FAILED: z.string().optional().default(''),

  //API Token only needed when server is used instead of scheduler
  API_TOKEN: z.string().optional().default(''),
});

const envSchemaWithGdriveRules = envSchema.superRefine((data, ctx) => {
  if (data.STORAGE_PROVIDER !== 'gdrive') {
    return;
  }

  const required: Array<[keyof AppEnv, string]> = [
    ['GOOGLE_DRIVE_CLIENT_ID', 'GOOGLE_DRIVE_CLIENT_ID is required when STORAGE_PROVIDER=gdrive'],
    ['GOOGLE_DRIVE_CLIENT_SECRET', 'GOOGLE_DRIVE_CLIENT_SECRET is required when STORAGE_PROVIDER=gdrive'],
    ['GOOGLE_DRIVE_REFRESH_TOKEN', 'GOOGLE_DRIVE_REFRESH_TOKEN is required when STORAGE_PROVIDER=gdrive'],
  ];

  for (const [field, message] of required) {
    if (!data[field]) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: [field], message });
    }
  }
});

export type AppEnv = z.infer<typeof envSchema>;

/**
 * Parses and validates process.env once at startup. Throws a descriptive
 * error and exits early if required variables are missing or malformed,
 * rather than letting the app fail unpredictably later at runtime.
 */
function loadEnv(): AppEnv {
  const parsed = envSchemaWithGdriveRules.safeParse(process.env);

  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    // eslint-disable-next-line no-console
    console.error(`Invalid environment configuration:\n${issues}`);
    process.exit(1);
  }

  return parsed.data;
}

export const env: AppEnv = loadEnv();
