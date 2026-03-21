# BETINTEL APP — Full-Stack Mobile Application
## GitHub Copilot Pro — Master Build Prompt

---

## 1. PROJECT OVERVIEW

Build a full-stack mobile application called **"BetIntel"** — a Portuguese sports betting companion app that scrapes odds from Portuguese betting sites, lets users create and manage betting slips ("boletins" — the Portuguese term used throughout the app), track their betting history and performance, and share activity with friends.

The app must be production-ready, targeting **iOS and Android** via **React Native (Expo)** for the frontend and a **Node.js/Express** backend deployed via **Docker on Hetzner VPS**, matching an existing CI/CD pipeline.

---

## 2. TECH STACK

### Mobile (Frontend)
- **Framework**: React Native with Expo (SDK 51+)
- **Language**: TypeScript (strict mode)
- **Navigation**: Expo Router (file-based routing)
- **State Management**: Zustand + React Query (TanStack Query v5)
- **UI/Styling**: NativeWind (Tailwind CSS for React Native) + custom StyleSheet for complex components
- **Charts**: Victory Native XL
- **Icons**: Expo Vector Icons (MaterialCommunityIcons + Ionicons)
- **Animations**: React Native Reanimated 3
- **Theming**: `ThemeProvider` with light/dark mode via `useColorScheme` + user preference persistence
- **Push Notifications**: Expo Notifications
- **Storage**: Expo SecureStore (tokens) + AsyncStorage (preferences)
- **HTTP Client**: Axios with interceptors
- **Forms**: React Hook Form + Zod validation
- **Google Auth**: `@react-native-google-signin/google-signin` + Firebase SDK (`@react-native-firebase/auth`, `@react-native-firebase/app`)

### Backend (API)
- **Runtime**: Node.js 20 LTS
- **Framework**: Express.js with TypeScript
- **Database**: PostgreSQL 16 (existing Hetzner instance)
- **ORM**: Prisma
- **Auth**: Dual-method — Email/password (JWT + bcrypt) AND Google OAuth 2.0 via Firebase Authentication
- **Scraping**: Puppeteer (headless Chromium) + Cheerio for HTML parsing
- **Job Queue**: Bull + Redis (for scheduled scraping jobs)
- **Cache**: Redis (odds cache, 5-minute TTL)
- **WebSockets**: Socket.io (real-time odds updates, friend activity feed)
- **Validation**: Zod
- **Logging**: Winston + Morgan
- **API Docs**: Swagger/OpenAPI 3.0
- **Google Auth (backend)**: `firebase-admin` SDK — verifies Firebase ID tokens issued by Google Sign-In

### Infrastructure & DevOps
- **Containerisation**: Docker + Docker Compose
- **CI/CD**: GitHub Actions → GitHub Container Registry (ghcr.io) → Hetzner VPS
- **Reverse Proxy**: Nginx (already running on Hetzner)
- **Environment**: `.env` files with Docker secrets
- **Mobile Distribution**: Expo EAS Build (for .ipa and .apk production builds)

---

## 3. MONOREPO STRUCTURE

```
betintel/
├── apps/
│   ├── mobile/                    # Expo React Native app
│   │   ├── app/                   # Expo Router screens
│   │   │   ├── (auth)/
│   │   │   │   ├── login.tsx
│   │   │   │   ├── register.tsx
│   │   │   │   ├── forgot-password.tsx
│   │   │   │   └── google-username.tsx   # Username picker for new Google sign-in users
│   │   │   ├── (tabs)/
│   │   │   │   ├── index.tsx      # Home / Odds feed
│   │   │   │   ├── slips.tsx      # My Betting Slips (Boletins)
│   │   │   │   ├── stats.tsx      # Statistics dashboard
│   │   │   │   ├── friends.tsx    # Friends & social
│   │   │   │   └── profile.tsx    # User profile & settings
│   │   │   ├── odds/
│   │   │   │   ├── [eventId].tsx  # Event detail
│   │   │   │   └── filter.tsx     # Filter modal
│   │   │   ├── betintel/
│   │   │   │   ├── create.tsx     # Create boletin
│   │   │   │   └── [id].tsx       # Boletin detail
│   │   │   └── _layout.tsx
│   │   ├── components/
│   │   │   ├── ui/                # Generic UI primitives
│   │   │   ├── odds/              # Odds-specific components
│   │   │   ├── betintel/          # Boletin components
│   │   │   ├── stats/             # Chart & stat components
│   │   │   └── social/            # Friends & social components
│   │   ├── hooks/
│   │   ├── stores/                # Zustand stores
│   │   ├── services/              # API service layer
│   │   ├── utils/
│   │   ├── constants/
│   │   ├── theme/                 # Design tokens, dark/light themes
│   │   └── types/
│   └── api/                       # Express backend
│       ├── src/
│       │   ├── routes/
│       │   ├── controllers/
│       │   ├── services/
│       │   │   ├── scraper/       # Betting site scrapers
│       │   │   ├── odds/
│       │   │   ├── auth/
│       │   │   ├── betintel/
│       │   │   └── social/
│       │   ├── jobs/              # Bull queue jobs
│       │   ├── middleware/
│       │   ├── prisma/
│       │   │   └── schema.prisma
│       │   ├── sockets/           # Socket.io handlers
│       │   ├── utils/
│       │   └── types/
│       ├── Dockerfile
│       └── docker-compose.yml
├── packages/
│   └── shared/                    # Shared TypeScript types & Zod schemas
│       └── src/
│           ├── types/
│           └── schemas/
├── .github/
│   └── workflows/
│       ├── build-api.yml
│       └── build-mobile.yml
└── package.json                   # Root workspace (pnpm workspaces)
```

---

## 4. DATABASE SCHEMA (Prisma)

```prisma
// apps/api/src/prisma/schema.prisma

generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model User {
  id                  String       @id @default(cuid())
  email               String       @unique
  username            String       @unique
  passwordHash        String?      // null for Google-only accounts
  googleId            String?      @unique  // Firebase UID from Google Sign-In
  authProvider        AuthProvider @default(EMAIL)
  isEmailVerified     Boolean      @default(false)
  emailVerifyToken    String?      @unique
  emailVerifyExpiry   DateTime?
  passwordResetToken  String?      @unique
  passwordResetExpiry DateTime?
  displayName         String?
  avatarUrl           String?
  bio                 String?
  preferredSites      String[]     // betting site slugs
  theme               Theme        @default(SYSTEM)
  currency            String       @default("EUR")
  lastLoginAt         DateTime?
  failedLoginAttempts Int          @default(0)
  lockedUntil         DateTime?    // brute-force lockout
  createdAt           DateTime     @default(now())
  updatedAt           DateTime     @updatedAt

  boletins         Boletin[]
  refreshTokens    RefreshToken[]
  friendships      Friendship[]    @relation("UserFriendships")
  friendOf         Friendship[]    @relation("FriendFriendships")
  sentRequests     FriendRequest[] @relation("SentRequests")
  receivedRequests FriendRequest[] @relation("ReceivedRequests")
  sharedBetIntel   SharedBoletin[]
  notifications    Notification[]
}

enum AuthProvider {
  EMAIL    // username + password
  GOOGLE   // Google OAuth via Firebase
  HYBRID   // account has both methods linked
}

enum Theme {
  LIGHT
  DARK
  SYSTEM
}

model RefreshToken {
  id        String   @id @default(cuid())
  token     String   @unique
  userId    String
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  expiresAt DateTime
  createdAt DateTime @default(now())
}

model BettingSite {
  id          String   @id @default(cuid())
  slug        String   @unique  // e.g. "betclic", "bet365", "placard"
  name        String
  logoUrl     String?
  baseUrl     String
  isActive    Boolean  @default(true)
  lastScraped DateTime?
  createdAt   DateTime @default(now())

  odds        Odd[]
}

model SportEvent {
  id           String    @id @default(cuid())
  externalId   String?   // ID from betting site
  sport        Sport
  league       String
  homeTeam     String
  awayTeam     String
  eventDate    DateTime
  status       EventStatus @default(UPCOMING)
  homeScore    Int?
  awayScore    Int?
  createdAt    DateTime  @default(now())
  updatedAt    DateTime  @updatedAt

  odds         Odd[]
  boletinItems BoletinItem[]
}

enum Sport {
  FOOTBALL
  BASKETBALL
  TENNIS
  HANDBALL
  VOLLEYBALL
  HOCKEY
  RUGBY
  AMERICAN_FOOTBALL
  BASEBALL
  OTHER
}

enum EventStatus {
  UPCOMING
  LIVE
  FINISHED
  CANCELLED
  POSTPONED
}

model Odd {
  id          String      @id @default(cuid())
  siteId      String
  site        BettingSite @relation(fields: [siteId], references: [id])
  eventId     String
  event       SportEvent  @relation(fields: [eventId], references: [id])
  market      String      // e.g. "1X2", "Over/Under 2.5", "BTTS"
  selection   String      // e.g. "1", "X", "2", "Over", "Under"
  value       Decimal     @db.Decimal(10, 2)
  isActive    Boolean     @default(true)
  scrapedAt   DateTime    @default(now())
  updatedAt   DateTime    @updatedAt
}

model Boletin {
  id           String        @id @default(cuid())
  userId       String
  user         User          @relation(fields: [userId], references: [id], onDelete: Cascade)
  name         String?
  stake        Decimal       @db.Decimal(10, 2)
  totalOdds    Decimal       @db.Decimal(10, 4)
  potentialReturn Decimal    @db.Decimal(10, 2)
  status       BoletinStatus @default(PENDING)
  actualReturn Decimal?      @db.Decimal(10, 2)
  notes        String?
  isPublic     Boolean       @default(false)
  createdAt    DateTime      @default(now())
  updatedAt    DateTime      @updatedAt

  items        BoletinItem[]
  sharedWith   SharedBoletin[]
}

enum BoletinStatus {
  PENDING     // awaiting results
  WON
  LOST
  VOID        // cancelled/void events
  PARTIAL     // some events void
}

model BoletinItem {
  id          String     @id @default(cuid())
  boletinId   String
  boletin     Boletin    @relation(fields: [boletinId], references: [id], onDelete: Cascade)
  eventId     String
  event       SportEvent @relation(fields: [eventId], references: [id])
  siteId      String
  market      String
  selection   String
  oddValue    Decimal    @db.Decimal(10, 2)
  result      ItemResult @default(PENDING)

  @@index([boletinId])
}

enum ItemResult {
  PENDING
  WON
  LOST
  VOID
}

model Friendship {
  id        String   @id @default(cuid())
  userId    String
  friendId  String
  user      User     @relation("UserFriendships", fields: [userId], references: [id])
  friend    User     @relation("FriendFriendships", fields: [friendId], references: [id])
  createdAt DateTime @default(now())

  @@unique([userId, friendId])
}

model FriendRequest {
  id         String        @id @default(cuid())
  senderId   String
  receiverId String
  sender     User          @relation("SentRequests", fields: [senderId], references: [id])
  receiver   User          @relation("ReceivedRequests", fields: [receiverId], references: [id])
  status     RequestStatus @default(PENDING)
  createdAt  DateTime      @default(now())
  updatedAt  DateTime      @updatedAt

  @@unique([senderId, receiverId])
}

enum RequestStatus {
  PENDING
  ACCEPTED
  DECLINED
}

model SharedBoletin {
  id         String   @id @default(cuid())
  boletinId  String
  boletin    Boletin  @relation(fields: [boletinId], references: [id], onDelete: Cascade)
  sharedById String
  sharedBy   User     @relation(fields: [sharedById], references: [id])
  message    String?
  createdAt  DateTime @default(now())
}

model Notification {
  id        String           @id @default(cuid())
  userId    String
  user      User             @relation(fields: [userId], references: [id], onDelete: Cascade)
  type      NotificationType
  title     String
  body      String
  data      Json?
  isRead    Boolean          @default(false)
  createdAt DateTime         @default(now())
}

enum NotificationType {
  FRIEND_REQUEST
  FRIEND_ACCEPTED
  BOLETIN_SHARED
  EVENT_RESULT
  ODDS_CHANGE
  SYSTEM
}
```

---

## 5. API ENDPOINTS

### Auth
```
# Email / Password
POST   /api/auth/register              # { email, username, password } → sends verification email
POST   /api/auth/login                 # { email, password } → { accessToken, refreshToken, user }
POST   /api/auth/refresh               # { refreshToken } → { accessToken }
POST   /api/auth/logout                # invalidates refresh token
POST   /api/auth/verify-email          # { token } → marks email as verified
POST   /api/auth/resend-verification   # { email } → resends verification email
POST   /api/auth/forgot-password       # { email } → sends reset link
POST   /api/auth/reset-password        # { token, newPassword }

# Google OAuth (Firebase)
POST   /api/auth/google                          # { firebaseIdToken } → { accessToken, refreshToken, user, isNewUser, tempToken? }
                                                 # If isNewUser=true → no JWT yet, client shows username picker screen
POST   /api/auth/google/complete-registration    # { tempToken, username } → { accessToken, refreshToken, user }
POST   /api/auth/google/link                     # (authenticated) { firebaseIdToken } → links Google to existing email account
POST   /api/auth/google/unlink                   # (authenticated) Unlinks Google; only allowed if passwordHash is set
POST   /api/auth/set-password                    # (authenticated, Google-only users) { newPassword } → sets password, promotes to HYBRID
```

### Odds & Events
```
GET    /api/odds                        # Paginated odds feed with filters
GET    /api/odds/events/:eventId        # Single event with all odds across sites
GET    /api/odds/live                   # Live events
GET    /api/odds/sites                  # List of active betting sites
GET    /api/odds/sports                 # Available sports
GET    /api/odds/leagues                # Leagues by sport
```

**Query params for /api/odds:**
- `sites` (comma-separated slugs)
- `sport`
- `league`
- `dateFrom`, `dateTo`
- `minOdds`, `maxOdds` (applies to any single selection)
- `market`
- `status` (UPCOMING, LIVE)
- `page`, `limit`

### Betting Slips (Boletins)
```
GET    /api/boletins                    # User's boletins
POST   /api/boletins                    # Create boletin
GET    /api/betintel/:id               # Get boletin detail
PATCH  /api/betintel/:id               # Update boletin (name, notes, status)
DELETE /api/betintel/:id               # Delete boletin
POST   /api/betintel/:id/share         # Share with friend(s)
GET    /api/betintel/shared            # BetIntel shared with me
```

### Users & Friends
```
GET    /api/users/me                    # Current user profile
PATCH  /api/users/me                    # Update profile
GET    /api/users/:username            # Public profile
GET    /api/users/search               # Search users by username
GET    /api/users/check-username       # ?username=xxx → { available: boolean } — used during registration/Google onboarding

GET    /api/friends                     # My friends list
GET    /api/friends/requests           # Pending requests (sent + received)
POST   /api/friends/request/:userId    # Send friend request
POST   /api/friends/accept/:requestId  # Accept request
POST   /api/friends/decline/:requestId # Decline request
DELETE /api/friends/:userId            # Remove friend
GET    /api/friends/feed               # Friend activity feed
```

### Statistics
```
GET    /api/stats/me                   # Full personal stats
GET    /api/stats/me/summary           # Quick summary (ROI, W/L, etc.)
GET    /api/stats/me/by-sport          # Breakdown by sport
GET    /api/stats/me/by-site           # Breakdown by betting site
GET    /api/stats/me/by-market         # Breakdown by bet type
GET    /api/stats/me/by-odds-range     # Performance grouped by odds ranges
GET    /api/stats/me/timeline          # Monthly/weekly P&L timeline
```

### Notifications
```
GET    /api/notifications              # Paginated notifications
PATCH  /api/notifications/:id/read    # Mark as read
PATCH  /api/notifications/read-all    # Mark all as read
```

---

## 6. SCRAPER ARCHITECTURE

### Scraper Service Design
Create a scraper for each Portuguese betting site as a separate class implementing a common `IScraper` interface:

```typescript
// apps/api/src/services/scraper/types.ts
interface IScraper {
  readonly siteSlug: string;
  scrapeEvents(): Promise<ScrapedEvent[]>;
}

interface ScrapedEvent {
  externalId: string;
  sport: Sport;
  league: string;
  homeTeam: string;
  awayTeam: string;
  eventDate: Date;
  markets: ScrapedMarket[];
}

interface ScrapedMarket {
  market: string;      // "1X2", "Over/Under 2.5", etc.
  selections: Array<{
    selection: string; // "1", "X", "2", "Over", "Under"
    value: number;
  }>;
}
```

### Sites to Scrape (implement scrapers for each)
1. **Betclic** (`betclic.pt`) — largest PT betting site
2. **Placard** (`placard.pt`) — state-owned (Santa Casa)
3. **Bet365** (`bet365.com` with PT locale)
4. **ESC Online** (`esportesonline.com`)
5. **Moosh** (`moosh.pt`)
6. **Solverde** (`solverde.pt`)

### Scraping Schedule (Bull Queue)
- Live events: every **60 seconds**
- Upcoming events (next 24h): every **5 minutes**
- Upcoming events (next 7 days): every **30 minutes**
- New events discovery: every **2 hours**

### Anti-detection Measures
- Rotate User-Agent strings
- Random delays between requests (500ms–2000ms)
- Use stealth Puppeteer plugin (`puppeteer-extra-plugin-stealth`)
- Cache scraped HTML when odds unchanged (304 handling)

---

## 7. REAL-TIME FEATURES (Socket.io)

### Events
```typescript
// Server → Client
'odds:updated'        // { eventId, siteId, market, selection, oldValue, newValue }
'event:statusChange'  // { eventId, status, homeScore, awayScore }
'boletin:result'      // { boletinId, status, actualReturn }
'friend:activity'     // { userId, type, data }
'notification:new'    // { notification }

// Client → Server
'subscribe:event'     // { eventId } — subscribe to live odds for event
'unsubscribe:event'   // { eventId }
'subscribe:live'      // subscribe to all live events
```

---

## 8. MOBILE APP — SCREEN SPECIFICATIONS

### 8.1 Theme System
Create a complete design token system:

```typescript
// apps/mobile/theme/tokens.ts
export const tokens = {
  colors: {
    dark: {
      background:     '#0D0D0D',
      surface:        '#1A1A1A',
      surfaceRaised:  '#242424',
      border:         '#2E2E2E',
      primary:        '#00C851',   // Betting green (money/win)
      primaryDark:    '#009A3E',
      danger:         '#FF3B30',   // Loss red
      warning:        '#FF9500',   // Pending/uncertain
      info:           '#007AFF',
      textPrimary:    '#FFFFFF',
      textSecondary:  '#A0A0A0',
      textMuted:      '#505050',
      gold:           '#FFD700',   // High odds highlight
      live:           '#FF3B30',   // Live event indicator
    },
    light: {
      background:     '#F2F2F7',
      surface:        '#FFFFFF',
      surfaceRaised:  '#F8F8F8',
      border:         '#E5E5EA',
      primary:        '#00A843',
      primaryDark:    '#007A32',
      danger:         '#FF3B30',
      warning:        '#FF9500',
      info:           '#007AFF',
      textPrimary:    '#000000',
      textSecondary:  '#6C6C70',
      textMuted:      '#AEAEB2',
      gold:           '#C9A227',
      live:           '#FF3B30',
    },
  },
  spacing: { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 },
  radius:  { sm: 6, md: 10, lg: 14, xl: 20, full: 9999 },
  font: {
    sizes: { xs: 11, sm: 13, md: 15, lg: 17, xl: 20, xxl: 24, display: 32 },
    weights: { regular: '400', medium: '500', semibold: '600', bold: '700', black: '900' },
  },
};
```

### 8.2 Auth Screens

#### Login Screen (`app/(auth)/login.tsx`)
- App logo + tagline at top
- **Email input** + **Password input** (with show/hide toggle)
- **"Entrar" primary button** — triggers email/password login
- **"Esqueceste a password?"** link → forgot-password screen
- **Divider**: "— ou continuar com —"
- **"Continuar com Google" button** — white background, Google logo (official SVG), dark text, full-width — triggers `signInWithGoogle()`
- **"Criar conta"** link → register screen
- Error states: inline field errors (Zod) + toast for server errors (invalid credentials, account locked with countdown)
- Show loading spinner on both buttons independently while request is in flight

#### Register Screen (`app/(auth)/register.tsx`)
- **Full name input** (displayName)
- **Username input** — real-time availability check (debounced 500ms) with ✓/✗ indicator
- **Email input**
- **Password input** — real-time strength indicator (weak/medium/strong bar)
- **Confirm password input**
- **"Criar conta" primary button**
- **Divider + "Continuar com Google"** button (same as login) — Google accounts skip password fields; after Google auth returns `isNewUser=true`, navigate to a **Username Picker screen** where user chooses their username before continuing
- Terms of service checkbox: "Aceito os Termos de Serviço e Política de Privacidade"
- On success: show "Verifica o teu email!" screen — instructs user to click the link sent to their inbox; resend button with 60s cooldown

#### Username Picker Screen (`app/(auth)/google-username.tsx`)
- Shown **only** for new Google Sign-In users (when `isNewUser=true` is returned)
- Google profile photo + display name shown at top (pulled from `decoded.name` / `decoded.picture`) to reassure the user they signed in correctly
- Single username input with real-time availability check (debounced 500ms GET `/api/users/check-username?username=...`)
- Brief explanation: "Escolhe um nome de utilizador único para o BetIntel"
- Username rules shown inline: 3-20 chars, letters, numbers and underscores only
- **"Continuar" button** calls `POST /api/auth/google/complete-registration { tempToken, username }` then stores tokens and navigates to main app
- `tempToken` received from the `/api/auth/google` response is stored temporarily in component state (not SecureStore) as it is only valid for 10 minutes and scoped to onboarding

#### Forgot Password Screen (`app/(auth)/forgot-password.tsx`)
- Email input
- **"Enviar link"** button → always shows success message (prevents enumeration)
- Link expires in 1 hour — shown in the email
- Deep link from email (`betintel://reset-password?token=...`) opens Reset Password screen in app (configure Expo deep linking)

#### Reset Password Screen (`app/(auth)/reset-password.tsx`)
- New password + confirm password inputs with strength indicator
- Token extracted from deep link URL params
- On success: navigate to login with success toast

### 8.3 Home Screen — Odds Feed
- **Header**: App logo + notification bell badge + filter icon
- **Live Banner**: Horizontally scrollable strip of live events with pulsing red dot and current score
- **Filter Bar**: Scrollable pill filters — sport icons (⚽🏀🎾), site logos, "All" toggle
- **Odds Cards**: Per event, showing:
  - League name + flag emoji
  - Match title (Home vs Away) + event date/time
  - Site comparison row: logo | market | odds columns per selection
  - "Best odds" highlighted in gold with subtle glow
  - Odds that changed recently animate with flash (green = improved, red = dropped)
  - Tap card → Event Detail screen
  - Long press or "+" → Add to active boletin

### 8.4 Filter Modal (Bottom Sheet)
- **Betting Sites**: Multi-select with site logos, toggle all
- **Sports**: Icon grid, multi-select
- **Odds Range**: Dual-handle slider (1.01 – 20.00) per selection
- **Date Range**: Preset pills (Today, Tomorrow, This Week) + custom date picker
- **Market Types**: Checkboxes (1X2, Over/Under, BTTS, Handicap, Both Teams, etc.)
- **Sort By**: Best odds, Soonest, Most markets
- Apply / Reset buttons — sticky at bottom

### 8.5 Event Detail Screen
- **Header**: Sport icon + League + Date
- **Match Banner**: Home team | Score/Time | Away team — full bleed with team colors if available
- **Market Tabs**: Scrollable tabs (1X2, Dupla Hipótese, Mais/Menos, BTTS, etc.)
- **Odds Table**: Site logo | Sel 1 | Sel X | Sel 2 — tappable cells add to boletin
- **Odds History**: Sparkline chart showing odds movement for selected cell over 24h
- **Add to Boletin**: FAB button (bottom right) — opens boletin selector/creator

### 8.6 Create / Edit Boletin Screen
- **Header**: "Novo Boletin" + save icon
- **Selections List**: Each item shows event, selection, site logo, odds value; swipe left to remove
- **Stake Input**: Numeric keyboard, currency formatted (€)
- **Summary Card**: Total odds (auto-calculated), potential return (stake × odds), estimated ROI %
- **Name Field**: Optional boletin name/label
- **Notes Field**: Free text
- **Betting Site per selection**: auto-filled from where odds were grabbed; editable
- **Save Button**: Creates boletin with PENDING status

### 8.7 My BetIntel Screen
- **Filter Tabs**: All | Pendente | Ganhou | Perdeu | Void
- **Stats Summary Bar**: Total apostado | Retorno | ROI this month
- **Boletin Cards** (each shows):
  - Status chip (color-coded)
  - Date + optional name
  - Event count + total odds
  - Stake → Potential return (or actual return if resolved)
  - Mini event list preview (up to 3 events, then "+ N mais")
- **Swipe Actions**: right=share, left=delete
- **FAB**: Create new boletin

### 8.8 Boletin Detail Screen
- **Status Banner**: Full-width color-coded banner (green=won, red=lost, orange=pending)
- **Summary**: Stake | Odds | Potential/Actual return | ROI
- **Events List**: Each row shows:
  - Result icon (✓ ✗ ⏳ 🚫)
  - Match (Home vs Away)
  - Market + selection
  - Site logo
  - Odds value
  - Score/result if finished
- **Share Button**: Opens share sheet — share with friends in-app or via link
- **Notes Section**: Collapsible
- **Edit Button**: Re-open for editing if still PENDING

### 8.9 Statistics Screen
- **Period Selector**: Tabs (Esta Semana | Este Mês | Este Ano | Sempre)
- **Hero Metrics Row**: ROI % (large, colored) | Total Apostado | Lucro/Prejuízo
- **Win Rate**: Circular progress ring with % inside
- **P&L Timeline**: Area chart by week/month
- **By Sport**: Horizontal bar chart with sport icons, % win rate per sport
- **By Betting Site**: Table with logo | bets | won | ROI per site
- **By Market**: Same table for market types (1X2, O/U, BTTS, etc.)
- **By Odds Range**: Bar chart showing ROI for <1.5, 1.5–2.0, 2.0–3.0, 3.0–5.0, 5.0+
- **Best/Worst BetIntel**: Horizontal scroll cards

### 8.10 Friends Screen
- **Tabs**: Feed | Amigos | Pedidos (with badge)
- **Feed Tab**: Activity stream — "João apostou em Porto vs Benfica (odd 2.10) – há 2h" with avatar; tappable to see boletin detail if public
- **Friends Tab**: Alphabetical list with avatar, username, last active, quick share button
- **Requests Tab**: Received (accept/decline inline) + Sent (with cancel)
- **Search Bar**: Search users by username
- **Friend Profile**: Avatar, username, bio, public stats (ROI, win rate), public boletins list

### 8.11 Profile & Settings Screen
- **Profile Card**: Avatar (editable) + display name + username + bio
- **Stats Summary**: Compact version of key metrics
- **Preferences Section**:
  - Theme toggle (Claro | Escuro | Sistema)
  - Default betting sites (multi-select)
  - Default stake amount
  - Notifications settings (per type)
  - Currency display
- **Account**: Change password, email, logout
- **About**: App version, legal

---

## 9. COMPONENT LIBRARY

Build these reusable components:

```
components/ui/
  Button.tsx          # variants: primary, secondary, ghost, danger; sizes: sm, md, lg
  Input.tsx           # text, numeric, password; with label, error, icon
  Badge.tsx           # status badges with colors
  Card.tsx            # base card with shadow/elevation
  BottomSheet.tsx     # reusable bottom sheet wrapper (react-native-bottom-sheet)
  Chip.tsx            # filter/selection pills
  Avatar.tsx          # with initials fallback, online indicator
  Skeleton.tsx        # loading skeleton blocks
  EmptyState.tsx      # illustrated empty states
  Toast.tsx           # toast notification system
  Divider.tsx
  Header.tsx          # screen header with back, title, actions

components/odds/
  OddsCard.tsx        # full event card with multi-site comparison
  OddsCell.tsx        # single tappable odds value with flash animation
  LiveBadge.tsx       # pulsing LIVE indicator
  SportIcon.tsx       # sport emoji/icon mapper
  SiteLogoChip.tsx    # betting site logo pill

components/betintel/
  BoletinCard.tsx     # summary card for list
  BoletinItem.tsx     # single selection row in boletin detail
  StakeInput.tsx      # formatted currency input
  OddsCalculator.tsx  # live total odds + return display
  StatusBadge.tsx     # Pendente/Ganhou/Perdeu/Void

components/stats/
  ROICard.tsx         # large ROI metric card
  PnLChart.tsx        # area chart (Victory Native)
  BreakdownTable.tsx  # generic breakdown table
  WinRateRing.tsx     # circular progress chart
  OddsRangeBar.tsx    # bar chart for odds range analysis

components/social/
  ActivityFeedItem.tsx
  FriendCard.tsx
  FriendRequestCard.tsx
  NotificationItem.tsx
```

---

## 10. STATE MANAGEMENT (Zustand Stores)

```typescript
// Boletin Builder Store — persists in-progress boletin across screens
interface BoletinBuilderStore {
  items: BoletinItem[];
  stake: number;
  name: string;
  addItem: (item: BoletinItem) => void;
  removeItem: (id: string) => void;
  setStake: (stake: number) => void;
  totalOdds: number;        // computed
  potentialReturn: number;  // computed
  reset: () => void;
  save: () => Promise<void>;
}

// Auth Store
interface AuthStore {
  user: User | null;
  accessToken: string | null;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  refreshToken: () => Promise<void>;
}

// Filter Store — persists user's odds filter preferences
interface FilterStore {
  selectedSites: string[];
  selectedSports: Sport[];
  selectedMarkets: string[];
  minOdds: number;
  maxOdds: number;
  dateRange: { from: Date; to: Date } | null;
  setFilter: <K extends keyof FilterStore>(key: K, value: FilterStore[K]) => void;
  reset: () => void;
  activeFilterCount: number; // computed
}

// Theme Store
interface ThemeStore {
  preference: 'light' | 'dark' | 'system';
  activeTheme: 'light' | 'dark'; // resolved
  setPreference: (pref: ThemeStore['preference']) => void;
}
```

---

## 11. CI/CD — GITHUB ACTIONS

### `.github/workflows/build-api.yml`
```yaml
name: Build & Deploy API

on:
  push:
    branches: [main]
    paths: ['apps/api/**', 'packages/shared/**']

jobs:
  build-and-push:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      packages: write

    steps:
      - uses: actions/checkout@v4

      - name: Log in to GHCR
        uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      - name: Build and push Docker image
        uses: docker/build-push-action@v5
        with:
          context: apps/api
          push: true
          tags: ghcr.io/${{ github.repository }}/betintel-api:latest

  deploy:
    needs: build-and-push
    runs-on: ubuntu-latest
    steps:
      - name: Deploy to Hetzner via SSH
        uses: appleboy/ssh-action@v1
        with:
          host: ${{ secrets.HETZNER_HOST }}
          username: ${{ secrets.HETZNER_USER }}
          key: ${{ secrets.HETZNER_SSH_KEY }}
          script: |
            docker pull ghcr.io/${{ github.repository }}/betintel-api:latest
            docker-compose -f /opt/betintel/docker-compose.yml up -d --no-deps api
```

### `apps/api/Dockerfile`
```dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-alpine AS runner
# Install Chromium for Puppeteer
RUN apk add --no-cache chromium nss freetype harfbuzz ca-certificates ttf-freefont
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser

WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/src/prisma ./prisma

EXPOSE 3000
CMD ["node", "dist/index.js"]
```

### `apps/api/docker-compose.yml`
```yaml
version: '3.8'
services:
  api:
    image: ghcr.io/${GITHUB_REPO}/betintel-api:latest
    restart: always
    environment:
      DATABASE_URL: ${DATABASE_URL}
      JWT_SECRET: ${JWT_SECRET}
      JWT_REFRESH_SECRET: ${JWT_REFRESH_SECRET}
      REDIS_URL: ${REDIS_URL}
      FIREBASE_SERVICE_ACCOUNT_JSON: ${FIREBASE_SERVICE_ACCOUNT_JSON}  # base64-encoded service account key
      SMTP_HOST: ${SMTP_HOST}
      SMTP_PORT: ${SMTP_PORT}
      SMTP_USER: ${SMTP_USER}
      SMTP_PASS: ${SMTP_PASS}
      APP_URL: ${APP_URL}
      PORT: 3000
    ports:
      - "3000:3000"
    depends_on:
      - redis
    networks:
      - app_network

  redis:
    image: redis:7-alpine
    restart: always
    volumes:
      - redis_data:/data
    networks:
      - app_network

volumes:
  redis_data:

networks:
  app_network:
    external: true  # shared with existing Nginx + PostgreSQL network
```

---

## 12. MOBILE CI/CD — EAS BUILD

### `.github/workflows/build-mobile.yml`
```yaml
name: EAS Build

on:
  push:
    branches: [main]
    paths: ['apps/mobile/**']
  workflow_dispatch:
    inputs:
      platform:
        type: choice
        options: [all, android, ios]

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20

      - name: Install dependencies
        run: npm ci
        working-directory: apps/mobile

      - uses: expo/expo-github-action@v8
        with:
          eas-version: latest
          token: ${{ secrets.EXPO_TOKEN }}

      - name: Build on EAS
        run: eas build --platform ${{ inputs.platform || 'all' }} --non-interactive
        working-directory: apps/mobile
```

---

## 13. AUTHENTICATION ARCHITECTURE

### Overview
The app supports two authentication methods that coexist and can be linked on the same account:
1. **Email + Password** — traditional credential auth with full email verification, brute-force protection, account lockout, and secure password reset
2. **Google Sign-In via Firebase** — OAuth 2.0, verified server-side with `firebase-admin`, fully integrated with the same user account system

Both methods issue the same internal JWT access/refresh token pair after successful authentication, so the rest of the app is completely auth-method-agnostic. A user can sign up with one method and link the other later.

> ⚠️ **IMPORTANT — EXISTING ACCOUNTS**: The developer already has an active **Google Cloud project** and an active **Firebase project**, both used by another app. **Do NOT create new projects.** Add BetIntel as a new app registration inside the existing projects. All instructions below reflect this constraint.

---

### Google Sign-In Setup

#### Existing accounts to reuse (IMPORTANT)
The developer already has active accounts — **do not create new projects**. Reuse the following:

- **Google Cloud Console**: An existing project is already set up. Within that same project, create a new set of **OAuth 2.0 Client IDs** specifically for BetIntel:
  - Type: **Android** — use SHA-1 certificate fingerprint from `eas credentials`
  - Type: **iOS** — use bundle ID `com.betintel.app`
  - Type: **Web** — required for Firebase Auth even in mobile apps; this is the `webClientId` used in `GoogleSignin.configure()`
  - Do NOT reuse the client IDs from the other app — each app must have its own credentials

- **Firebase**: An existing Firebase project is already set up. Within that same project, add BetIntel as a **new app registration** (Firebase supports multiple apps per project):
  - Add Android app → package name: `com.betintel.app`
  - Add iOS app → bundle ID: `com.betintel.app`
  - The existing Firebase project's Firestore/other services are unaffected — we only use **Firebase Authentication** for Google Sign-In token verification

#### Firebase + Google Cloud Configuration steps (document these in README)

> The developer has one existing Google Cloud project and one existing Firebase project. Both already have OAuth consent screens and Firebase Authentication configured for another app. **All steps below are additive — nothing from the existing app should be touched or removed.**

1. **Google Cloud Console** → select the existing project → APIs & Services → Credentials → **Create new** OAuth 2.0 Client IDs specifically for BetIntel (do not reuse the other app's client IDs):
   - Android client: set package name `com.betintel.app` + SHA-1 fingerprint from `eas credentials`
   - iOS client: set bundle ID `com.betintel.app`
   - Web client: this is the `webClientId` used by `GoogleSignin.configure()` on mobile; also used by Firebase Auth
2. **Google Cloud Console** → OAuth consent screen → add BetIntel to the list of apps (or verify the existing consent screen covers it) — add authorised domains for the API server
3. **Firebase Console** → select the existing project → Project Settings → **Your apps** → **Add app**:
   - Register Android app: package name `com.betintel.app`
   - Register iOS app: bundle ID `com.betintel.app`
   - The existing app's config (`google-services.json` / `GoogleService-Info.plist`) for the other app is unaffected — BetIntel gets its own separate files
4. Download the **new** `google-services.json` (Android) and `GoogleService-Info.plist` (iOS) for the BetIntel app registration → place in `apps/mobile/` — add both to `.gitignore`, **never commit these files**
5. **Firebase Console** → Authentication → Sign-in method → confirm **Google** provider is enabled (it likely already is for the other app) → no change needed if already enabled
6. **Firebase Console** → Project Settings → Service Accounts → **Generate new private key** → download JSON → base64-encode: `base64 -i serviceAccountKey.json` → store as `FIREBASE_SERVICE_ACCOUNT_JSON` env var on the Hetzner server — the `firebase-admin` SDK on the backend uses this to verify tokens issued to BetIntel users
7. Add the BetIntel Android SHA-1 fingerprint to the **BetIntel Firebase app registration** in Firebase Console → Project Settings → Your apps → BetIntel Android → Add fingerprint

#### Environment variables required for auth (add to `.env.example`)
```
# Firebase (backend)
FIREBASE_SERVICE_ACCOUNT_JSON=   # base64-encoded service account JSON

# Google OAuth (mobile — via Expo public env)
EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=  # Web OAuth 2.0 Client ID from Google Cloud Console

# JWT
JWT_SECRET=                        # min 64 random chars
JWT_REFRESH_SECRET=                # different min 64 random chars

# Email (for verification + password reset)
SMTP_HOST=
SMTP_PORT=
SMTP_USER=
SMTP_PASS=
SMTP_FROM="BetIntel <noreply@betintel.app>"
```

#### Mobile flow (React Native)
```typescript
// apps/mobile/services/auth/googleAuth.ts
import { GoogleSignin } from '@react-native-google-signin/google-signin';
import auth from '@react-native-firebase/auth';

GoogleSignin.configure({
  webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID, // from Google Cloud Console
});

export async function signInWithGoogle(): Promise<GoogleAuthResult> {
  await GoogleSignin.hasPlayServices();
  const { idToken } = await GoogleSignin.signIn();
  const googleCredential = auth.GoogleAuthProvider.credential(idToken);
  const userCredential = await auth().signInWithCredential(googleCredential);
  const firebaseIdToken = await userCredential.user.getIdToken();

  // Send Firebase ID token to our backend — backend verifies it with firebase-admin
  const response = await apiClient.post('/auth/google', { firebaseIdToken });
  return response.data;
}
```

#### Backend flow (Express)
```typescript
// apps/api/src/services/auth/googleAuthService.ts
import * as admin from 'firebase-admin';

// Initialise once at app startup using service account from env
if (!admin.apps.length) {
  const serviceAccount = JSON.parse(
    Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_JSON!, 'base64').toString()
  );
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
}

export async function verifyGoogleToken(firebaseIdToken: string) {
  // Throws if token is invalid, expired, or from wrong Firebase project
  const decoded = await admin.auth().verifyIdToken(firebaseIdToken);
  return {
    googleId: decoded.uid,
    email: decoded.email!,
    displayName: decoded.name,
    avatarUrl: decoded.picture,
    emailVerified: decoded.email_verified ?? false,
  };
}

// POST /api/auth/google controller logic:
// 1. verifyGoogleToken(firebaseIdToken) — throws 401 if invalid
// 2. Find user by googleId OR email (case-insensitive)
// 3a. If found by googleId → update lastLoginAt → issue JWT pair → isNewUser=false
// 3b. If found by email but googleId not set (existing email/password account):
//     → set googleId, set authProvider=HYBRID, isEmailVerified=true → issue JWT pair → isNewUser=false
//     → this silently links the Google identity to the existing account
// 3c. If not found anywhere:
//     → create user with passwordHash=null, isEmailVerified=true, authProvider=GOOGLE
//     → do NOT assign username yet — return isNewUser=true with a temp session token
//     → client must call POST /api/auth/google/complete-registration { tempToken, username }
//     → that endpoint validates username uniqueness, sets it, and issues the real JWT pair
// 4. Return { accessToken?, refreshToken?, user?, isNewUser, tempToken? }

// POST /api/auth/google/complete-registration controller logic:
// 1. Verify tempToken (short-lived JWT, 10min, scoped to 'google-onboarding' only)
// 2. Validate username: 3–20 chars, alphanumeric + underscores, unique (case-insensitive check)
// 3. Update user record with chosen username
// 4. Invalidate tempToken
// 5. Issue full accessToken + refreshToken pair
// 6. Return { accessToken, refreshToken, user }
```

#### Account linking/unlinking rules
- A user can **link Google** to an existing email account via `POST /api/auth/google/link` (authenticated)
  - Requires them to complete a Google Sign-In flow first to get a `firebaseIdToken`
  - Fails if that Google account is already linked to a different BetIntel user
- A user can **unlink Google** via `POST /api/auth/google/unlink` (authenticated) **only if** `passwordHash` is set — prevents locking themselves out
- A Google-only user who wants to set a password uses `POST /api/auth/set-password { newPassword }` (authenticated) — sets `passwordHash`, changes `authProvider` to `HYBRID`

---

### Email + Password Auth — Security Hardening

#### Registration flow
1. Validate email + password with Zod: email format, password min 8 chars, requires uppercase + number + special char
2. Check email uniqueness (case-insensitive)
3. Hash password with **bcrypt cost factor 12**
4. Generate a **cryptographically secure email verification token** (`crypto.randomBytes(32).toString('hex')`)
5. Store token hash (not raw token) in `emailVerifyToken` field with 24h expiry
6. Send verification email via **Nodemailer** (configure SMTP or use Resend/SendGrid)
7. Return `{ message: "Verification email sent" }` — do NOT auto-login before email is verified

#### Login flow
1. Find user by email (case-insensitive)
2. Check `lockedUntil` — if in the future, return 429 with retry-after header
3. Verify bcrypt hash — if wrong:
   - Increment `failedLoginAttempts`
   - If attempts ≥ 5: set `lockedUntil = now + 15 minutes`, reset counter
   - Return generic error: `"Credenciais inválidas"` (never say which field is wrong)
4. Check `isEmailVerified` — if false, return 403 with prompt to verify email
5. On success: reset `failedLoginAttempts`, update `lastLoginAt`
6. Issue **access token** (JWT, 15min expiry, signed with `JWT_SECRET`) and **refresh token** (opaque random token stored hashed in DB, 30-day expiry)
7. Store refresh token record in `RefreshToken` table

#### Refresh token rotation
- On `/auth/refresh`: validate token, issue new access + refresh token pair, **invalidate old refresh token** (delete from DB)
- Detect reuse: if a refresh token that was already rotated is presented → invalidate ALL refresh tokens for that user (session compromise detection)

#### Password reset flow
1. `POST /auth/forgot-password { email }` — always return same success message regardless of whether email exists (prevents user enumeration)
2. If email exists: generate secure reset token, store hash with 1h expiry, send email with link
3. `POST /auth/reset-password { token, newPassword }` — verify token hash + expiry, update password, invalidate ALL existing refresh tokens for user

#### Token security
- JWT `accessToken`: short-lived (15min), signed HS256, payload: `{ sub: userId, email, username, iat, exp }`
- Refresh tokens: stored as **SHA-256 hash** in DB — raw token only sent to client once, never stored plaintext
- All tokens transmitted over HTTPS only
- `SecureStore` on mobile (hardware-backed keychain/keystore) — never AsyncStorage for tokens

---

## 14. SECURITY REQUIREMENTS

### API & Network
- All API routes (except public auth endpoints) require `Authorization: Bearer <access_token>` header
- CORS: restricted to mobile app bundle ID origin + `localhost:*` in development only
- Helmet.js: sets `Content-Security-Policy`, `X-Frame-Options`, `X-Content-Type-Options`, `Strict-Transport-Security`, etc.
- All traffic to the API must go through Nginx with TLS termination (certificate via Let's Encrypt)

### Rate Limiting (express-rate-limit + Redis store)
- `POST /auth/login`: **10 requests / 15 min** per IP
- `POST /auth/register`: **5 requests / hour** per IP
- `POST /auth/forgot-password`: **3 requests / hour** per IP
- `POST /auth/google`: **20 requests / 15 min** per IP
- All other routes: **500 requests / 15 min** per IP
- Exceeding limits returns 429 with `Retry-After` header

### Input & Data
- All request bodies validated with **Zod** — unknown fields stripped, types coerced
- Prisma parameterised queries everywhere — zero raw SQL in auth paths
- Email fields always lowercased before DB operations
- Usernames: alphanumeric + underscores only, 3–20 chars, validated with regex

### Secrets Management
- All secrets in `.env` (never committed) — `.env.example` committed with placeholder values
- Firebase service account JSON stored as **base64-encoded** single env var
- Docker Compose reads from `.env` file on the VPS
- GitHub Actions secrets: `HETZNER_HOST`, `HETZNER_USER`, `HETZNER_SSH_KEY`, `EXPO_TOKEN`, `GITHUB_TOKEN`

### Logging & Monitoring
- Winston logs all auth events: registrations, logins (success/fail), password resets, Google sign-ins, lockouts
- Never log passwords, tokens, or full email addresses in production logs
- Morgan HTTP access logs in combined format, piped to Winston

---

## 14. PERFORMANCE REQUIREMENTS

- Odds feed initial load < 800ms (cached Redis layer)
- Infinite scroll with cursor-based pagination (not page-based)
- Images: use Expo Image with caching; site logos served as static assets from API
- Odds cards use FlatList with `getItemLayout` for fixed-height items
- Socket.io connection pooled — reconnects automatically on app foreground
- Background fetch (Expo Background Fetch) to refresh odds and check boletin results while app is in background
- Skeleton screens on all data-loading states

---

## 15. LOCALISATION

- Default language: **Portuguese (Portugal)** — all UI strings in PT-PT
- Date format: DD/MM/YYYY, 24h time
- Currency: Euro (€), formatted as `€1.234,56`
- Odds format: Decimal (European standard) by default, with option for Fractional

---

## 16. DEVELOPMENT SETUP INSTRUCTIONS

Generate a complete `README.md` with:
1. Prerequisites (Node 20, pnpm, Docker, Expo CLI, EAS CLI)
2. Clone & install (`pnpm install` at root)
3. Environment variables required (list all with descriptions)
4. Local dev: `docker-compose up -d` (starts PostgreSQL + Redis) → `pnpm dev:api` → `pnpm dev:mobile`
5. Database migration: `pnpm prisma migrate dev`
6. Running scrapers manually: `pnpm scrape:all`
7. Deploying: push to `main` triggers CI/CD automatically
8. EAS build: `eas build --platform all`

---

## 17. IMPLEMENTATION ORDER

Build in this order to unblock development progressively:

1. **Shared package** — TypeScript types and Zod schemas (including auth schemas)
2. **Database schema** — Prisma schema + initial migrations + seed data (betting sites)
3. **Email/Password Auth API** — register, login, refresh, logout, verify-email, forgot/reset-password
4. **Firebase Admin setup** — initialise `firebase-admin` with service account, implement `verifyGoogleToken`, `/api/auth/google` endpoint, link/unlink endpoints
5. **Auth screens (mobile)** — login, register, forgot-password, reset-password, username-picker; wire up both email and Google Sign-In flows; configure Expo deep linking for password reset
6. **Scraper foundation** — IScraper interface + one working scraper (Betclic)
7. **Odds API** — /api/odds endpoints with filtering + Redis cache
8. **Home screen + Odds cards** — consume odds API
9. **Boletin CRUD** — API + mobile create/list/detail screens
10. **Statistics API + Stats screen**
11. **Friends system** — API + mobile friends screen
12. **Socket.io** — real-time odds + notifications
13. **Remaining scrapers** — Placard, Bet365, ESC Online, Moosh, Solverde
14. **Push notifications** — Expo Notifications + backend trigger
15. **Account linking UI** — in Profile/Settings: "Ligar conta Google" / "Desligar conta Google" button
16. **EAS build configuration** — `app.json`, `eas.json`, `google-services.json`, `GoogleService-Info.plist`, production builds
17. **Polish** — animations, empty states, error boundaries, Sentry error tracking

---

## COPILOT INSTRUCTIONS

When implementing this project:
- Always use TypeScript with strict mode — no `any` types
- Every API response must follow: `{ success: boolean; data?: T; error?: string; meta?: { pagination } }`
- All database queries go through the Prisma service layer — no raw SQL except for complex analytics
- React Native components must support both iOS and Android — test shadow styles for both
- All async operations must have loading, success, and error states handled
- Use `react-query` for all server state — no manual fetch calls in components
- Scraper errors must not crash the queue — catch, log to Winston, continue
- Write JSDoc comments on all exported functions, types, and complex components
- Generate Prisma migrations for every schema change — never edit migration files manually
