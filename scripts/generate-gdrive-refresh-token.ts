/**
 * One-time interactive helper: `npm run generate-gdrive-refresh-token`.
 *
 * Walks the user through Google's OAuth2 consent flow for Drive access and
 * prints a refresh token to paste into GOOGLE_DRIVE_REFRESH_TOKEN in .env.
 * Mirrors scripts/generate-refresh-token.ts (the YouTube equivalent).
 */
import 'dotenv/config';
import readline from 'node:readline/promises';
import { google } from 'googleapis';

async function main(): Promise<void> {
  const clientId = process.env.GOOGLE_DRIVE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_DRIVE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_DRIVE_REDIRECT_URI ?? 'http://localhost:3000/oauth2callback';

  if (!clientId || !clientSecret) {
    console.error(
      'Missing GOOGLE_DRIVE_CLIENT_ID or GOOGLE_DRIVE_CLIENT_SECRET in .env.\n' +
        'Fill these in first — see docs/SETUP.md for how to get them from Google Cloud Console.',
    );
    process.exit(1);
  }

  const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);

  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: ['https://www.googleapis.com/auth/drive'],
  });

  console.log('\n1. Open this URL in your browser and authorize the app:\n');
  console.log(authUrl);
  console.log('\n2. After authorizing, Google will redirect you to your redirect URI with a "code" query parameter.');
  console.log('   Copy the value of that "code" parameter and paste it below.\n');

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const code = await rl.question('Paste the authorization code here: ');
  rl.close();

  const { tokens } = await oauth2Client.getToken(code.trim());

  if (!tokens.refresh_token) {
    console.error(
      '\nNo refresh token was returned. This usually happens if you have already authorized this app before.\n' +
        'Go to https://myaccount.google.com/permissions, remove access for this app, and run this script again.',
    );
    process.exit(1);
  }

  console.log('\nSuccess! Add this line to your .env file:\n');
  console.log(`GOOGLE_DRIVE_REFRESH_TOKEN=${tokens.refresh_token}\n`);
}

main().catch((error) => {
  console.error('Failed to generate refresh token:', error);
  process.exit(1);
});
