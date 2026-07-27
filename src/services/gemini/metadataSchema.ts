import { z } from 'zod';

/**
 * Validates the JSON payload returned by Gemini before it is trusted
 * anywhere else in the app. If Gemini returns malformed or incomplete
 * data, this schema causes a fast, clear failure instead of a bad upload.
 */
export const videoMetadataSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1)
    .max(60),
  description: z
    .string()
    .default(''),
  hashtags: z
    .array(z.string().transform(tag =>
      tag.startsWith('#') ? tag : `#${tag}`
    ))
    .max(15)
    .default(['#anime']),
  tags: z
    .array(z.string())
    .min(0)
    .max(20)
    .default([]),
  category: z
    .string()
    .default('24'),
  pinnedComment: z
    .string()
    .default(''),
  targetAudience: z
    .string()
    .default('Anime fans.'),
  suggestedUploadTime: z
    .string()
    .default(''),
});

export type ValidatedVideoMetadata = z.infer<typeof videoMetadataSchema>;
