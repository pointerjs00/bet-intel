# BetIntel — How to Update to the Latest Version

---

## API (Hetzner VPS)

A push to `main` that touches `apps/api/**` or `packages/shared/**` **automatically** builds and deploys via GitHub Actions. No manual steps needed.

To **trigger a deploy manually** without a code change:

1. Go to **GitHub → Actions → "Build & Deploy API" → Run workflow**
2. Select `main` → **Run workflow**

To **verify the API is running** after deploy:
```sh
ssh <user>@<hetzner-host>
docker ps | grep betintel-api
# Should show the container as Up
curl http://localhost:3000/api/health
```

---

## Mobile App (Android / iOS)

A push to `main` that touches `apps/mobile/**` **automatically** triggers an EAS build on Expo's servers (Android by default).

To **trigger a build manually** for a specific platform:

1. Go to **GitHub → Actions → "EAS Build" → Run workflow**
2. Choose platform: `all`, `android`, or `ios` → **Run workflow**

Or from your local machine (requires `eas-cli` logged in):
```sh
cd apps/mobile
eas build --platform android --profile production
# or
eas build --platform ios --profile production
```

Check build status: <https://expo.dev/accounts/[your-account]/projects/betintel/builds>

---

## Local Development

### First-time setup
```sh
# 1. Install dependencies (from repo root)
pnpm install

# 2. Start PostgreSQL + Redis
docker compose -f apps/api/docker-compose.yml up -d redis

# 3. Copy env file and fill in values
cp apps/api/src/.env.example apps/api/.env

# 4. Run database migrations
cd apps/api && pnpm prisma:migrate:dev && cd ../..

# 5. Seed betting sites
cd apps/api && pnpm prisma:seed && cd ../..
```

### Start API in dev mode
```sh
cd apps/api
pnpm dev
# API runs at http://localhost:3000
```

### Start mobile app
```sh
cd apps/mobile
pnpm start
# Then press 'a' for Android emulator, 'i' for iOS simulator, or scan QR with Expo Go
```

### Pull latest changes and restart
```sh
git pull
pnpm install          # in case new deps were added
cd apps/api && pnpm prisma:migrate:dev   # in case schema changed
```

---

## Database Maintenance

Run these after any scraper data quality issues:

```sh
# Merge all duplicate Betclic SportEvent rows (run from repo root)
cd apps/api && pnpm maintenance:repair-betclic-fetched-events

# Fix a specific event (replace values as needed)
cd apps/api && pnpm maintenance:dedupe-betclic-event \
  --externalId=<betclic-event-id> \
  --canonicalId=<prisma-cuid-to-keep> \
  --eventDate=<correct-ISO-date>
```

---

## Summary Table

| What | How | When |
|---|---|---|
| Deploy latest API | Push to `main` (auto) or trigger GH Action | Any `apps/api` change |
| Build latest mobile app | Push to `main` (auto) or trigger GH Action | Any `apps/mobile` change |
| Install new app build on device | Download from Expo dashboard or TestFlight/Play Console | After EAS build completes |
| Apply DB migrations | `cd apps/api && pnpm prisma:migrate:deploy` | After schema changes |
| Fix duplicate event data | `cd apps/api && pnpm maintenance:repair-betclic-fetched-events` | Ad hoc |
