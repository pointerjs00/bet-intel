# BetIntel — Feature Ideas, Stats & Metrics Roadmap

> High-level proposals. Each item is independent and can be prioritised separately.
> 
> **Feasibility key:**
> - ✅ **Ready** — Can be built now with existing data and infrastructure
> - 🟡 **Needs work** — Possible but requires new backend/schema additions (estimate included)
> - 🔴 **Blocked** — Requires major infrastructure not yet built (scores API, scrapers, etc.)
> - 🟢 **BUILT** — Fully implemented and live in the codebase

---

## 1. New Stats & Metrics

### 1.1 Streak Tracker ✅ Ready — 🟢 BUILT
**What:** Current streak (W/L count), longest winning streak, longest losing streak.  
**Why:** Psychologically important — helps the user spot tilt or hot hands.  
**Feasibility:** All data exists. Sort resolved boletins by `betDate`/`createdAt`, walk the list tracking consecutive WON/LOST statuses. Pure computation in `buildStatsBundle()`.  
**Effort:** ~2h. Add `streaks` object to `PersonalStats` summary → new `StreakCard` component on Stats screen.  
**Implementation:** `components/stats/StreakCard.tsx` + `streaks` field in `StatsSummary`. Wired to stats screen with ⓘ info button.

---

### 1.2 Average Stake by Outcome ✅ Ready — 🟢 BUILT
**What:** Show average stake on WON vs LOST vs VOID bets.  
**Why:** Reveals whether the user subconsciously stakes more on bets they lose (confidence bias).  
**Feasibility:** All data exists. Group boletins by `status`, compute `mean(stake)` per group.  
**Effort:** ~1h. Add fields to `StatsSummary` → two metric cards on Stats screen.  
**Implementation:** `averageWonStake` / `averageLostStake` in `StatsSummary`. Shown as two side-by-side metric cards with shared ⓘ info button.

---

### 1.3 Profit/Loss by Day of Week ✅ Ready — 🟢 BUILT
**What:** Bar chart showing net P&L for each weekday (Mon–Sun).  
**Why:** Many bettors have day-of-week bias tied to specific leagues/fixtures.  
**Feasibility:** `betDate`/`createdAt` already stored. Group by `getDay()`, sum P&L per bucket.  
**Effort:** ~2h. New `byWeekday` breakdown in stats API → reuse `BreakdownTable` or new bar chart component.  
**Implementation:** `byWeekday` in stats API → `BreakdownTable` component on stats screen with ⓘ info button.

---

### 1.4 Bet Frequency Heatmap ✅ Ready — 🟢 BUILT
**What:** Calendar heatmap (GitHub contribution graph style) showing how many bets were placed each day, colour-coded by profit/loss.  
**Why:** Reveals patterns — e.g. "I bet recklessly on Saturdays" or "I only bet profitably midweek".  
**Feasibility:** All data exists. Build a day→{count, profitLoss} map from boletins on the client side or API side.  
**Effort:** ~4h. New `HeatmapCalendar` component (52×7 grid of `View` cells). Render in a horizontally-scrollable container below the P&L chart.  
**Implementation:** `components/stats/HeatmapCalendar.tsx` — 26-week grid, colour-coded by P&L (green/red/amber), opacity scaled by bet count, auto-scrolls to current week.

---

### 1.5 Sport × Market Matrix ✅ Ready — 🟢 BUILT
**What:** Cross-tab table — sports as rows, market categories as columns — showing ROI in each cell.  
**Why:** Pinpoints where the user actually has an edge (e.g. good at BTTS in football, terrible at tennis 1X2).  
**Feasibility:** `BoletinItem` has `sport` and `market` fields. Aggregate across the item level (split stake proportionally). Needs a market→category mapping function (already partially exists in `marketUtils.ts`).  
**Effort:** ~3h. New API breakdown → new scrollable matrix component with colour-scaled cells.  
**Implementation:** `bySportMarket` in stats API → `components/stats/SportMarketMatrix.tsx` — scrollable grid with colour-scaled ROI cells.

---

### 1.6 Expected Value (EV) Tracking 🟡 Needs work
**What:** For each bet, calculate the implied probability from the odd and compare it to the user's historical win rate on that market/sport. Show cumulative EV vs actual return over time.  
**Why:** Helps the user see whether they are finding value or just variance.  
**Feasibility:** Possible with existing data but accuracy depends on having enough historical bets per market to produce a meaningful win rate. Formula: `EV = (winRate × oddValue) - 1`. Could be misleading with small sample sizes.  
**What's needed:**
1. Per-market win rate computation (already exists in `byMarket` breakdown)
2. New `evTimeline` array in stats response mapping each bet's EV contribution chronologically
3. Optional second line overlay on the P&L chart  
**Effort:** ~4h backend + ~2h mobile. **Risk:** noisy with <50 bets per market; should show a "low confidence" badge.

---

### 1.7 Kelly Criterion Tracker 🟡 Needs work
**What:** Given the user's historical win rate per market, show what the Kelly-optimal stake would have been vs what they actually staked.  
**Why:** Identifies systematic over/under-staking.  
**Feasibility:** Same win-rate dependency as EV tracking. Kelly fraction = `(bp - q) / b` where b = odd-1, p = win rate, q = 1-p. Needs bankroll context to convert fraction → EUR amount.  
**What's needed:**
1. EV tracking (1.6) as a prerequisite
2. Either the bankroll module (2.7) or a simple "starting bankroll" input  
**Effort:** ~3h on top of EV tracking. Best implemented after bankroll module.

---

### 1.8 Best / Worst Site ROI (enhanced) ✅ Ready — 🟢 BUILT
**What:** Extend the existing by-site table with: volume (amount staked), average odd, and a sparkline of monthly ROI trend per site.  
**Why:** A site might look profitable in total but only because of one lucky month.  
**Feasibility:** `bySite` breakdown already has `totalStaked` and `roi`. Monthly bucketing per site needs a new aggregation. Sparkline is a tiny Victory Native `Line` inside the table row.  
**Effort:** ~3h. Extend API to return `monthlySeries: { month: string; roi: number }[]` per site row → render inline sparkline.  
**Implementation:** `components/stats/SiteROITable.tsx` — table with logo, stake volume, ROI, win rate, and inline sparkline per site.

---

### 1.9 Personal Leaderboard vs Friends 🟡 Needs work
**What:** Rank the user and their friends by ROI, total profit, or win rate for a chosen period.  
**Why:** Social engagement / motivation.  
**What's needed:**
1. New endpoint `GET /api/stats/friends/leaderboard?period=month`
2. Query each friend's stats summary (requires `Friendship` table access + per-user stats call)
3. New `LeaderboardCard` component
4. Privacy consideration — only show stats if friend's profile allows it (may need a `showStatsToFriends` preference on User)  
**Effort:** ~4h backend + ~3h mobile.

---

### 1.10 Odds Efficiency Score ✅ Ready (NEW) — 🟢 BUILT
**What:** For each bet, compute `actual_return / implied_return` where implied_return is calculated from the inverse of the odds (the bookmaker's implied probability). Aggregate into an efficiency % — 100% means you beat the house exactly at expectation, >100% means you're outperforming.  
**Why:** A single number that normalises performance across different odds ranges and stake sizes.  
**Feasibility:** Pure math on existing `oddValue`, `stake`, `result` fields.  
**Effort:** ~2h. Add to `StatsSummary` → display as a new metric card.  
**Implementation:** `oddsEfficiency` field in `StatsSummary`. Displayed as a metric card with contextual colour (green ≥ 100%, red < 100%) and ⓘ info button.

---

### 1.11 Bet Size Distribution ✅ Ready (NEW) — 🟢 BUILT
**What:** Histogram showing how many bets fall into each stake bracket (€0-5, €5-10, €10-25, €25-50, €50+). Overlay with win rate per bracket.  
**Why:** Shows if the user is more disciplined (and profitable) with certain stake sizes.  
**Feasibility:** Group boletins by `stake` ranges, compute count + win rate per bucket.  
**Effort:** ~2h. New `byStakeBracket` breakdown in API → bar chart component.  
**Implementation:** `byStakeBracket` in stats API → `BreakdownTable` on stats screen with label "Por faixa de stake".

---

### 1.12 Cumulative P&L Tracker (Running Balance) ✅ Ready (NEW) — 🟢 BUILT
**What:** A line chart showing cumulative profit/loss over time (each bet adds or subtracts from a running total) instead of the bucketed area chart.  
**Why:** The existing P&L chart groups by time bucket; a running balance line is more intuitive for seeing the overall trajectory.  
**Feasibility:** Already have `timeline` data with `profitLoss` per bucket. Can compute running sum on the client side from sorted boletins.  
**Effort:** ~2h. New toggle on `PnLChart` — "Acumulado" mode that maps `profitLoss` to a cumulative sum line.  
**Implementation:** `components/stats/PnLChart.tsx` — "Acumulado" toggle button switches between bucketed area chart and running-sum line chart.

---

### 1.13 Parlay Leg Count Analysis ✅ Ready (NEW) — 🟢 BUILT
**What:** Breakdown by number of selections per boletin (singles, doubles, trebles, 4+). Show win rate and ROI per leg count.  
**Why:** Most bettors lose money on parlays but don't realise how much worse their ROI gets as leg count increases.  
**Feasibility:** `boletin.items.length` is the leg count. Group and aggregate.  
**Effort:** ~2h. New `byLegCount` breakdown → reuse `BreakdownTable`.  
**Implementation:** `byLegCount` in stats API → `BreakdownTable` on stats screen with label "Por nº de seleções".

---

### 1.14 Freebet ROI Tracker ✅ Ready (NEW) — 🟢 BUILT
**What:** Separate stats summary for freebets vs real-money bets. Show how much profit came from freebets.  
**Why:** Freebets inflate total ROI if not tracked separately; users want to know their "clean" performance.  
**Feasibility:** `Boletin.isFreebet` field already exists and is stored.  
**Effort:** ~2h. Filter in `buildStatsBundle()` → two-row comparison card (Freebets vs Real).  
**Implementation:** `freebetSummary` in `StatsSummary` → `components/stats/FreebetCard.tsx` showing total freebets, freebet profit, and real-money-only stats.

---

## 2. New App Features

### 2.1 CSV / XLSX Export ✅ Ready — 🟢 BUILT
**What:** Export all boletins (or a filtered subset) to CSV or XLSX for spreadsheet analysis.  
**Why:** Power-user feature; some jurisdictions require betting records for tax purposes.  
**Feasibility:** All boletin data exists. Generate CSV server-side or client-side, serve as a download/share.  
**Effort:** ~3h. New `GET /api/boletins/export?format=csv` endpoint → mobile triggers download via `Sharing.shareAsync()`.  
**Implementation:** `exportBoletinsToCsv` and `exportBoletinsToXlsx` in `services/boletinService.ts`. Download icon on stats screen opens a format picker (CSV / Excel / Cancel). XLSX includes two sheets: Boletins + Seleções. Uses `expo-file-system` + `expo-sharing` + `xlsx` (SheetJS).

---

### 2.2 Bet Journal / Notes Feed ✅ Ready — 🟢 BUILT
**What:** A chronological feed of boletins that have notes, surfacing the user's reasoning and post-mortems.  
**Why:** Core discipline habit for professional bettors; the `notes` field already exists on `Boletin`.  
**Feasibility:** Filter boletins where `notes IS NOT NULL`. Display in a feed view.  
**Effort:** ~3h. New screen or section — `JournalFeed` showing boletin cards with notes expanded inline, sorted by `betDate`.  
**Implementation:** `app/boletins/journal.tsx` — dedicated journal screen accessible from the boletins tab.

---

### 2.3 Duplicate Bet Detection ✅ Ready — 🟢 BUILT
**What:** When the user tries to add a selection to a boletin with the same teams + market + date as an existing PENDING boletin, show a warning.  
**Why:** Accidental duplication inflates exposure.  
**Feasibility:** Compare new item's `homeTeam + awayTeam + market` against items in all PENDING boletins from the query cache.  
**Effort:** ~2h. Check on `addItem` in create screen → show inline warning toast.  
**Implementation:** `app/boletins/create.tsx` — duplicate check on item add, inline warning toast before allowing confirmation.

---

### 2.4 Bankroll Management Module 🟡 Needs work
**What:** User sets a starting bankroll. The app tracks net balance over time, shows units remaining, and warns below a threshold.  
**Why:** Responsible gambling + professional bankroll discipline.  
**What's needed:**
1. New `bankroll` field on `User` model (or dedicated `Bankroll` table for history)
2. Prisma migration: `ALTER TABLE User ADD COLUMN bankroll Decimal(10,2) DEFAULT NULL`
3. New `PATCH /api/users/me` field to set/update bankroll
4. In stats, compute `currentBalance = bankroll + profitLoss`
5. New `BankrollCard` component on Stats screen showing balance, % of bankroll remaining, units chart  
**Effort:** ~5h total (1h schema + 2h API + 2h mobile).

---

### 2.5 Smart Alerts (Odds Movement Notifications) 🔴 Blocked
**What:** User pins an event + selection + target odd; when scraped odds reach that value, push notification fires.  
**Why:** Captures value odds that appear briefly.  
**Blocked by:** No betting site scrapers exist yet. Requires:
1. At least 1 working odds scraper (Betclic, Placard, etc.)
2. New `OddsAlert` Prisma model
3. Bull job to check alerts after each scrape cycle
4. Expo push notification integration  
**Effort estimate if scrapers existed:** ~6h. **With scraper work:** 2-4 weeks.

---

### 2.6 Auto-Result Settlement 🔴 Blocked
**What:** After an event finishes, automatically resolve `BoletinItem` results (WON/LOST/VOID).  
**Why:** Eliminates manual result entry, the biggest friction point.  
**Blocked by:**
1. **No match/event data source** — no live scores API, no betting site scrapers
2. **No event-to-boletin linking** — `BoletinItem` stores team names as free text, no `eventId` FK
3. **No market resolution engine** — need rules to map "1X2" + "1" + final score "2-1" → WON
4. **Fuzzy name matching** — "Benfica" vs "SL Benfica" vs "Sport Lisboa e Benfica"  
**What would be needed (in order):**
1. Integrate a scores API (api-football.com — $50/mo for 500 req/day, covers 750+ leagues) — **~8h**
2. Build a match-linking service: query scores API by team names + date + sport, fuzzy match with Levenshtein distance — **~6h**
3. Build a market resolution engine: per-market-type rules (1X2, O/U, BTTS, Handicap, Dupla Hipótese, etc.) across football, basketball, tennis — **~10h**
4. Schema migration: add `eventExternalId` nullable FK on BoletinItem — **~1h**
5. Bull job: sweep PENDING boletins hourly, look up matches, resolve items — **~4h**
6. Override UI: let user correct auto-marked results — **~3h**  
**Total estimate:** ~32h (about 4 full days). Can be phased: football-only first, then expand.

---

### 2.7 Live Score Integration 🔴 Blocked
**What:** Show live scores inside boletin detail screens.  
**Why:** Users want to follow their bets without leaving the app.  
**Blocked by:** Same as auto-settlement — requires a scores API. If the scores API from 2.6 is set up, this becomes ~4h of additional work (WebSocket relay through existing Socket.io).

---

### 2.8 Shared Boletin Comments & Reactions 🟡 Needs work
**What:** When a boletin is shared with a friend, the friend can leave a reaction (emoji) or short comment.  
**Why:** Increases social stickiness.  
**What's needed:**
1. New `BoletinComment` Prisma model: `{ id, boletinId, userId, body, emoji?, createdAt }`
2. Migration + CRUD endpoints
3. Socket.io event `boletin:comment` for real-time delivery
4. Comment thread UI at bottom of shared boletin detail  
**Effort:** ~6h total (2h schema/API + 2h Socket.io + 2h mobile UI).

---

### 2.9 Bet Builder / Accumulator Simulator ✅ Ready — 🟢 BUILT
**What:** Before placing a bet, the user sees projected ROI based on historical performance for the selected sports/markets/odds range.  
**Why:** Turns the boletin creation screen into a decision-support tool.  
**Feasibility:** The `BoletinBuilderStore` already holds selections. Cross-reference against existing `byMarket`, `bySport`, `byOddsRange` stats to show "Your historical ROI for this type of bet: X%".  
**Effort:** ~3h. Add a "Projeção" section to the create screen that queries cached stats data.  
**Implementation:** `components/boletins/ProjectionCard.tsx` — embedded in the create screen, shows projected ROI/win-rate from historical breakdown data matching the current selections.

---

### 2.10 Multi-Currency & Odds Format Support 🟡 Needs work
**What:** Switch between EUR/GBP/USD and Decimal/Fractional/American odds display.  
**Why:** Some Portuguese users also bet on UK-facing sites.  
**What's needed:**
1. `oddsFormat` preference on User model (enum: DECIMAL, FRACTIONAL, AMERICAN)
2. Conversion functions in `@betintel/shared`
3. Wrap all `formatOdds()` calls through the conversion
4. Currency: add exchange rate lookup (or fixed rates) + format helper  
**Effort:** ~5h (1h schema + 2h conversion logic + 2h UI integration).

---

## 3. New UX & Quality-of-Life Improvements

### 3.1 Empty State Coaching ✅ Ready — 🟢 BUILT
**What:** When the user has zero boletins, Stats/Bets screens show a friendly empty state with a CTA to create their first boletin.  
**Effort:** ~1h. Use existing `EmptyState` component pattern.  
**Implementation:** `components/ui/EmptyState.tsx` — used in stats screen and other list screens when data is empty.

---

### 3.2 Haptic Feedback ✅ Ready — 🟢 BUILT
**What:** Light haptic taps on chip selection, boletin save, pull-to-refresh via `expo-haptics`.  
**Effort:** ~1h. Add `Haptics.impactAsync()` calls at key interaction points.  
**Implementation:** `utils/haptics.ts` — `hapticLight()` / `hapticSuccess()` helpers, lazy-required to avoid native module crash in dev client. Used in create screen on save and item add.

---

### 3.3 Quick-Add from Notification ✅ Ready
**What:** Tapping a "bet settled" notification deep-links to the resolved boletin detail.  
**Feasibility:** Expo Notifications + expo-router deep linking. The Socket.io `boletinResult` event already fires.  
**Effort:** ~2h.

---

### 3.4 Onboarding Flow ✅ Ready
**What:** 3-step intro carousel on first launch — what the app does, how to add a boletin, how to read stats.  
**Effort:** ~3h. `AsyncStorage` flag + 3 illustration screens.

---

### 3.5 Widget (iOS / Android) 🟡 Needs work
**What:** Home screen widget showing current month ROI, open boletin count, last result.  
**What's needed:** Expo Widgets (experimental) or native module. Not stable enough for production yet.  
**Effort:** ~8h if/when Expo Widgets stabilises.

---

### 3.6 Dark Mode OLED Scheduled Auto-Switch ✅ Ready — 🟢 BUILT
**What:** Automatically switch to dark mode between 22:00–07:00.  
**Feasibility:** Theme store already supports system/light/dark. Add a "scheduled" option that checks current hour.  
**Effort:** ~1h.  
**Implementation:** `stores/themeStore.ts` — `ThemePreference` includes `'scheduled'` mode with configurable `darkStart`/`darkEnd` hours.

---

## 4. Summary: Implementation Priority

| # | Feature | Status | Effort | Impact | Priority | Built |
|---|---------|--------|--------|--------|----------|-------|
| 1.1 | Streak Tracker | ✅ Ready | ~2h | 🟡 Medium | **P0** | 🟢 Yes |
| 1.2 | Avg Stake by Outcome | ✅ Ready | ~1h | 🟡 Medium | **P0** | 🟢 Yes |
| 1.3 | P&L by Weekday | ✅ Ready | ~2h | 🟡 Medium | **P0** | 🟢 Yes |
| 1.4 | Bet Frequency Heatmap | ✅ Ready | ~4h | 🟡 Medium | **P0** | 🟢 Yes |
| 1.13 | Parlay Leg Count Analysis | ✅ Ready | ~2h | 🟡 Medium | **P0** | 🟢 Yes |
| 1.14 | Freebet ROI Tracker | ✅ Ready | ~2h | 🟢 Low | **P0** | 🟢 Yes |
| 1.10 | Odds Efficiency Score | ✅ Ready | ~2h | 🟡 Medium | **P1** | 🟢 Yes |
| 1.11 | Bet Size Distribution | ✅ Ready | ~2h | 🟡 Medium | **P1** | 🟢 Yes |
| 1.12 | Cumulative P&L Tracker | ✅ Ready | ~2h | 🟡 Medium | **P1** | 🟢 Yes |
| 1.5 | Sport × Market Matrix | ✅ Ready | ~3h | 🟡 Medium | **P1** | 🟢 Yes |
| 1.8 | Enhanced Site ROI | ✅ Ready | ~3h | 🟢 Low | **P1** | 🟢 Yes |
| 2.1 | CSV / XLSX Export | ✅ Ready | ~3h | 🟡 Medium | **P1** | 🟢 Yes |
| 2.2 | Bet Journal Feed | ✅ Ready | ~3h | 🟡 Medium | **P1** | 🟢 Yes |
| 2.3 | Duplicate Bet Detection | ✅ Ready | ~2h | 🟢 Low | **P1** | 🟢 Yes |
| 2.9 | Bet Builder Simulator | ✅ Ready | ~3h | 🟡 Medium | **P1** | 🟢 Yes |
| 3.1 | Empty State Coaching | ✅ Ready | ~1h | 🟢 Low | **P1** | 🟢 Yes |
| 3.2 | Haptic Feedback | ✅ Ready | ~1h | 🟢 Low | **P1** | 🟢 Yes |
| 3.6 | Scheduled Dark Mode | ✅ Ready | ~1h | 🟢 Low | **P2** | 🟢 Yes |
| 1.6 | EV Tracking | 🟡 Needs work | ~6h | 🔴 High | **P2** | ❌ No |
| 2.4 | Bankroll Management | 🟡 Needs work | ~5h | 🔴 High | **P2** | ❌ No |
| 1.7 | Kelly Criterion | 🟡 Needs work | ~3h+ | 🟡 Medium | **P3** | ❌ No |
| 1.9 | Leaderboard vs Friends | 🟡 Needs work | ~7h | 🟡 Medium | **P3** | ❌ No |
| 2.8 | Shared Comments | 🟡 Needs work | ~6h | 🟡 Medium | **P3** | ❌ No |
| 2.10 | Multi-Currency/Odds | 🟡 Needs work | ~5h | 🟢 Low | **P3** | ❌ No |
| 2.6 | Auto-Settlement | 🔴 Blocked | ~32h | 🔴 High | **Future** | ❌ No |
| 2.5 | Smart Alerts | 🔴 Blocked | ~6h+ | 🔴 High | **Future** | ❌ No |
| 2.7 | Live Scores | 🔴 Blocked | ~4h+ | 🟡 Medium | **Future** | ❌ No |
| 3.3 | Quick-Add from Notification | ✅ Ready | ~2h | 🟢 Low | **P2** | ❌ No |
| 3.4 | Onboarding Flow | ✅ Ready | ~3h | 🟢 Low | **P2** | ❌ No |
| 3.5 | Home Screen Widget | 🟡 Needs work | ~8h | 🟡 Medium | **Future** | ❌ No |
