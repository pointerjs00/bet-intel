# BetIntel — Local Development Setup

Step-by-step guide to run the full stack locally on Windows, from a fresh session.

---

## Prerequisites

Make sure you have these installed before starting. If any are missing, install them first.

| Tool | Version | Download |
|---|---|---|
| Node.js | 20 LTS | https://nodejs.org |
| pnpm | 9+ | `npm install -g pnpm` in a terminal |
| Docker Desktop | Latest | https://www.docker.com/products/docker-desktop |
| Git | Latest | https://git-scm.com |

To verify everything is installed, open **PowerShell** and run:

```powershell
node -v        # should print v20.x.x
pnpm -v        # should print 9.x.x
docker -v      # should print Docker version ...
git -v         # should print git version ...
```

---

## Step 1 — Open Docker Desktop

Docker must be running before you start any services.

1. Open the **Start menu** and search for **Docker Desktop**
2. Launch it and wait until the whale icon in the system tray (bottom-right) stops animating
3. The status should show **"Engine running"**

> Without Docker running, the database and Redis will not start.

---

## Step 2 — Open the Project

Open **PowerShell** (or Windows Terminal) and navigate to the project folder:

```powershell
cd C:\Users\jbsou\Desktop\bet-intel
```

---

## Step 3 — Install Dependencies

Run this once (and again any time you pull new changes that modify `package.json`):

```powershell
pnpm install
```

This installs dependencies for all packages in the monorepo (`apps/api`, `apps/mobile`, `packages/shared`) in one command.

---

## Step 4 — Set Up Environment Files

The project requires two `.env` files — one for the API and one for the mobile app.

### 4a — API environment file

```powershell
Copy-Item apps\api\src\.env.example apps\api\src\.env
```

Open `apps/api/src/.env` in VS Code and fill in the required values:

```env
# Database (matches the local Docker container — no changes needed)
DATABASE_URL="postgresql://betintel_user:fortunageracional21@localhost:5432/betintel"

# Redis (matches the local Docker container — no changes needed)
REDIS_URL="redis://localhost:6379"

# JWT secrets — generate two long random strings (min 64 chars each)
# Quick way: open PowerShell and run: [System.Web.Security.Membership]::GeneratePassword(64, 10)
# Or use: node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
JWT_SECRET="REPLACE_WITH_64_CHAR_RANDOM_STRING"
JWT_REFRESH_SECRET="REPLACE_WITH_DIFFERENT_64_CHAR_RANDOM_STRING"

# App
PORT=3000
NODE_ENV=development
LOG_LEVEL=debug
APP_URL=http://localhost:3000
ALLOWED_ORIGINS=http://localhost:8081,exp://localhost:8081

# Google / Firebase (needed for Google Sign-In)
# Get from Firebase Console → Project Settings → Service Accounts → Generate new private key
# Then base64-encode it: certutil -encode serviceAccountKey.json encoded.txt
FIREBASE_SERVICE_ACCOUNT_JSON=

# Email (needed for registration/password-reset emails; leave blank to skip locally)
SMTP_HOST=
SMTP_PORT=587
SMTP_USER=
SMTP_PASS=
SMTP_FROM="BetIntel <noreply@betintel.app>"

# Optional: API-Football (real match scores — leave blank to use safety-net polling only)
API_FOOTBALL_KEY=
API_FOOTBALL_POLL_INTERVAL_MS=3600000
```

> **Minimum to get the app running locally:** `DATABASE_URL`, `REDIS_URL`, `JWT_SECRET`, `JWT_REFRESH_SECRET`. Everything else is optional for basic testing.

### 4b — Mobile environment file

```powershell
Copy-Item apps\mobile\.env.example apps\mobile\.env
```

Open `apps/mobile/.env` — the defaults should already be correct for local dev:

```env
# Points to your local API
# Android emulator uses 10.0.2.2 to reach the host machine
EXPO_PUBLIC_API_BASE_URL=http://10.0.2.2:3000/api

# Google OAuth Web Client ID (from Google Cloud Console)
EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=235418572919-32ou8mp0mooms7dp5k6j4ov772qea2as.apps.googleusercontent.com
```

> If running on a **physical device** over Wi-Fi, replace `10.0.2.2` with your machine's local IP address (run `ipconfig` to find it, e.g. `192.168.1.100`):
> ```
> EXPO_PUBLIC_API_BASE_URL=http://192.168.1.100:3000/api
> ```

---

## Step 5 — Start the Database and Redis

This starts PostgreSQL and Redis in Docker containers:

```powershell
docker compose -f apps/api/docker-compose.dev.yml up -d
```

Verify they are running:

```powershell
docker ps
```

You should see two containers running:
- `betintel-postgres` on port `5432`
- `betintel-redis` on port `6379`

---

## Step 6 — Set Up the Database

Run migrations to create all tables, then seed the betting sites:

```powershell
# Create all DB tables
pnpm --filter api prisma:migrate:dev

# Seed betting site records (Betclic, Betano, Placard, Solverde, etc.)
pnpm --filter api prisma:seed
```

> You only need to run migrations again when the Prisma schema changes (someone added a new `model` or column). `pnpm install` won't do this automatically.

**Optional — open Prisma Studio** to browse the database in a GUI:

```powershell
pnpm --filter api prisma:studio
```

This opens a browser at `http://localhost:5555`.

---

## Step 7 — Start the API

Open a **new PowerShell window** (keep it open while developing):

```powershell
cd C:\Users\jbsou\Desktop\bet-intel
pnpm dev:api
```

The API will start on **http://localhost:3000**.

You should see output like:
```
info: Server running on port 3000
info: Socket.io server initialised
info: Bull job queues started
```

To verify it's working, open a browser and go to:
```
http://localhost:3000/api/odds/sites
```
You should get a JSON response listing the betting sites.

---

## Step 8 — Start the Mobile App

Open a **second new PowerShell window**:

```powershell
cd C:\Users\jbsou\Desktop\bet-intel
pnpm dev:mobile
```

The Expo Metro bundler starts and shows a QR code plus a menu:

```
› Metro waiting on exp://...
› Scan the QR code above with Expo Go (Android) or the Camera app (iOS)

› Press a │ open Android
› Press i │ open iOS simulator
› Press w │ open web

› Press r │ reload app
› Press m │ toggle menu
```

### Running options:

| Option | Command | Requirement |
|---|---|---|
| **Android emulator** | Press `a` | Android Studio + AVD Manager set up |
| **iOS simulator** | Press `i` | macOS + Xcode (not available on Windows) |
| **Physical device** | Scan QR with **Expo Go** app | Install Expo Go from Play Store / App Store |
| **Web browser** | Press `w` | Limited functionality (no native modules) |

> **Easiest on Windows:** Install **Expo Go** on your phone, connect it to the same Wi-Fi as your PC, and scan the QR code.

---

## Stopping Everything

When you're done, stop the services cleanly:

```powershell
# Stop the Docker containers (data is preserved)
docker compose -f apps/api/docker-compose.dev.yml down
```

Press `Ctrl+C` in each PowerShell window to stop the API and mobile bundler.

---

## Daily Workflow (After Initial Setup)

Once you've done the full setup above, your daily start sequence is:

1. **Open Docker Desktop** and wait for it to start
2. Open PowerShell → `cd C:\Users\jbsou\Desktop\bet-intel`
3. Start infra: `docker compose -f apps/api/docker-compose.dev.yml up -d`
4. Start API (new terminal): `pnpm dev:api`
5. Start mobile (new terminal): `pnpm dev:mobile`
OR
6. Open PowerShell → `cd C:\Users\jbsou\Desktop\bet-intel\apps\mobile`
7. Start mobile: `npx expo run:android` (for physical device or Android emulator)
---

## Troubleshooting

### `pnpm install` fails
Make sure you're in the repo root (`bet-intel/`), not inside `apps/api` or `apps/mobile`.

### API fails to start — `Can't reach database server`
- Docker Desktop isn't running, or the containers aren't up
- Run `docker ps` to check
- Run `docker compose -f apps/api/docker-compose.dev.yml up -d` again

### API fails to start — `Cannot find module '@betintel/shared'`
The shared package needs to be built:
```powershell
pnpm build:shared
```

### API fails to start — `Environment variable not found: DATABASE_URL`
The `.env` file is missing or in the wrong location. It must be at `apps/api/src/.env`.

### Mobile can't connect to API — `Network request failed`
- Make sure the API is running (`pnpm dev:api`)
- If on a physical device, check `EXPO_PUBLIC_API_BASE_URL` uses your machine's **local IP**, not `localhost` or `10.0.2.2`
- Make sure both your PC and phone are on the same Wi-Fi network

### Port already in use
Another process is using port 3000, 5432, or 6379. Find and stop it, or restart your machine.

### DB migrations fail — `relation already exists`
The DB already has tables from a previous run. Run:
```powershell
pnpm --filter api prisma:migrate:deploy
```

### API fails with Prisma error — `The column User.defaultBoletinsPublic does not exist`
Your local database is behind the current Prisma schema. Apply the pending migrations:
```powershell
pnpm --filter api prisma:migrate:deploy
```

If the API was already running, retry the request after the migration finishes. If you still see auth errors, sign in again so the app can refresh its session.

---

## Useful Commands

```powershell
# View API logs (if running in background)
docker logs betintel-api -f

# Reset the database completely (DELETES ALL DATA)
pnpm --filter api prisma:migrate:dev --name reset

# Manually trigger all scrapers
pnpm --filter api scrape:all

# Run TypeScript type check (no emit)
pnpm --filter api tsc --noEmit

# Lint everything
pnpm lint
```
