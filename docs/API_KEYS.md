# API Keys & Credentials Guide

A focused reference for every credential this app needs. For the full
walkthrough, see [SETUP.md](SETUP.md).

## 1. Google Cloud project

Everything starts with a Google Cloud project.

- Console: https://console.cloud.google.com/
- Click the project dropdown (top left, next to "Google Cloud") → **New Project**.
- This project is what "owns" both your YouTube API access and (optionally) your Gemini API key.

## 2. YouTube Data API v3

- Navigate: **☰ menu → APIs & Services → Library**.
- Search "YouTube Data API v3" → click the result → click **Enable**.
- This is required before any upload calls will work; skipping it causes an
  `accessNotConfigured` error.

### Quota

- Default: 10,000 units/day per project.
- `videos.insert` (an upload): 1,600 units.
- `commentThreads.insert` (pinned comment): ~50 units.
- `thumbnails.set`: ~50 units.
- Check current usage: **APIs & Services → Enabled APIs & services → YouTube Data API v3 → Quotas**.

## 3. OAuth 2.0 credentials (Client ID / Secret)

- Navigate: **APIs & Services → OAuth consent screen**. Choose "External",
  fill in the app name and your email, add yourself as a test user.
- Navigate: **APIs & Services → Credentials → Create Credentials → OAuth
  client ID**.
- Application type: **Web application**.
- Add an **Authorized redirect URI** — this must exactly match
  `YOUTUBE_REDIRECT_URI` in `.env`, including the protocol and path
  (e.g. `http://localhost:3000/oauth2callback`).
- Click **Create**. Copy the **Client ID** and **Client Secret** shown in
  the popup — you can also find them again later under Credentials.

**Common mistakes:**
- Redirect URI mismatch (must match exactly, trailing slash included/excluded consistently).
- Forgetting to add your Google account as a **test user** while the consent screen is in "Testing" mode — authorization will fail silently or with `access_denied`.
- Using an "Internal" consent screen without a Google Workspace organization (only "External" works for personal Gmail accounts).

## 4. Refresh token

Run:

```bash
npm run generate-refresh-token
```

This uses your Client ID/Secret to open Google's consent screen, exchanges
the authorization code you paste back in for tokens, and prints the
`refresh_token`. Put it in `.env` as `YOUTUBE_REFRESH_TOKEN`.

**Common mistakes:**
- Running the script twice without revoking prior access first — Google
  only returns a refresh token on the *first* consent for a given app, so a
  second run without `prompt=consent` (already handled by this script) or
  without revoking prior access at https://myaccount.google.com/permissions
  can return no refresh token.
- Pasting the whole redirect URL instead of just the `code=...` value.

## 5. Gemini API key

- Go to https://aistudio.google.com/app/apikey.
- Click **Create API key**, select your Google Cloud project (or let it
  create a new one).
- Copy the key into `.env` as `GEMINI_API_KEY`.
- Optionally set `GEMINI_MODEL` (defaults to `gemini-1.5-flash`, a fast,
  inexpensive model well-suited to short metadata generation).

**Common mistakes:**
- Using an API key restricted to a different API — make sure it's a
  Generative Language API key.
- Committing the key to source control — it belongs only in `.env`, which
  is gitignored.

## 6. Google Drive (only needed if STORAGE_PROVIDER=gdrive)

Only relevant if you're using Google Drive as your storage backend instead
of local folders. See [SETUP.md](SETUP.md#google-drive-storage-setup) for
the full walkthrough; this section is the quick-reference version.

- **Enable the API**: **APIs & Services → Library** → search "Google Drive
  API" → **Enable**.
- **OAuth client**: **APIs & Services → Credentials → Create Credentials →
  OAuth client ID** (Web application). You can reuse the same OAuth
  consent screen as the YouTube setup, but the client ID/secret are
  separate — `GOOGLE_DRIVE_CLIENT_ID` / `GOOGLE_DRIVE_CLIENT_SECRET` are
  distinct from `YOUTUBE_CLIENT_ID` / `YOUTUBE_CLIENT_SECRET`.
- **Scope requested**: `https://www.googleapis.com/auth/drive` (full Drive
  access for the authorized account — needed to create folders and move
  files between them).
- **Refresh token**: run `npm run generate-gdrive-refresh-token` — same
  flow as the YouTube refresh token script, but authorizes Drive access
  instead.
- **Folder IDs**: optional. Leave `GOOGLE_DRIVE_FOLDER_VIDEOS` /
  `_UPLOADED` / `_FAILED` blank to have the app find-or-create folders
  named `videos`, `uploaded`, `failed` automatically, or set them
  explicitly to a folder's ID from its Drive URL
  (`.../drive/folders/<FOLDER_ID>`).

**Common mistakes:**
- Forgetting these are *separate* credentials from the YouTube ones — a
  YouTube-only OAuth client will not work for Drive calls, and vice versa,
  even if the underlying token grants overlapping scopes; always generate
  the token with the scope you intend to use it for.
- Authorizing with a different Google account than the one whose Drive
  actually contains (or should contain) the `videos`/`uploaded`/`failed`
  folders.
- Leaving `STORAGE_PROVIDER=gdrive` set while these variables are still
  blank — the app will refuse to start and tell you exactly which
  variable is missing.

## 7. Category IDs

`DEFAULT_CATEGORY` expects a YouTube category ID as a string. Common ones:

| ID | Category |
|---|---|
| 1 | Film & Animation |
| 2 | Autos & Vehicles |
| 10 | Music |
| 15 | Pets & Animals |
| 17 | Sports |
| 20 | Gaming |
| 22 | People & Blogs |
| 23 | Comedy |
| 24 | Entertainment |
| 26 | Howto & Style |
| 27 | Education |
| 28 | Science & Technology |

Full list: call `videoCategories.list` in the YouTube Data API, or see
Google's documentation.
