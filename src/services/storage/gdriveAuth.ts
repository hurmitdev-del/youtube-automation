import { google } from 'googleapis';
import type { OAuth2Client } from 'google-auth-library';
import { env } from '../../config/env.js';

/**
 * Builds an authenticated OAuth2 client for the Google Drive API using a
 * long-lived refresh token. Deliberately separate from the YouTube OAuth
 * client (youtubeAuth.ts) since Drive and YouTube credentials/scopes are
 * independent and a deployment may use different Google Cloud OAuth
 * clients for each.
 */
export function createGoogleDriveOAuthClient(): OAuth2Client {
  const oauth2Client = new google.auth.OAuth2(
    env.GOOGLE_DRIVE_CLIENT_ID,
    env.GOOGLE_DRIVE_CLIENT_SECRET,
    env.GOOGLE_DRIVE_REDIRECT_URI,
  );

  oauth2Client.setCredentials({
    refresh_token: env.GOOGLE_DRIVE_REFRESH_TOKEN,
  });

  return oauth2Client;
}
