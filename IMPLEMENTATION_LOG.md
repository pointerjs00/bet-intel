# BetIntel Implementation Log

This file is the running record for completed AGENTS.md implementation steps.
Each step captures:
- delivered features
- remaining to-dos
- bugs or issues found during the step

## Step 1 - Shared package

### Features
- Created the shared package structure under packages/shared.
- Added shared TypeScript domain types and enums used by API and mobile.
- Added shared Zod schemas for auth, odds filters, boletins, profiles, and pagination.
- Exported shared types and schemas through the shared package entrypoint.

### To-dos
- Extend shared contracts whenever later steps introduce richer nested payloads.

### Bugs / issues found
- No open blocker carried from this step.

## Step 2 - Database schema and seed foundation

### Features
- Added the Prisma schema for users, auth, odds, events, boletins, friendships, shares, and notifications.
- Set up Prisma migrations and client generation in the API workspace.
- Seeded the initial betting sites needed by the odds and scraper flows.

### To-dos
- Keep schema aligned with later feature work instead of patching around model gaps.

### Bugs / issues found
- Later work revealed two schema gaps around boletin sharing and boletin item site relations. Both were fixed in Step 8.

## Step 3 - Email/password auth API

### Features
- Implemented registration, login, refresh, logout, verify-email, resend-verification, forgot-password, and reset-password endpoints.
- Added password hashing, verification tokens, refresh-token rotation, and account lockout protections.
- Standardized auth responses to the shared API envelope.

### To-dos
- Add deeper runtime coverage around SMTP and production mail templates when deployment wiring is finalized.

### Bugs / issues found
- No active blocker left after validation.

## Step 4 - Firebase admin and Google auth backend

### Features
- Initialized firebase-admin on the API side.
- Implemented Google token verification and Google auth/login flows.
- Added Google onboarding completion, link, unlink, and set-password support.

### To-dos
- Finish account-linking UI in the mobile profile step.

### Bugs / issues found
- No active blocker left after validation.

## Step 5 - Mobile auth screens and session foundation

### Features
- Added login, register, forgot-password, reset-password, and Google username onboarding screens.
- Added auth store, secure token persistence, API client interceptors, and auth gate routing.
- Wired Google sign-in on mobile to the backend Firebase verification flow.

### To-dos
- Add the verify-email waiting screen and resend cooldown UX refinement if it is not already surfaced elsewhere.

### Bugs / issues found
- No active blocker left after validation.

## Step 6 - Scraper foundation and first scraper

### Features
- Added scraper interfaces and scraper service structure.
- Implemented the first working scraper foundation for odds ingestion.
- Connected scraper output to Prisma persistence and odds-serving paths.

### To-dos
- Add the remaining site scrapers in the later scraping step.
- Expand observability for scraper drift and selector breakage.

### Bugs / issues found
- No active blocker left after validation.

## Step 7 - Odds API and home screen

### Features
- Implemented odds feed, event detail, live events, site listing, sport listing, and league listing endpoints.
- Added mobile odds service hooks, filter store, home screen, filter modal, odds cards, odds cells, and live banner.
- Wired the mobile app to consume filtered odds data from the API.

### To-dos
- Replace the placeholder odds history visualization with real historical data when that backend path exists.

### Bugs / issues found
- No active blocker left after validation.

## Step 8 - Boletins end-to-end

### Features
- Implemented full boletin backend CRUD and sharing flow.
- Added API files:
  - apps/api/src/services/boletins/boletinService.ts
  - apps/api/src/controllers/boletinController.ts
  - apps/api/src/routes/boletinRoutes.ts
- Mounted both route groups in the API app:
  - /api/boletins
  - /api/betintel
- Implemented endpoints for:
  - list own boletins
  - create boletin
  - get boletin detail
  - update boletin
  - delete boletin
  - share boletin
  - list boletins shared with me
- Added business rules in the service layer:
  - duplicate selection rejection
  - active odd existence validation
  - total odds and potential return calculation
  - owner/public/shared access control for detail reads
  - friendship validation before sharing
  - notification creation on share
- Expanded shared contracts with richer boletin detail payloads for owner, items, site metadata, event metadata, and share metadata.
- Implemented mobile boletin data layer in apps/mobile/services/boletinService.ts with React Query hooks and mutations.
- Implemented the persisted builder store in apps/mobile/stores/boletinBuilderStore.ts.
- Added boletin UI components:
  - apps/mobile/components/boletins/StatusBadge.tsx
  - apps/mobile/components/boletins/OddsCalculator.tsx
  - apps/mobile/components/boletins/StakeInput.tsx
  - apps/mobile/components/boletins/BoletinItem.tsx
  - apps/mobile/components/boletins/BoletinCard.tsx
- Added mobile screens:
  - apps/mobile/app/(tabs)/slips.tsx
  - apps/mobile/app/boletins/create.tsx
  - apps/mobile/app/boletins/[id].tsx
- Added the Boletins tab to the mobile tab layout.
- Wired odds selection into the builder flow from:
  - apps/mobile/app/(tabs)/index.tsx
  - apps/mobile/app/odds/[eventId].tsx
- Passed validation:
  - API TypeScript check clean
  - mobile TypeScript check clean
  - IDE error sweep clean

### To-dos
- Build the real friend-picker share UI when the friends/social step is implemented. The backend share flow is ready, but mobile currently uses a placeholder toast instead of selecting recipients.
- Add swipe actions on the boletin list if strict parity with the spec is required. The current screen exposes delete and share actions as buttons inside each card.
- Add a dedicated edit flow for name and notes if the product wants editing beyond status and visibility updates on the detail screen.
- Replace the placeholder odds history graphic on event detail with real history data when the backend exposes it.

### Bugs / issues found
- Fixed a schema bug where SharedBoletin had no recipient field, which made shared-with-me semantics impossible. Resolved by adding sharedWithId, sender/recipient relations, and a unique constraint.
- Fixed a schema bug where BoletinItem had no relation to BettingSite, which prevented correct detail payloads with site metadata.
- Fixed API serialization type mismatches between Prisma enums and shared enums during validation.
- Fixed mobile typing issues in the boletin list FlatList, builder item rendering, and Zustand persist merge during validation.
- No remaining TypeScript or IDE errors were found after the fixes.

## Step 9 - Statistics system

### Features
- Added shared statistics contracts and query validation in the shared package so API and mobile consume the same typed payloads.
- Implemented the full authenticated statistics API under /api/stats with endpoints for:
  - full personal stats payload
  - summary metrics
  - breakdown by sport
  - breakdown by betting site
  - breakdown by market
  - breakdown by odds range
  - timeline series
- Implemented stats calculations in the API service layer for:
  - settled stake, return, ROI, and profit/loss summary
  - win-rate computation from resolved boletins
  - grouped ROI and win-rate breakdown tables
  - dynamic time-bucketed P&L timeline
  - best and worst settled boletins
- Added the mobile statistics data layer with React Query hooks in apps/mobile/services/statsService.ts.
- Added reusable mobile stats components in apps/mobile/components/stats:
  - ROICard
  - PnLChart
  - WinRateRing
  - BreakdownTable
  - OddsRangeBar
- Implemented the Statistics tab screen in apps/mobile/app/(tabs)/stats.tsx with:
  - period selector
  - ROI hero metrics
  - win-rate donut chart
  - P&L timeline chart
  - sport, site, and market breakdown tables
  - odds-range ROI chart
  - best and worst boletin highlights
- Added the Stats tab to the mobile tabs layout.

### To-dos
- Add richer chart polish if product wants axis labels and legends rendered directly inside the chart canvas rather than alongside the cards.
- Revisit the best and worst boletin cards once navigation targets for stats-driven drilldown are defined.
- Add a repository ESLint configuration if command-line linting is expected as part of validation in future steps.

### Bugs / issues found
- No TypeScript or editor diagnostics remained after the shared, API, and mobile stats files were added.
- API build validation passed with pnpm --filter api build.
- Mobile command-line lint could not run because the repository does not include an ESLint configuration file, so mobile validation relied on the editor diagnostics sweep instead.

## Step 10 - Friends, social, and profile system

### Features
- Added shared social contracts and query schemas for:
  - username availability
  - user search results
  - friendship detail payloads
  - pending friend requests
  - public profiles
  - friend feed items
  - notification pagination metadata
- Implemented the backend social service layer under apps/api/src/services/social:
  - notificationService.ts
  - userService.ts
  - friendshipService.ts
  - feedService.ts
- Implemented API controllers for:
  - users
  - friends
  - notifications
- Implemented API routes for all endpoints requested from the Users & Friends and Notifications blocks:
  - GET /api/users/me
  - PATCH /api/users/me
  - GET /api/users/:username
  - GET /api/users/search
  - GET /api/users/check-username
  - GET /api/friends
  - GET /api/friends/requests
  - POST /api/friends/request/:userId
  - POST /api/friends/accept/:requestId
  - POST /api/friends/decline/:requestId
  - DELETE /api/friends/:userId
  - GET /api/friends/feed
  - GET /api/notifications
  - PATCH /api/notifications/:id/read
  - PATCH /api/notifications/read-all
- Mounted the new route groups in the API app:
  - /api/users
  - /api/friends
  - /api/notifications
- Added the mobile social data layer in apps/mobile/services/socialService.ts with React Query hooks and mutations for profile, user search, friends, requests, feed, and notifications.
- Added reusable mobile social components in apps/mobile/components/social:
  - SocialAvatar
  - ActivityFeedItem
  - FriendCard
  - FriendRequestCard
  - NotificationItem
- Implemented the Friends tab in apps/mobile/app/(tabs)/friends.tsx with:
  - Feed, Amigos, and Pedidos segmented tabs
  - friend activity feed
  - username search and add-friend flow
  - current friends list with remove action
  - received and sent pending requests

## Step 13 - Push notifications

### Features
- Added `expoPushToken` to the Prisma `User` model and generated the migration `apps/api/src/prisma/migrations/20260321040100_add_expo_push_token`.
- Extended shared profile update validation to accept a nullable Expo push token while keeping it out of `PublicUser` responses.
- Updated the backend notification service to:
  - keep creating DB notifications
  - keep emitting realtime socket notifications
  - send Expo push notifications through `https://exp.host/--/api/v2/push/send`
  - clear stored device tokens automatically when Expo reports `DeviceNotRegistered`
- Reused the existing `PATCH /api/users/me` path for push-token registration and removal so mobile can attach on login and detach on logout without introducing another endpoint.
- Added `apps/mobile/services/notificationService.ts` to:
  - request permissions
  - obtain the Expo push token
  - register the token with the API once per session
  - detach the token on logout
  - subscribe to foreground notification events
- Added a notification lifecycle manager in the mobile root layout to:
  - sync the Expo token after authentication
  - invalidate notification queries on socket `notification:new`
  - show a custom in-app toast for foreground push deliveries
- Wired unread notification counts into:
  - the friends tab badge in `apps/mobile/app/(tabs)/_layout.tsx`
  - the bell icon badge in `apps/mobile/app/(tabs)/index.tsx`
- Added the Expo notifications plugin to `apps/mobile/app.json`.

### To-dos
- Add a dedicated notifications screen if product wants the home-screen bell to deep-link somewhere more specific than the profile notifications card.
- Revisit the single-token-per-user limitation if multi-device delivery becomes a requirement. The current schema follows the requested `expoPushToken` field shape and supports one active device token per user.
- Add the EAS `projectId` to Expo config if it is not already injected by the build environment, otherwise push token registration will no-op safely.

### Bugs / issues found
- API build initially failed on a TypeScript narrowing issue in the Expo payload array construction; fixed by changing the payload assembly to a typed `flatMap`.
- Validation passed with:
  - `pnpm --filter api prisma:migrate:dev --name add_expo_push_token`
  - `pnpm --filter api build`
  - `pnpm exec tsc --noEmit -p apps/mobile/tsconfig.json`
- `pnpm --filter mobile lint` still cannot run because the repository does not include an ESLint configuration file.

## Step 14 - EAS and CI/CD build configuration

### Features
- Added production-ready Expo build profile configuration in `apps/mobile/eas.json` with:
  - development profile for internal development-client builds
  - preview profile for internal QA builds
  - production profile for store-ready builds with auto-incremented app versioning
- Completed `apps/mobile/app.json` with:
  - icon, splash, adaptive icon, and favicon asset paths
  - bundle/package identifiers set to `com.betintel.app`
  - Expo router, secure store, notifications, Firebase app, and Google sign-in plugins
  - retained deep-linking and Firebase native config file references
- Added GitHub Actions workflow files from AGENTS.md:
  - `.github/workflows/build-mobile.yml`
  - `.github/workflows/build-api.yml`
- Added placeholder mobile image assets so Expo config references real files in the repository.

### To-dos
- Replace the placeholder `assets/*.png` files with final branded production artwork before shipping builds.
- Replace the placeholder Expo EAS project id in `apps/mobile/app.json` once the project is linked with `eas init` or the EAS dashboard.
- Revisit the mobile workflow dependency install strategy if the repository standardizes on pnpm in CI instead of the exact npm-based workflow from AGENTS.md.

### Bugs / issues found
- The Windows GDI-based PNG generation attempt failed locally, so placeholder PNG assets were written directly as valid image bytes instead.
- File-level diagnostics for the new JSON and YAML files were clean after creation.
- Implemented the Profile tab in apps/mobile/app/(tabs)/profile.tsx with:
  - profile summary card
  - compact monthly stats strip
  - editable profile fields
  - theme and preferred betting-site preferences
  - notifications preview and mark-read actions
  - logout action and app version section
- Added the Friends and Profile tabs to the mobile tab layout.
- Added formatRelativeTime to the mobile formatter helpers for social and notification timestamps.

### To-dos
- Add a dedicated friend profile screen if product wants drilldown from the friends list into public stats and public boletins.
- Add sent-request cancellation if strict parity with the product spec is needed. The API spec provided in Section 5 does not define a cancel endpoint, so the mobile screen currently shows sent requests as read-only pending items.
- Wire the boletin share action to the real friends picker now that the friends list and request flow exist.
- Add CLI ESLint configuration if command-line lint validation is expected in later steps.

### Bugs / issues found
- API validation passed with pnpm --filter api build.
- Mobile validation passed with pnpm --filter mobile exec tsc --noEmit.
- The mobile TypeScript run surfaced missing Victory Native generic constraints in the previously added stats chart components; those chart typings were corrected during this step so the entire mobile workspace now compiles cleanly.
- Workspace editor diagnostics were clean after the backend and mobile social changes.

## Step 11 - Socket.io realtime features

### Features
- Added the Socket.io server setup in apps/api/src/sockets/index.ts with:
  - JWT-authenticated handshake middleware using the existing access token verifier
  - automatic join to private user rooms on connect
  - client events for subscribe:event, unsubscribe:event, and subscribe:live
  - server emit helpers for all Section 7 server-side events:
    - odds:updated
    - event:statusChange
    - boletin:result
    - friend:activity
    - notification:new
- Added apps/api/src/sockets/oddsSocket.ts to emit odds updates to event-specific rooms and the live room.
- Added apps/api/src/sockets/notificationSocket.ts to emit notification:new to user rooms and friend:activity to user rooms.
- Wired realtime odds change detection into apps/api/src/services/scraper/scraperRegistry.ts so existing odds are compared before update and odds:updated is emitted when the scraped value changes.
- Wired notification emission into apps/api/src/services/social/notificationService.ts so notifications created through the service are pushed to connected clients immediately.
- Wired existing social and boletin flows into realtime helpers:
  - friendship request and acceptance paths emit friend:activity
  - boletin status resolution emits boletin:result
  - boletin sharing emits notification:new and friend:activity
- Initialized the Socket.io server during API startup in apps/api/src/index.ts.
- Added the mobile Socket.io client in apps/mobile/services/socketService.ts with:
  - authenticated connection using the stored JWT
  - auto-reconnect support
  - reconnect-on-foreground via AppState
  - event room subscribe and unsubscribe helpers
  - typed listener registration for realtime events
- Wired the mobile root layout to connect and disconnect the socket client alongside auth session state.
- Updated apps/mobile/components/odds/OddsCell.tsx to:
  - subscribe to the relevant event room
  - listen for odds:updated payloads matching its event/site/market/selection
  - update the displayed odd value locally
  - flash the existing animation immediately on realtime updates
- Updated odds cell call sites in:
  - apps/mobile/components/odds/OddsCard.tsx
  - apps/mobile/app/odds/[eventId].tsx
- Added socket.io-client to the mobile workspace dependencies.

### To-dos
- Wire event:statusChange into scraper or live-event update sources once event status and score changes are ingested from scrapers rather than only odds values.
- Surface notification:new and friend:activity directly in the mobile UI if product wants in-session toasts, badge increments, or live feed insertion without a query refresh.
- Consider central query invalidation hooks for odds and notifications if the product wants realtime state to propagate beyond local cell updates.

### Bugs / issues found
- API validation passed with pnpm --filter api build after the socket layer and emitters were added.
- Mobile validation passed with pnpm --filter mobile exec tsc --noEmit after adding the Socket.io client and live odds subscriptions.
- Realtime typing required a few follow-up fixes around shared enum values, exported notification serialization, and Socket.io listener typing; those were resolved before completion.

## Step 12 - Remaining site scrapers

### Features
- Added a shared browser scraper helper in apps/api/src/services/scraper/sites/browserSiteScraper.ts that keeps the same anti-detection approach as the existing Betclic scraper:
  - puppeteer-extra with the stealth plugin
  - rotating real-world user agents per browser session
  - random delays between interactions
  - request interception to skip heavy asset types
  - Portuguese Accept-Language headers for locale-sensitive sites
- Added the requested site scraper classes under apps/api/src/services/scraper/sites:
  - placardScraper.ts
  - betanoScraper.ts
  - bet365Scraper.ts
  - escOnlineScraper.ts
  - mooshScraper.ts
  - solverdeScraper.ts
- Kept each new site scraper on the same IScraper contract as Betclic with a siteSlug, siteName, and scrapeEvents() implementation returning ScrapedEvent[].
- Centralized built-in scraper registration in apps/api/src/services/scraper/scraperRegistry.ts through registerDefaultScrapers(), then updated apps/api/src/jobs/scrapeJobs.ts to use that single registration path.
- Registered all current site scrapers in the default registry set:
  - Betclic
  - Placard
  - Betano
  - Bet365
  - ESC Online
  - Moosh
  - Solverde
- Fixed betting-site base URL persistence in the registry so non-.pt sites are stored correctly:
  - bet365 -> https://www.bet365.com
  - esconline -> https://www.esportesonline.com

### To-dos
- Replace selector guesses with production-verified selectors after running live scrape sessions against each site, since third-party betting site DOM structures drift frequently.
- Add site-specific market expansion if the product wants more than the current 1X2 extraction baseline across all scrapers.
- Consider storing per-scraper baseUrl directly on the scraper contract if more non-standard site domains are added later.

### Bugs / issues found
- API validation passed with pnpm --filter api build after adding the new scraper files and registration changes.
- This step did not run live network scrape sessions against the betting sites, so runtime selector accuracy still needs real-site verification.