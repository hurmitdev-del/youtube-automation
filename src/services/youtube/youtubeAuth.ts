import { google } from 'googleapis';
import type { OAuth2Client } from 'google-auth-library';
import { env } from '../../config/env.js';

/**
 * Builds an authenticated OAuth2 client for the YouTube Data API using a
 * long-lived refresh token. The googleapis client library automatically
 * exchanges the refresh token for a fresh access token as needed, so no
 * token management is required elsewhere in the app.
 */
export function createYouTubeOAuthClient(): OAuth2Client {
  const oauth2Client = new google.auth.OAuth2(
    env.YOUTUBE_CLIENT_ID,
    env.YOUTUBE_CLIENT_SECRET,
    env.YOUTUBE_REDIRECT_URI,
  );

  oauth2Client.setCredentials({
    refresh_token: env.YOUTUBE_REFRESH_TOKEN,
  });

  return oauth2Client;
}
