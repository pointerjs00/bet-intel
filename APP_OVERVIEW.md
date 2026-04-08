# BetIntel — App Overview

> Portuguese sports betting companion app for iOS & Android.
> Track your betting slips, analyse your performance, and share with friends.

---

## Table of Contents

1. [What Is BetIntel?](#what-is-betintel)
2. [Features](#features)
3. [Screens & Layout](#screens--layout)
4. [Design System](#design-system)
5. [Tech Stack](#tech-stack)
6. [Architecture](#architecture)
7. [Data & Metrics Tracked](#data--metrics-tracked)
8. [Sports & Competitions](#sports--competitions)
9. [Betting Sites Supported](#betting-sites-supported)
10. [Infrastructure & Deployment](#infrastructure--deployment)

---

## What Is BetIntel?

BetIntel is a full-stack mobile application that acts as a betting companion for the Portuguese market. It is **not** itself a betting platform — it is a personal tracker and analytics tool. Users manually log their bets ("boletins"), the app calculates ROI, win rate, profit/loss, and a wide range of breakdowns, and users can share boletins with friends inside the app.

The app is built as a monorepo (`pnpm workspaces`) with a React Native mobile client and a Node.js + Express REST API backend.

---

## Features

### Boletins (Betting Slips)
- Create multi-selection boletins (accumulators) with any number of picks
- Each pick records: sport, competition, home team, away team, market, selection, odds, betting site
- Stake input with automatic total odds, potential return, and ROI calculation
- Status tracking: **Pending → Won / Lost / Cashout / Void**
- Swipe-to-delete and swipe-to-share actions on the list
- Export your full betting history to **CSV** or **XLSX**
- Favourite (star) individual boletins for quick access
- Advanced filter & sort: by status, sport, competition, team, site, market, date range, odds range
- Free-text search across all boletins

### Statistics Dashboard
Full personal analytics engine calculated server-side and rendered with Victory Native charts:

| Metric | Description |
|--------|-------------|
| **ROI %** | `(Total Return − Total Staked) / Total Staked × 100` |
| **Win Rate** | Resolved boletins won / total resolved |
| **Total Staked** | Sum of all boletin stakes for the period |
| **Profit / Loss** | Net € gain or loss |
| **Streak** | Current win/loss streak + longest ever |
| **P&L Timeline** | Weekly or monthly profit/loss area chart |
| **Odds Range Analysis** | ROI broken down by odds bracket (<1.5, 1.5–2.0, 2.0–3.0, 3.0–5.0, 5.0+) |
| **By Sport** | Win rate and ROI per sport |
| **By Competition** | Performance grouped by competition |
| **By Market** | Performance grouped by market type (1X2, Over/Under, BTTS, etc.) |
| **By Betting Site** | Performance grouped by site |
| **Sport × Market Matrix** | 2D heatmap of win rate across sport and market combinations |
| **Heatmap Calendar** | GitHub-style activity calendar of bet frequency |
| **Freebet Tracking** | Dedicated section to separately track promoted/freebet results |
| **Best/Worst Boletins** | Quick access to best ROI and worst ROI slips |

All stats support **period filters**: This Week, This Month, This Year, All Time. Custom date ranges are also supported, as well as filtering by one or more betting sites.

### Social
- Send and receive friend requests by username
- Friends activity feed: see when friends add new boletins (if set to public)
- Share a specific boletin with a friend inside the app
- Notifications: friend requests, accepted requests, shared boletins (in-app + push)
- Per-user public profiles showing public stats and public boletins

### Favourites
- Star any boletin to pin it to a dedicated Favourites view
- Favourites are persisted server-side and synced across devices

### Authentication
Dual-method auth — both methods share the same JWT access/refresh token flow:

| Method | Details |
|--------|---------|
| **Email + Password** | Registration with email verification, bcrypt password hashing (cost 12), brute-force lockout after 5 failed attempts (15 min ban), password reset via email deep-link |
| **Google Sign-In** | Firebase Authentication token verified server-side with `firebase-admin`; new Google users pick a username before entering the app; existing email accounts auto-linked when the same email is used |

Token security: 15-min access tokens (HS256 JWT) + 30-day refresh tokens stored as SHA-256 hashes in the database with automatic rotation and reuse detection.

### Account Management
- Change email, change password
- Link Google account to an existing email account
- Unlink Google (only allowed if a password is set)
- Set a password for a Google-only account (upgrades to HYBRID auth)
- Notification preferences per category
- Theme preference (Light / Dark / System) persisted in the database

---

## Screens & Layout

### Tab Navigation (bottom tabs)
```
┌───────────────────────────────────────┐
│  Boletins  │  Stats  │  Friends  │  Profile │
└───────────────────────────────────────┘
```

### Screen Inventory

| Screen | Path | Purpose |
|--------|------|---------|
| Boletins List | `app/(tabs)/index.tsx` | Main list of all boletins with status chips, search, filter, and sort |
| Stats | `app/(tabs)/stats.tsx` | Full analytics dashboard with charts and tables |
| Friends | `app/(tabs)/friends.tsx` | Feed / Friends list / Requests tabs |
| Profile & Settings | `app/(tabs)/profile.tsx` | User profile, account security, notifications, theme |
| Create Boletin | `app/boletins/create.tsx` | Step-by-step builder to add selections, set stake, name/notes |
| Boletin Detail | `app/boletins/[id].tsx` | Full detail view with per-pick results, share, edit |
| Metric Info | `app/metric-info.tsx` | In-app tooltip explaining a stat formula |
| Login | `app/(auth)/login.tsx` | Email+password login + Google Sign-In |
| Register | `app/(auth)/register.tsx` | Account creation + real-time username availability check |
| Google Username | `app/(auth)/google-username.tsx` | Username picker for new Google sign-in users |
| Forgot Password | `app/(auth)/forgot-password.tsx` | Request password reset email |
| Reset Password | `app/(auth)/reset-password.tsx` | Set new password via deep-link token |

### Create Boletin Screen Layout
```
┌─────────────────────────────────────────┐
│  [Sport pill tabs: ⚽🏀🎾🤾🏐🏒🏉🏈⚾]  │
│  Competition  ▼  [CompetitionPickerModal]│
│  Home Team    ▼  [SearchableDropdown]   │
│  Away Team    ▼  [SearchableDropdown]   │
│  Market       ▼  [SearchableDropdown]   │
│  Selection    __                        │
│  Odd Value    __                        │
│  Betting Site ▼                         │
│  ─────────────────────────────────────  │
│  [+ Adicionar ao boletim] (secondary)   │
│  ─────────────────────────────────────  │
│  Saved selections list (FlatList)       │
│  OddsCalculator (total odds, return)    │
│  Stake input                            │
│  Name & Notes (optional)               │
│  ProjectionCard (ROI projection)        │
│  ─────────────────────────────────────  │
│  [✓ Guardar boletim] (primary, hidden   │
│   when keyboard is open)               │
└─────────────────────────────────────────┘
```

### Stats Screen Layout
```
┌─────────────────────────────────────────┐
│  Period: Week│Month│Year│All  + Custom  │
│  Site filter (multi-select dropdown)    │
│  ─────────────────────────────────────  │
│  ROICard (large: ROI %, staked, P/L)   │
│  WinRateRing (circular %) + StreakCard  │
│  PnLChart (area chart, weekly/monthly)  │
│  OddsRangeBar (bar chart by odds range) │
│  HeatmapCalendar (activity)             │
│  SportMarketMatrix (heatmap grid)       │
│  BreakdownTable (by sport)              │
│  BreakdownTable (by competition)        │
│  BreakdownTable (by market)             │
│  SiteROITable                           │
│  FreebetCard                            │
│  Best/Worst boletins (horizontal scroll)│
│  [Export CSV] [Export XLSX]             │
└─────────────────────────────────────────┘
```

---

## Design System

### Color Palette

**Dark Mode (OLED primary)**

| Role | Hex | Usage |
|------|-----|-------|
| Background | `#0D0D0D` | Screen backgrounds |
| Surface | `#1A1A1A` | Cards, modals |
| Surface Raised | `#242424` | Inputs, chips, elevated cards |
| Border | `#2E2E2E` | Dividers, input borders |
| Primary | `#00C851` | CTAs, win indicators, positive stats |
| Primary Dark | `#009A3E` | Button press states |
| Danger | `#FF3B30` | Losses, destructive actions, live |
| Warning | `#FF9500` | Pending bets, uncertain states |
| Info | `#007AFF` | Informational badges |
| Gold | `#FFD700` | Best odds highlight, top performers |
| Text Primary | `#FFFFFF` | Headings, primary content |
| Text Secondary | `#A0A0A0` | Labels, metadata |
| Text Muted | `#505050` | Placeholders, disabled text |

**Light Mode** mirrors the same roles with adapted hex values (`#F2F2F7` background, `#FFFFFF` surface, `#00A843` primary, etc.).

**Rule:** No hex values hardcoded in components — always `useTheme()` → `colors.X`.

### Typography

| Scale | px | Usage |
|-------|----|-------|
| `xs` | 11 | Timestamps, fine print |
| `sm` | 13 | Labels, chips, metadata |
| `md` | 15 | Body text |
| `lg` | 17 | Section headings |
| `xl` | 20 | Card titles |
| `xxl` | 24 | Section hero values |
| `display` | 32 | ROI %, hero metrics |

Weights: `400 / 500 / 600 / 700 / 900`

### Spacing & Border Radius

| Token | Value |
|-------|-------|
| `xs` | 4 |
| `sm` | 8 |
| `md` | 12 |
| `lg` | 16 |
| `xl` | 24 |
| `xxl` | 32 |
| Radius `sm` | 6 |
| Radius `md` | 10 |
| Radius `lg` | 14 |
| Radius `xl` | 20 |

### Key UI Components

| Component | File | Description |
|-----------|------|-------------|
| `Button` | `components/ui/Button.tsx` | Variants: `primary`, `secondary`, `ghost`, `danger`; sizes: `sm`, `md`, `lg` |
| `Input` | `components/ui/Input.tsx` | Text, numeric, password; label + error + icon slot |
| `Card` | `components/ui/Card.tsx` | Base surface with shadow/elevation |
| `Badge` | `components/ui/Badge.tsx` | Status chips (color per state) |
| `Chip` | `components/ui/Chip.tsx` | Filter/selection pills |
| `Avatar` | `components/ui/Avatar.tsx` | Image with initials fallback |
| `Skeleton` | `components/ui/Skeleton.tsx` | Loading placeholder blocks |
| `EmptyState` | `components/ui/EmptyState.tsx` | Illustrated empty states |
| `Toast` | `components/ui/Toast.tsx` | In-app notification toasts |
| `BottomSheet` | `components/ui/BottomSheet.tsx` | `@gorhom/bottom-sheet` wrapper |
| `CompetitionBadge` | `components/ui/CompetitionBadge.tsx` | League logo (Sofascore CDN) with flag emoji fallback |
| `TeamBadge` | `components/ui/TeamBadge.tsx` | Team crest / player photo with initials fallback |
| `SearchableDropdown` | `components/ui/SearchableDropdown.tsx` | Searchable, sectioned picker modal |
| `CompetitionPickerModal` | `components/ui/CompetitionPickerModal.tsx` | Sectioned competition picker by country |
| `RangeSlider` | `components/ui/RangeSlider.tsx` | Dual-handle slider for odds/date range filters |
| `BoletinCard` | `components/boletins/BoletinCard.tsx` | Compact boletin summary card |
| `BoletinItem` | `components/boletins/BoletinItem.tsx` | Single pick row in detail view |
| `BoletinFilterSheet` | `components/boletins/BoletinFilterSheet.tsx` | Advanced filter bottom sheet |
| `OddsCalculator` | `components/boletins/OddsCalculator.tsx` | Live total odds + return display |
| `StakeInput` | `components/boletins/StakeInput.tsx` | Currency-formatted stake field |
| `StatusBadge` | `components/boletins/StatusBadge.tsx` | Pending / Won / Lost / Cashout / Void chip |
| `ProjectionCard` | `components/boletins/ProjectionCard.tsx` | ROI projection given current stake & odds |
| `ROICard` | `components/stats/ROICard.tsx` | Large hero ROI metric card |
| `WinRateRing` | `components/stats/WinRateRing.tsx` | Circular progress chart |
| `PnLChart` | `components/stats/PnLChart.tsx` | Area chart (Victory Native) |
| `OddsRangeBar` | `components/stats/OddsRangeBar.tsx` | Bar chart for odds range analysis |
| `BreakdownTable` | `components/stats/BreakdownTable.tsx` | Generic breakdown table |
| `HeatmapCalendar` | `components/stats/HeatmapCalendar.tsx` | Calendar-style activity heatmap |
| `SportMarketMatrix` | `components/stats/SportMarketMatrix.tsx` | 2D win-rate heatmap grid |
| `SiteROITable` | `components/stats/SiteROITable.tsx` | Per-site ROI breakdown table |
| `StreakCard` | `components/stats/StreakCard.tsx` | Current and longest streak display |
| `FreebetCard` | `components/stats/FreebetCard.tsx` | Freebet-specific stats section |
| `ActivityFeedItem` | `components/social/ActivityFeedItem.tsx` | Friend activity row in the feed |
| `FriendCard` | `components/social/FriendCard.tsx` | Friend summary card |
| `FriendRequestCard` | `components/social/FriendRequestCard.tsx` | Accept / decline inline request |
| `NotificationItem` | `components/social/NotificationItem.tsx` | Notification row with read state |

### Animations
- `react-native-reanimated` v3 — `FadeInDown` / `FadeInUp` on screen mount
- `@shopify/react-native-skia` available for complex canvas animations
- Keyboard handling: `keyboardVisible` state (Keyboard.addListener) hides the save footer to avoid overlay

---

## Tech Stack

### Mobile (Frontend)

| Technology | Version | Role |
|------------|---------|------|
| React Native | 0.74.5 | Core framework |
| Expo | SDK ~51 | Build tooling, native APIs |
| TypeScript | Strict | Language |
| Expo Router | ~3.5 | File-based navigation |
| TanStack Query | v5 | Server state / caching |
| Zustand | — | Client state stores |
| NativeWind | v4 | Tailwind CSS for React Native |
| React Native Reanimated | ~3.10 | Animations |
| Victory Native | v41 | Charts (Area, Bar, Scatter) |
| @shopify/react-native-skia | ~1.2 | Canvas-based chart rendering |
| @gorhom/bottom-sheet | v4 | Bottom sheet modals |
| Expo Vector Icons | v14 | `MaterialCommunityIcons` + `Ionicons` |
| Expo Notifications | ~0.28 | Push notifications |
| Expo SecureStore | ~13 | Token storage (hardware-backed) |
| Expo Linking | ~6.3 | Deep links (password reset, shared boletins) |
| Socket.io client | v4 | Real-time updates |
| Axios | v1 | HTTP client with interceptors |
| React Hook Form + Zod | — | Forms and schema validation |
| @react-native-google-signin/google-signin | v13 | Google Sign-In |
| @react-native-firebase/auth | v20 | Firebase token flow |
| xlsx | — | XLSX export |

### Backend (API)

| Technology | Version | Role |
|------------|---------|------|
| Node.js | 20 LTS | Runtime |
| Express | v4 | HTTP framework |
| TypeScript | Strict | Language |
| Prisma | v5 | ORM / migrations |
| PostgreSQL | 16 | Primary database (Hetzner VPS) |
| Redis | 7 | Queue backend + caching |
| Bull | v4 | Job queue (scraping + ATP rankings) |
| Socket.io | v4 | WebSocket server |
| Firebase Admin SDK | v12 | Google ID token verification |
| bcrypt | v5 | Password hashing (cost 12) |
| jsonwebtoken | v9 | JWT access/refresh tokens |
| Nodemailer | v6 | Transactional email (verification, reset) |
| Helmet | v7 | HTTP security headers |
| express-rate-limit | v7 | IP rate limiting |
| Puppeteer-extra + stealth | — | Headless browser scraping |
| Cheerio | v1 | HTML parsing |
| Winston + Morgan | — | Structured logging |
| Swagger/OpenAPI | 3.0 | API documentation |
| Zod | v3 | Request validation |

### Shared Package
`packages/shared/` — TypeScript types, enums, and Zod schemas shared between mobile and API:
- `Sport`, `BoletinStatus`, `ItemResult`, `AuthProvider`, `StatsPeriod` enums
- Shared DTOs: `BoletinDetail`, `BoletinSummary`, `UserProfile`, etc.
- Tennis utility functions: `compareTennisCompetitions`, `getTennisTournamentCountry`, `getTennisTournamentPoints`

---

## Architecture

### Monorepo Structure
```
betintel/
├── apps/
│   ├── mobile/               # Expo React Native app
│   │   ├── app/              # Expo Router screens
│   │   │   ├── (auth)/       # Login, Register, Google onboarding, Reset password
│   │   │   ├── (tabs)/       # Main tabs: Boletins, Stats, Friends, Profile
│   │   │   └── boletins/     # Create + Detail screens
│   │   ├── components/       # Reusable React Native components
│   │   │   ├── ui/           # Core primitives
│   │   │   ├── boletins/     # Boletin-domain components
│   │   │   ├── stats/        # Chart and metric components
│   │   │   └── social/       # Friends and notifications
│   │   ├── stores/           # Zustand: authStore, boletinBuilderStore, themeStore
│   │   ├── services/         # React Query hooks + API calls
│   │   ├── theme/            # tokens.ts, useTheme hook
│   │   └── utils/            # sportAssets, formatters, marketUtils, haptics
│   └── api/
│       └── src/
│           ├── routes/       # Express routers
│           ├── controllers/  # Request handlers
│           ├── services/     # Business logic (auth, boletins, stats, social)
│           ├── jobs/         # Bull queue jobs (ATP rankings)
│           ├── middleware/   # Auth, rate limiting, validation
│           ├── sockets/      # Socket.io real-time handlers
│           └── prisma/       # schema.prisma + seed.ts + migrations
├── packages/
│   └── shared/               # Shared types and schemas
└── .github/workflows/        # CI/CD pipelines
```

### State Management

| Store | File | Contents |
|-------|------|---------|
| Auth | `stores/authStore.ts` | `user`, `accessToken`, `isAuthenticated`, `login()`, `logout()`, `refreshToken()` |
| Boletin Builder | `stores/boletinBuilderStore.ts` | In-progress picks, stake, name; `totalOdds` + `potentialReturn` computed; `save()` |
| Theme | `stores/themeStore.ts` | Preference (light/dark/system), resolved active theme |

Server state (boletins list, stats, friends, competitions, teams, markets) is all managed by TanStack Query with appropriate stale times and cache invalidation.

### API Communication
- Base URL configured in `services/runtimeConfig.ts` (reads `EXPO_PUBLIC_API_URL`)
- Axios instance in `services/apiClient.ts` with:
  - Auth header injection from `authStore`
  - Automatic token refresh on 401
  - No sensitive data logged

### Real-time (Socket.io)
- `services/socketService.ts` — singleton connection, reconnects on app foreground
- Server emits: `boletin:result`, `friend:activity`, `notification:new`, `odds:updated`

---

## Data & Metrics Tracked

### Per Boletin
- Name (optional), creation date, status
- Stake (€), total odds, potential return, actual return (when resolved)
- Notes (free text)
- Is public (for friend sharing)
- Each pick: sport, competition, home/away team, market, selection, odds, site, result

### Stats Aggregations (all filterable by period and site)

| Aggregation | API Endpoint |
|-------------|-------------|
| Summary (ROI, win rate, P/L, counts) | `GET /api/stats/me/summary` |
| Full stats object | `GET /api/stats/me` |
| P&L timeline (weekly/monthly) | `GET /api/stats/me/timeline` |
| By sport | `GET /api/stats/me/by-sport` |
| By competition | `GET /api/stats/me/by-competition` |
| By market | `GET /api/stats/me/by-market` |
| By betting site | `GET /api/stats/me/by-site` |
| By odds range | `GET /api/stats/me/by-odds-range` |
| Sport × market matrix | `GET /api/stats/me/sport-market-matrix` |
| Heatmap calendar | `GET /api/stats/me/heatmap` |
| Streaks | `GET /api/stats/me/streaks` |
| Freebets | `GET /api/stats/me/freebets` |

### Boletin Status Flow
```
PENDING  ──►  WON
         ──►  LOST
         ──►  CASHOUT   (partial early settlement)
         ──►  VOID      (all picks void/cancelled)
         ──►  PARTIAL   (some picks void, rest settled)
```

---

## Sports & Competitions

### Supported Sports
| Sport | Icon | Notes |
|-------|------|-------|
| Football | ⚽ | The primary sport; hundreds of competitions seeded |
| Basketball | 🏀 | EuroLeague, NBA, ACB, Betclic Elite, LNB Pro A, etc. |
| Tennis | 🎾 | ATP + WTA tour with ranking-based team pool; all 4 Grand Slams + Masters |
| Handball | 🤾 | |
| Volleyball | 🏐 | |
| Ice Hockey | 🏒 | |
| Rugby | 🏉 | |
| American Football | 🏈 | |
| Baseball | ⚾ | |
| Other | 🏅 | Catch-all for anything else |

### Football Coverage (sample countries with seeded competitions)
Portugal, England, Scotland, Spain, Italy, Germany, France, Netherlands, Belgium, Turkey, Austria, Switzerland, Greece, Russia, Ukraine, Poland, Romania, Croatia, Serbia, Hungary, Czech Republic, Slovakia, Norway, Sweden, Denmark, Ireland, Brazil, Argentina, Mexico, Colombia, Chile, Peru, Uruguay, USA, Canada, Japan, South Korea, Saudi Arabia, UAE, Morocco, South Africa, Nigeria

**International:** UEFA Champions League, UEFA Europa League, UEFA Conference League, UEFA Nations League, UEFA Euro, Copa América, Copa Libertadores, Copa Sudamericana, FIFA World Cup, FIFA Club World Cup, CONCACAF Gold Cup, Africa Cup of Nations, CAF Champions League, Olympic Games

### Competition Logos
Fetched from the Sofascore CDN (`img.sofascore.com/api/v1/unique-tournament/{id}/image`) for all major competitions. Fallback chain: `LEAGUE_LOGOS` map → `SOFASCORE_TOURNAMENT_IDS` dynamic lookup → country flag emoji badge.

---

## Betting Sites Supported

| Site | Slug | Notes |
|------|------|-------|
| Betclic | `betclic` | Largest PT operator |
| Placard | `placard` | State-owned (Santa Casa) |
| Bet365 | `bet365` | International |
| ESC Online | `esconline` | |
| Moosh | `moosh` | |
| Solverde | `solverde` | |
| Betway | `betway` | |
| 888sport | `888sport` | |
| Betano | `betano` | |
| Bwin | `bwin` | |
| Lebull | `lebull` | |

---

## Infrastructure & Deployment

### Backend Hosting
- **VPS**: Hetzner dedicated server
- **Database**: PostgreSQL 16 (existing managed instance on same VPS)
- **Cache / Queue**: Redis 7 (Docker container)
- **Reverse Proxy**: Nginx with TLS (Let's Encrypt certificates)
- **Containers**: Docker + Docker Compose

### CI/CD

**API** (`.github/workflows/build-api.yml`):
1. Push to `main` with changes in `apps/api/` or `packages/shared/`
2. Build Docker image → push to GitHub Container Registry (`ghcr.io`)
3. SSH into Hetzner → `docker pull` → `docker-compose up -d --no-deps api`

**Mobile** (`.github/workflows/build-mobile.yml`):
1. Push to `main` with changes in `apps/mobile/`
2. Expo EAS Build → `.ipa` (iOS) + `.apk` / `.aab` (Android)
3. Manual trigger supports `--platform android|ios|all`

### Mobile Distribution
- **EAS Build**: Expo Application Services for managed binary builds
- **Bundle ID**: `com.betintel.app` (iOS & Android)
- **Deep links**: `betintel://` scheme for password reset and shared boletin links

### Rate Limiting (Redis-backed)

| Endpoint | Limit |
|----------|-------|
| `POST /auth/login` | 10 req / 15 min per IP |
| `POST /auth/register` | 5 req / hour per IP |
| `POST /auth/forgot-password` | 3 req / hour per IP |
| `POST /auth/google` | 20 req / 15 min per IP |
| All other routes | 500 req / 15 min per IP |

### Background Jobs
- **ATP Rankings** (`jobs/atpRankingsJob.ts`): Periodic Bull job that syncs ATP/WTA player rankings into the database for accurate tennis team data.

### Security
- Helmet.js for HTTP security headers (CSP, HSTS, X-Frame-Options, etc.)
- All secrets in `.env` (never committed); `FIREBASE_SERVICE_ACCOUNT_JSON` as base64 env var
- Tokens stored in `expo-secure-store` (hardware-backed keystore/keychain) on mobile
- Parameterised Prisma queries everywhere — no raw SQL in auth paths
- Winston logs all auth events; never logs passwords, tokens, or full emails in production

---

*Last updated: see git history for latest changes.*
