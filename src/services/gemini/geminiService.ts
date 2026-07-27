import { env } from '../../config/env.js';
import { MetadataGenerationError, type VideoMetadata } from '../../types/index.js';
import { logger } from '../../utils/logger.js';
import { withRetry } from '../../utils/retry.js';
import { buildMetadataPrompt } from '../../prompts/metadataPrompt.js';
import { videoMetadataSchema } from './metadataSchema.js';

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta';

interface GeminiGenerateContentResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{ text?: string }>;
    };
  }>;
}

/**
 * Thin wrapper around the Gemini REST API. Uses the official
 * generateContent endpoint directly over fetch, so no extra SDK
 * dependency is needed beyond what's already in the allowed tech stack.
 */
export class GeminiService {
  constructor(
    private readonly apiKey: string = env.GEMINI_API_KEY,
    private readonly model: string = env.GEMINI_MODEL,
  ) { }

  /**
   * Generates and validates SEO metadata for a video based on its filename.
   * Retries on transient network errors, then throws a typed error if
   * generation or validation ultimately fails.
   */
  async generateMetadata(): Promise<VideoMetadata> {
    const prompt = buildMetadataPrompt();

    logger.info({ generatedPrompt : JSON.stringify(prompt) });

    const rawText = await withRetry(() => this.callGemini(prompt), {
      retries: 3,
      label: 'Gemini metadata generation',
    });

    const parsed = this.parseJson(rawText);
    const validated = videoMetadataSchema.safeParse(parsed);

    if (!validated.success) {
      logger.error({ issues: validated.error.issues, rawText }, 'Gemini metadata failed validation');
      throw new MetadataGenerationError(
        `Gemini returned metadata that failed validation: ${validated.error.message}`,
      );
    }

    return validated.data;
  }

  private async callGemini(prompt: string): Promise<string> {
    const url = `${GEMINI_API_BASE}/models/${this.model}:generateContent?key=${this.apiKey}`;

    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.7,
            responseMimeType: 'application/json',
          },
        }),
      });
    } catch (error) {
      throw new MetadataGenerationError('Network error calling Gemini API', error);
    }

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new MetadataGenerationError(
        `Gemini API returned ${response.status}: ${body}`,
      );
    }

    const data = (await response.json()) as GeminiGenerateContentResponse;
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!text) {
      throw new MetadataGenerationError('Gemini API returned an empty response');
    }

    return text;
  }

  private parseJson(rawText: string): unknown {
    const cleaned = rawText
      .trim()
      .replace(/^```(?:json)?/i, '')
      .replace(/```$/, '')
      .trim();

    try {
      return JSON.parse(cleaned);
    } catch (error) {
      throw new MetadataGenerationError('Gemini response was not valid JSON', error);
    }
  }
}
