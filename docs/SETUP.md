# Setup Guide (Beginner Friendly)

This guide assumes you have never used Google Cloud before. Follow every
step in order.

## Step 1 — Install Node.js

Install Node.js 20 (LTS) or newer from https://nodejs.org.

Verify it installed correctly:

```bash
node --version   # should print v20.x.x or higher
npm --version
```

## Step 2 — Clone the repository

```bash
git clone <your-fork-url> youtube-ai-automation
cd youtube-ai-automation
npm install
cp .env.example .env
```

You'll fill in `.env` progressively as you complete the steps below.

## Step 3 — Create a Google Cloud project

1. Go to https://console.cloud.google.com/.
2. Sign in with the Google account that owns (or manages) your YouTube channel.
3. Click the project dropdown at the top of the page → **New Project**.
4. Give it a name, e.g. `youtube-ai-automation`, and click **Create**.
5. Wait for the notification that the project was created, then select it
   from the project dropdown so it's your active project.

*(Screenshot placeholder: Google Cloud Console → New Project dialog)*

## Step 4 — Enable the YouTube Data API

1. In the Cloud Console, open the navigation menu → **APIs & Services** → **Library**.
2. Search for "YouTube Data API v3".
3. Click it, then click **Enable**.

*(Screenshot placeholder: API Library → YouTube Data API v3 → Enable button)*

## Step 5 — Configure the OAuth consent screen and credentials

1. Go to **APIs & Services** → **OAuth consent screen**.
2. Choose **External** (unless you have a Google Workspace organization) and click **Create**.
3. Fill in the required fields (app name, your email as support/developer contact). You can leave optional fields blank.
4. On the **Scopes** step, you don't need to add anything manually — the app requests scopes at runtime.
5. On the **Test users** step, add the Google account email that owns your YouTube channel. While the app is in "Testing" mode, only test users can authorize it.
6. Save and continue through to finish.
7. Now go to **APIs & Services** → **Credentials** → **Create Credentials** → **OAuth client ID**.
8. Application type: **Web application**.
9. Under **Authorized redirect URIs**, add: `http://localhost:3000/oauth2callback` (or whatever port/path you'll use — it must exactly match `YOUTUBE_REDIRECT_URI` in your `.env`).
10. Click **Create**. A dialog shows your **Client ID** and **Client Secret** — copy both.

*(Screenshot placeholder: Credentials → OAuth client ID → Client ID/Secret dialog)*

Fill these into `.env`:

```
YOUTUBE_CLIENT_ID=...
YOUTUBE_CLIENT_SECRET=...
YOUTUBE_REDIRECT_URI=http://localhost:3000/oauth2callback
```

## Step 6 — Generate an OAuth refresh token

This app includes a helper script that walks you through Google's consent
screen and prints a refresh token.

```bash
npm run generate-refresh-token
```

1. It prints a URL — open it in your browser.
2. Sign in with the same Google account you added as a test user, and click
   **Allow** to grant access to your YouTube channel.
3. Google redirects your browser to your redirect URI with a `code=...`
   query parameter in the address bar. Copy just that code value.
   (The page itself may show an error like "site can't be reached" — that's
   fine, since nothing is listening on that port. You only need the code
   from the URL.)
4. Paste the code back into the terminal when prompted.
5. Copy the printed `YOUTUBE_REFRESH_TOKEN=...` line into your `.env` file.

## Step 7 — Get a Gemini API key

1. Go to https://aistudio.google.com/app/apikey (Google AI Studio).
2. Sign in, click **Create API key**, and choose your Google Cloud project
   from Step 3 (or create a new one).
3. Copy the generated key into `.env`:

```
GEMINI_API_KEY=...
```

*(Screenshot placeholder: Google AI Studio → Create API key)*

## Step 8 — Fill in the rest of `.env`

Open `.env` and double-check every value is set. See
[API_KEYS.md](API_KEYS.md) for a field-by-field explanation of where each
value comes from, and the main `.env.example` for defaults and descriptions
of the non-credential settings (folders, cron schedule, privacy, etc).

## Step 9 — Run the database migration

```bash
npm run migrate
```

This creates `data/uploads.sqlite` with the `uploads` table. It also runs
automatically the first time the app starts, so this step is optional but
recommended to confirm everything is wired correctly.

## Step 10 — Start the application

```bash
# Sanity-check everything first (no uploads happen)
npm run health-check
npm run dry-run

# Then start for real
npm run dev      # development, auto-restarts on changes
# or
npm run build && npm start    # production
```

Drop a video into `videos/` and watch `logs/app.log` (or your terminal) —
it will be picked up on the next scheduled run.

---

## Google Drive Storage Setup

By default the app watches local folders (`videos/`, `uploaded/`,
`failed/`). If you'd rather store videos in Google Drive instead — for
example because the machine running the worker has limited disk space, or
you want to drop videos in from a phone or shared drive — set
`STORAGE_PROVIDER=gdrive` and follow this section. Everything else about
the app (metadata generation, YouTube upload, SQLite history, dry-run,
cron schedule) works identically either way.

### 1. Use (or create) a Google Cloud project

You can reuse the same Google Cloud project from Step 3, or create a
separate one — either works.

### 2. Enable the Google Drive API

1. In the Cloud Console, open **APIs & Services → Library**.
2. Search for "Google Drive API".
3. Click it, then click **Enable**.

*(Screenshot placeholder: API Library → Google Drive API → Enable button)*

### 3. Set up OAuth credentials for Drive

You can reuse the OAuth consent screen from Step 5, but you need a
**separate OAuth client ID** for Drive (or you can reuse the same one —
either is fine, since scopes are requested per-token, not per-client).

1. Go to **APIs & Services → Credentials → Create Credentials → OAuth
   client ID**.
2. Application type: **Web application**.
3. Add an **Authorized redirect URI**, e.g.
   `http://localhost:3000/oauth2callback` — this must match
   `GOOGLE_DRIVE_REDIRECT_URI` in `.env`.
4. Click **Create** and copy the **Client ID** and **Client Secret**.

Fill these into `.env`:

```
STORAGE_PROVIDER=gdrive
GOOGLE_DRIVE_CLIENT_ID=...
GOOGLE_DRIVE_CLIENT_SECRET=...
GOOGLE_DRIVE_REDIRECT_URI=http://localhost:3000/oauth2callback
```

### 4. Required scopes

The app requests the `https://www.googleapis.com/auth/drive` scope, which
allows it to read, create, and move files and folders in the authorized
account's Drive. This is required so it can find-or-create the
`videos`/`uploaded`/`failed` folders and move files between them.

### 5. Generate a Drive refresh token

```bash
npm run generate-gdrive-refresh-token
```

Follow the same flow as Step 6 (open the printed URL, sign in, authorize,
paste back the `code` from the redirect URL). Copy the printed
`GOOGLE_DRIVE_REFRESH_TOKEN=...` line into `.env`.

### 6. Folder creation and permissions

You have two options:

- **Automatic (recommended for first-time setup)**: leave
  `GOOGLE_DRIVE_FOLDER_VIDEOS`, `GOOGLE_DRIVE_FOLDER_UPLOADED`, and
  `GOOGLE_DRIVE_FOLDER_FAILED` blank in `.env`. On first run, the app
  searches the authorized account's Drive for folders named `videos`,
  `uploaded`, and `failed` at the root, and creates any that don't exist.
- **Explicit (recommended for production)**: create the three folders
  yourself in Drive, open each one, and copy the folder ID from the URL —
  e.g. `https://drive.google.com/drive/folders/<FOLDER_ID>`. Paste each ID
  into the matching `.env` variable. This avoids any ambiguity if your
  Drive already has folders with those names elsewhere.

Because the app authenticates as the same account that owns the folders
(via your refresh token), no separate sharing/permissions step is needed
as long as you authorized with the account that owns (or has edit access
to) the three folders.

### 7. Environment variables (summary)

```
STORAGE_PROVIDER=gdrive
GOOGLE_DRIVE_CLIENT_ID=...
GOOGLE_DRIVE_CLIENT_SECRET=...
GOOGLE_DRIVE_REDIRECT_URI=http://localhost:3000/oauth2callback
GOOGLE_DRIVE_REFRESH_TOKEN=...
GOOGLE_DRIVE_FOLDER_VIDEOS=       # optional — leave blank to auto-create
GOOGLE_DRIVE_FOLDER_UPLOADED=     # optional — leave blank to auto-create
GOOGLE_DRIVE_FOLDER_FAILED=       # optional — leave blank to auto-create
```

### 8. Running locally

Same commands as local storage — the provider is selected automatically
from `STORAGE_PROVIDER`:

```bash
npm run health-check   # confirms Drive credentials and folders resolve
npm run dry-run        # downloads the oldest Drive video, generates
                        # metadata, skips the actual upload
npm run dev
```

### 9. Running in production

Same as local storage (`npm run build && npm start`, under a process
manager). One extra consideration: each run downloads one video from
Drive to a local temporary directory (`os.tmpdir()/youtube-ai-automation-
gdrive`) for the duration of processing, then deletes it — make sure the
machine has enough free disk space for at least one video at a time (temp
files are deleted immediately after each upload attempt, whether it
succeeds or fails).

### 10. Verifying the integration

1. Run `npm run health-check` — it should print `Storage Provider: Google
   Drive` and show ✅ for "Storage provider initialized" and "Google Drive
   OAuth credentials valid".
2. Upload a small test video into the `videos` folder in Drive.
3. Run `npm run dry-run` — check `logs/app.log` for `Video discovered`,
   the downloaded temp path, and generated metadata, with no actual
   YouTube upload.
4. Run `npm run dev` (or trigger a real run) and confirm the file moves
   from the Drive `videos` folder into `uploaded` (or `failed`, with an
   error logged, if something goes wrong) and that the local temp copy is
   gone afterward.

---

## Common errors

- **"Invalid environment configuration"** — one or more required `.env`
  variables are missing or malformed. The error message lists exactly which
  ones.
- **`invalid_grant` when the app starts** — your refresh token is invalid or
  was revoked. Re-run `npm run generate-refresh-token`.
- **`accessNotConfigured` / API not enabled** — you skipped Step 4; enable
  the YouTube Data API v3 for your project.
- **`quotaExceeded` / `dailyLimitExceeded`** — see the Quota section below.
- **`STORAGE_PROVIDER=gdrive` fails validation on startup** — one or more of
  `GOOGLE_DRIVE_CLIENT_ID` / `GOOGLE_DRIVE_CLIENT_SECRET` /
  `GOOGLE_DRIVE_REFRESH_TOKEN` is missing; these are only required when
  `STORAGE_PROVIDER=gdrive`.
- **Google Drive `invalid_grant`** — same cause/fix as the YouTube one
  above, but for `GOOGLE_DRIVE_REFRESH_TOKEN`: re-run
  `npm run generate-gdrive-refresh-token`.
- **Google Drive `File not found` on move/download** — the file was
  deleted or moved manually in Drive between being discovered and
  processed; the app logs this and moves on to the next run.
- **New `videos`/`uploaded`/`failed` folders keep appearing in Drive** —
  folder auto-discovery matches by exact name at the Drive root; if you
  have unrelated folders with the same names elsewhere (e.g. inside
  another folder), set the `GOOGLE_DRIVE_FOLDER_*` IDs explicitly instead
  of relying on auto-discovery.

## Quota limits

The YouTube Data API v3 gives every project a default quota of **10,000
units per day**. A single video upload costs **1,600 units**, so by default
you can upload roughly 6 videos/day per project before hitting the limit.
Other calls (metadata reads, comment posting) cost a few units each. Quota
resets at midnight Pacific Time. You can request a quota increase from
Google, which involves an audit of your app.

Google Drive has its own, much more generous, per-user API rate limits
(queries per 100 seconds) rather than a small daily quota — for the
volumes this app generates (one list/download/move per video, per run),
you're unlikely to hit them.

## OAuth, explained simply

- Your app never sees or stores your Google password.
- The **Client ID/Secret** identify *your app* to Google.
- The **refresh token** is a long-lived credential that lets your app
  request short-lived access tokens on your behalf, without you having to
  log in again each time.
- If you ever want to revoke access, go to
  https://myaccount.google.com/permissions and remove the app.

## API pricing

- **YouTube Data API v3**: free, subject to the daily quota above. Quota
  increases are also free but require Google's review.
- **Gemini API**: Google AI Studio offers a free tier with rate limits; paid
  tiers are billed per token through Google Cloud billing. Check current
  pricing at https://ai.google.dev/pricing since it changes over time.
- **Google Drive API**: free to use; you're billed only for the Drive
  storage itself, on whatever Google Drive storage plan the account
  already has.

## Where every ENV variable comes from

| Variable | Source |
|---|---|
| `YOUTUBE_CLIENT_ID`, `YOUTUBE_CLIENT_SECRET` | Google Cloud Console → Credentials → your OAuth client (Step 5) |
| `YOUTUBE_REDIRECT_URI` | You choose this; must match the OAuth client's authorized redirect URI |
| `YOUTUBE_REFRESH_TOKEN` | Output of `npm run generate-refresh-token` (Step 6) |
| `GEMINI_API_KEY` | Google AI Studio → API keys (Step 7) |
| `STORAGE_PROVIDER` | You choose: `local` (default) or `gdrive` |
| `GOOGLE_DRIVE_CLIENT_ID`, `GOOGLE_DRIVE_CLIENT_SECRET` | Google Cloud Console → Credentials → your Drive OAuth client (Google Drive Storage Setup, step 3) — only required when `STORAGE_PROVIDER=gdrive` |
| `GOOGLE_DRIVE_REDIRECT_URI` | You choose this; must match the Drive OAuth client's authorized redirect URI |
| `GOOGLE_DRIVE_REFRESH_TOKEN` | Output of `npm run generate-gdrive-refresh-token` (Google Drive Storage Setup, step 5) |
| `GOOGLE_DRIVE_FOLDER_VIDEOS/UPLOADED/FAILED` | Optional Drive folder IDs (Google Drive Storage Setup, step 6); leave blank to auto-create |
| Everything else | You choose based on your own setup — see `.env.example` for defaults and meaning |
