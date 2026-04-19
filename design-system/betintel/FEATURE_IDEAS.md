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

### 1.15 Peak Hours Analysis ✅ Ready (NEW)
**What:** Breakdown of P&L by hour of day (0–23h). Show which time slots yield the best/worst ROI.  
**Why:** Reveals fatigue/tilt patterns — e.g. "I lose money on late-night bets after 23h" or "my best decisions are placed in the morning". Actionable enough for the user to self-regulate.  
**Feasibility:** `betDate` (or `createdAt`) already stores full DateTime. Group by `getHours()` into 24 buckets, aggregate P&L + win rate per bucket. Pure computation in `buildStatsBundle()`.  
**Effort:** ~2h. New `byHour` breakdown array in stats API → new `HourlyHeatstrip` component (horizontal bar with 24 cells, colour-scaled).  
**Mobile:** Compact 24-cell horizontal strip with heat colours (green = profitable, red = loss). Tap a cell to see hour-specific stats in a tooltip.

---

### 1.16 Closing Rate / Leg Kill Analysis ✅ Ready (NEW)
**What:** For multi-leg (parlay) boletins that LOST, show which leg number most frequently kills the bet. E.g. "Leg 3 is the one that fails 42% of the time".  
**Why:** Helps bettors identify if they consistently add a weak "extra leg" that ruins accumulators. Very common problem.  
**Feasibility:** For each LOST boletin, find the LOST items and their position index. Aggregate across all lost accumulators. Requires `boletinItems` to have a stable order (array index = leg number).  
**Effort:** ~3h. New `legKillDistribution` array in stats response → bar chart or table.  
**Mobile:** Bar chart showing "Seleção que falhou" — which leg position kills parlays most. Only shown for users with enough multi-leg data (minimum 10 lost parlays).

---

### 1.17 Confidence Calibration ✅ Ready (NEW)
**What:** Group bets by odds tier (implied probability %) and compare the user's actual win rate vs implied probability. Show a calibration curve — perfect calibration = diagonal line.  
**Why:** Reveals systematic biases. E.g. "You bet on 1.50 odds (67% implied) but only win 55% of those — you're overpaying for favourites." This is the most insightful advanced metric for serious bettors.  
**Feasibility:** All data exists: `oddValue` → `impliedProb = 1/oddValue`. Group items by implied-probability buckets (e.g. 10% bands: 0-10%, 10-20%, ..., 90-100%), compute actual win rate per bucket. Plot calibration curve.  
**Effort:** ~4h. New `calibration` array in stats API → new `CalibrationChart` component (scatter/line chart with diagonal reference).  
**Mobile:** Line chart: X-axis = implied probability, Y-axis = actual win rate. Diagonal line = perfect calibration. Points above the line = user finds value, below = user overpays.

---

### 1.18 Monthly Targets / Goals ✅ Ready (NEW)
**What:** User sets monthly goals (e.g. "target ROI: +5%", "max 30 bets", "max stake per bet: €20"). Track progress against goals with a progress bar.  
**Why:** Encourages disciplined betting. Professional bettors always have targets and limits. The progress visualisation creates positive reinforcement loops.  
**Feasibility:** Store goals in a new `UserGoal` model or simpler as JSON in a user preference field. Compare current-month stats summary against targets. All underlying stats already computed.  
**What's needed:**
1. New `goals` JSON field on User model (or separate `UserGoal` table for history)
2. Goal-setting UI in profile/settings
3. `GoalProgressCard` on Stats screen showing bars for each active goal  
**Effort:** ~4h total (1h schema + 1h API + 2h mobile).

---

### 1.19 Variance / Standard Deviation Tracker ✅ Ready (NEW)
**What:** Compute and display the standard deviation of P&L per bet, plus a variance indicator showing whether current performance is within expected range.  
**Why:** Helps users understand if a losing streak is statistically normal or if their strategy genuinely changed. Separates signal from noise.  
**Feasibility:** Pure math on existing resolved boletins: `stdDev(profitLoss per boletin)`. Can also show "expected range" bands (±1σ, ±2σ) on the cumulative P&L chart.  
**Effort:** ~3h. New `variance` / `stdDev` fields in `StatsSummary` → confidence bands overlay on PnLChart.  
**Mobile:** Add ±1σ shaded bands to the cumulative P&L chart. New metric card showing "Volatilidade" with contextual explanation (low/medium/high).

---

### 1.20 Home/Away Split ✅ Ready (NEW)
**What:** For bets on team events (football, basketball, etc.), show separate ROI/win rate for when you bet on the home team vs the away team.  
**Why:** Many bettors unconsciously favour home teams or underestimate away underdogs. Quantifying the split surfaces the bias.  
**Feasibility:** `BoletinItem` stores `homeTeam`, `awayTeam`, and `selection`. For 1X2 markets: selection "1" = home pick, "2" = away pick, "X" = draw. Parse and aggregate. For other markets (O/U, BTTS), this doesn't apply — filter to directional markets only.  
**Effort:** ~2h. New `homeAwayROI` breakdown in stats API → two-column comparison card.  
**Mobile:** Two side-by-side metric cards: "Casa" vs "Fora" showing ROI, win rate, and bet count for each.

---

### 1.21 Favourite vs Underdog Performance ✅ Ready (NEW)
**What:** Classify each bet as "favourite" (odds < 2.00) or "underdog" (odds ≥ 2.00) and show separate ROI/win-rate for each.  
**Why:** Users often think they're good at finding value underdogs when they're actually bleeding on them. Or vice versa — they could discover they have an edge on longshots.  
**Feasibility:** Simple classification on `oddValue` threshold (2.00 is the fair coin line). Aggregate P&L per group.  
**Effort:** ~2h. Two new fields in `StatsSummary` → comparison card on Stats screen.  
**Mobile:** `FavouriteUnderdogCard` component — two columns comparing favourite (odds < 2.00) vs underdog (odds ≥ 2.00) with ROI, win rate, and total staked.

---

### 1.22 Yield Over Time (ROI Trend) ✅ Ready (NEW)
**What:** A line chart showing ROI % evolution over time (rolling window — e.g. last 20 bets), not just cumulative P&L.  
**Why:** Cumulative P&L is heavily influenced by stake size changes. A yield/ROI trend line normalises for that and shows whether the user's edge is improving, declining, or stable.  
**Feasibility:** Compute rolling-window ROI from sorted resolved boletins. Window size configurable (20/50/100 bets).  
**Effort:** ~3h. New `roiTrend` array in stats API or computed client-side → overlay on PnLChart or new chart.  
**Mobile:** Toggle on PnLChart: "Yield %" mode showing rolling-window ROI line. Default window: last 20 settled bets, adjustable via segment control.

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

### 2.11 Recurring Bet Templates ✅ Ready (NEW)
**What:** Save a boletin as a reusable template (e.g. "Weekend Liga NOS accumulator"). One tap to recreate a new boletin with the same structure (teams, markets) but fresh odds/date.  
**Why:** Power users place similar bet types weekly. Reduces friction from manual re-entry and encourages consistent strategy.  
**Feasibility:** Store template as a lightweight JSON snapshot: `{ items: [{ homeTeam, awayTeam, competition, sport, market, selection }], siteSlug, defaultStake }`. No new schema needed — save templates as a JSON array on AsyncStorage or a new `BetTemplate` model.  
**What's needed:**
1. New `BetTemplate` Prisma model: `{ id, userId, name, template JSON, createdAt }`
2. "Guardar como modelo" button on boletin detail
3. "Criar a partir de modelo" option on create screen
4. Pre-fill builder store from template, user adjusts odds/stake  
**Effort:** ~4h total (1h schema + 1.5h API + 1.5h mobile).

---

### 2.12 Bet Slip Import from Screenshot (OCR) 🟡 Needs work (NEW)
**What:** User takes a screenshot of their bet slip from a bookmaker site/app. The app uses OCR to extract teams, odds, stake, and pre-fills a new boletin.  
**Why:** Dramatically reduces manual entry — the #1 friction point. Most bettors place bets outside the app and then log them.  
**What's needed:**
1. OCR library — `@react-native-ml-kit/text-recognition` (on-device, free, no network) or cloud OCR
2. A parser that maps raw OCR text to structured bet data (regex patterns per bookmaker format)
3. Confirmation screen where user reviews/corrects parsed data before saving  
**Effort:** ~10h (3h OCR setup + 4h parser per site + 3h UI). **Risk:** OCR accuracy varies; should be positioned as "best effort" with manual correction.

---

### 2.13 Bet Tagging / Categorisation ✅ Ready (NEW)
**What:** User adds custom tags to boletins (e.g. "value bet", "gut feeling", "statistic-based", "live bet", "pre-match"). Filter and view stats by tag.  
**Why:** Lets the user categorise *why* they placed a bet and measure which strategies actually work. Essential for serious self-analysis.  
**What's needed:**
1. New `tags` field on `Boletin` model: `String[]` (array of tag strings)
2. Prisma migration: `ALTER TABLE Boletin ADD COLUMN tags TEXT[] DEFAULT '{}'`
3. Tag input on create/edit screen (pill chips with autocomplete from previous tags)
4. New `byTag` stats breakdown
5. Filter boletins list by tag  
**Effort:** ~5h total (1h schema + 2h API + 2h mobile).

---

### 2.14 Undo / Edit Window for Resolved Bets ✅ Ready (NEW)
**What:** After marking a boletin as WON/LOST, allow a 5-minute undo window, or let the user edit the result later (with a confirmation prompt and audit log).  
**Why:** Users frequently mis-tap when resolving bets (marked as LOST when they won, or vice versa). Manual entry makes this inevitable.  
**Feasibility:** The `Boletin.status` field can be updated via `PATCH /api/boletins/:id`. Add a `resolvedAt` timestamp to know when it was resolved. Allow status changes within a window or always with confirmation.  
**What's needed:**
1. New `resolvedAt` DateTime field on Boletin
2. Toast with "Desfazer" button shown for 5 seconds after resolving
3. Edit button on resolved boletins that opens a confirmation modal  
**Effort:** ~3h total (30min schema + 1h API + 1.5h mobile).

---

### 2.15 Quick Log Mode ✅ Ready (NEW)
**What:** A stripped-down boletin creation flow optimised for speed: just enter teams, market, odds, stake, result → done in 15 seconds. Skip competition selection, notes, site, date defaults to today.  
**Why:** Many users log bets after the fact and just want to record them fast. The full create form has 8+ fields which discourages daily logging.  
**Feasibility:** Reuse the builder store but pre-fill defaults (today's date, default site, auto-name). Show only: team inputs + market + odds + stake + result.  
**Effort:** ~3h. New "Registo rápido" mode toggle on create screen or a separate bottom-sheet entry point from the boletins tab FAB.  
**Mobile:** Long-press on FAB → "Registo rápido" → bottom sheet with minimal fields. Optional: swipe between items to add multiple quick bets in sequence.

---

### 2.16 Insights & Tips Engine ✅ Ready (NEW)
**What:** Auto-generated personalised insights based on stats data. E.g. "Os teus boletins de 3+ seleções perdem 4x mais que simples" or "O teu ROI às sextas é -18%, considera parar".  
**Why:** Raw stats tables are powerful but many users don't know what to look for. Automated insight text surfaces actionable findings.  
**Feasibility:** All data already exists in stats breakdowns. Write a rule engine that checks thresholds: if weekday ROI < -10%, if parlay ROI << singles ROI, if avg stake on losses >> avg stake on wins, etc. Generate Portuguese text strings.  
**Effort:** ~4h (3h rule engine + 1h component). No schema changes needed — pure client-side or API-side computation from existing stats.  
**Mobile:** New `InsightsFeed` component at top of Stats screen (or dedicated tab). Each insight is a card with an icon, Portuguese text, and a "Ver mais" link to the relevant breakdown section.

---

### 2.17 Boletin Cloning / Copy ✅ Ready (NEW)
**What:** Duplicate an existing boletin to create a new one with the same selections. Useful for re-betting similar events next matchday.  
**Why:** Common workflow: "Last week's bet almost hit, want to try again with updated odds."  
**Feasibility:** Copy `BoletinItem[]` (teams, markets, selections) into builder store. User adjusts odds/stake/date.  
**Effort:** ~2h. "Duplicar" action on boletin detail → pre-fill builder store → navigate to create screen.  
**Mobile:** Button on boletin detail screen. Builder loaded with items from the cloned boletin, user updates odds and stake before saving.

---

### 2.18 Responsible Gambling Tools ✅ Ready (NEW)
**What:** Self-exclusion features: daily/weekly/monthly stake limits, loss limits, session time reminders, and a "cooling off" pause mode (disable bet creation for X hours).  
**Why:** Responsible gambling compliance is increasingly mandatory in Portugal (SRIJ regulations). Also genuinely helpful for user well-being and app trust.  
**What's needed:**
1. New fields on User model: `dailyStakeLimit`, `weeklyStakeLimit`, `monthlyStakeLimit`, `lossLimit`, `coolingOffUntil`
2. Enforce limits when creating boletins (soft block + optional hard block)
3. Session timer notification (configurable: every 30/60/90 min via local Expo Notification)
4. "Pausa" mode: `coolingOffUntil` timestamp, disable create button, show countdown  
**Effort:** ~6h total (1h schema + 2h API + 3h mobile).  
**Mobile:** New "Jogo responsável" section in Profile/Settings with limit inputs, pause toggle, and session timer toggle.

---

### 2.19 Advanced Search & Filter on Boletins ✅ Ready (NEW)
**What:** Full-text search and advanced filters on the boletins list: search by team name, competition, date range, odds range, stake range, status, site, tags.  
**Why:** As the user accumulates hundreds of boletins, finding specific ones becomes tedious. Power users need to query their history ("show me all Benfica bets from January").  
**Feasibility:** All fields exist on Boletin/BoletinItem. Add query params to existing `GET /api/boletins` endpoint. Client-side search also possible for cached data.  
**Effort:** ~4h (2h API filter expansion + 2h mobile search UI with filter sheet).  
**Mobile:** Search bar at top of boletins list + expandable filter panel (bottom sheet) with: team search, sport pills, date range, odds slider, stake slider, status chips, site multi-select.

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

### 3.7 Pull-to-Refresh with Smart Sync ✅ Ready (NEW)
**What:** Pull-to-refresh on all data screens (stats, boletins, friends) with visual feedback. Also sync stale data when the app comes to foreground after 5+ minutes in background.  
**Why:** Users expect pull-to-refresh on mobile. Smart background sync means data stays fresh without manual action.  
**Feasibility:** React Query `refetchOnMount` / `refetchOnWindowFocus` + Expo AppState listener. Pull-to-refresh via `RefreshControl` on FlatList/ScrollView.  
**Effort:** ~2h. Add `RefreshControl` to all major list screens + AppState listener in root layout.

---

### 3.8 Boletin Swipe Gestures ✅ Ready (NEW)
**What:** Swipe actions on boletin list items: swipe right = quick resolve (WON/LOST picker), swipe left = share or delete. Two-step: swipe → confirm.  
**Why:** Resolving bets is the most frequent action. Getting it to one swipe + tap saves enormous time when processing multiple results at once.  
**Feasibility:** `react-native-gesture-handler` + `react-native-reanimated` already in the project. Swipeable rows with snap-back animation.  
**Effort:** ~4h. New `SwipeableBoletinCard` component wrapping existing `BoletinCard`.  
**Mobile:** Right swipe reveals green (WON) / red (LOST) / grey (VOID) buttons. Left swipe reveals share + delete. Haptic feedback on threshold.

---

### 3.9 Batch Resolve Mode ✅ Ready (NEW)
**What:** "Resolver tudo" mode where the user can tap through multiple PENDING boletins in sequence: show boletin → WON/LOST/VOID → next → done. Progress indicator (3/7).  
**Why:** After a weekend of matches, the user might have 10+ pending boletins to resolve. Going into each one individually is tedious.  
**Feasibility:** Query all PENDING boletins, present in a paged card stack or swipeable flow. Status update API already exists (`PATCH /api/boletins/:id`).  
**Effort:** ~4h. New `BatchResolveScreen` (or bottom sheet) accessible from boletins tab when PENDING count > 1.  
**Mobile:** Full-screen card stack: boletin summary card with big WON/LOST/VOID buttons at bottom. Swipe left = skip (keep pending). Counter "3 de 7" at top. Done screen shows summary of what was resolved.

---

### 3.10 Stats Comparison Periods ✅ Ready (NEW)
**What:** Compare two time periods side-by-side: "Este mês vs mês passado" or "Esta semana vs semana passada". Show delta arrows (↑↓) for each metric.  
**Why:** Trend is more informative than a single snapshot. "ROI: +8% (↑ from -2% last month)" is much more motivating/alarming than just "+8%".  
**Feasibility:** Stats API already supports `dateFrom`/`dateTo`. Make two parallel API calls with different periods and diff the results client-side.  
**Effort:** ~3h. New "Comparar" toggle on Stats screen + `ComparisonOverlay` showing delta badges on metric cards.  
**Mobile:** Small toggle button on Stats header: "Comparar". When active, each metric card shows the comparison period value below and a green/red delta arrow.

---

### 3.11 Accessibility Improvements ✅ Ready (NEW)
**What:** Full accessibility audit and improvements: proper `accessibilityLabel` on all interactive elements, `accessibilityRole` on buttons/links, VoiceOver/TalkBack support, minimum 44pt touch targets, sufficient colour contrast (WCAG AA).  
**Why:** Required for good mobile UX and app store compliance. Also helps users who rely on screen readers.  
**Feasibility:** React Native accessibility props already available. Needs systematic audit.  
**Effort:** ~6h for full audit + fixes across all screens.

---

### 3.12 Offline Mode / Optimistic UI ✅ Ready (NEW)
**What:** Allow boletin creation and result logging while offline. Queue changes locally and sync when connectivity returns. Optimistic UI updates: show the change instantly, reconcile with server in background.  
**Why:** Bettors are often in venues (stadiums, bars) with poor connectivity. Losing a bet entry to a network error is extremely frustrating.  
**Feasibility:** React Query + AsyncStorage persistence. Queue mutations in a local store, replay on reconnect. `@react-native-community/netinfo` to detect connectivity.  
**Effort:** ~6h (3h mutation queue + 2h conflict resolution + 1h connectivity UI indicator).  
**Mobile:** Small status indicator in header: green dot = online, orange = queued changes, red = offline. Queued boletins show with a "sync pending" badge.

---

### 3.13 Share Card / Social Media Image ✅ Ready (NEW)
**What:** Generate a branded image card from a resolved boletin showing: status (WON!), teams, odds, return, app branding. Share to Instagram stories, Twitter, WhatsApp.  
**Why:** Social proof drives organic growth. Users love sharing winning slips. A branded card is more attractive than a screenshot.  
**Feasibility:** Use `react-native-view-shot` to capture a styled component as an image → `expo-sharing` to share.  
**Effort:** ~4h. New `ShareCard` component (branded boletin summary) + `ViewShot` capture → share sheet.  
**Mobile:** "Partilhar imagem" button on resolved boletin detail → generates a dark-themed card with BetIntel logo, result badge, odds, return amount, and QR code linking to app download.

---

### 3.14 Guided Stat Walkthrough / Stat Explanations ✅ Ready (NEW)
**What:** Each stat section has a small ⓘ icon. Tapping it opens a brief tooltip or bottom sheet explaining what the metric means and how to interpret it in Portuguese.  
**Why:** Many users don't understand ROI, efficiency, calibration, or variance. Education increases engagement and trust in the data.  
**Feasibility:** Static content only. Map each metric key to a localised explanation string.  
**Effort:** ~2h. Info icon on each stat component → bottom sheet with title + 2-3 sentence explanation + example.  
**Mobile:** Some stat cards already have ⓘ buttons. Extend to ALL stat sections with consistent bottom sheet behaviour.

---

### 3.15 Customisable Stats Dashboard ✅ Ready (NEW)
**What:** Let the user reorder, pin, or hide stats sections on the stats screen. Save layout preference.  
**Why:** The stats screen has 15+ sections. Not every user cares about every metric. Letting them personalize reduces scroll fatigue.  
**Feasibility:** Store an ordered array of section IDs + visibility in AsyncStorage. Render sections in that order, skip hidden ones.  
**Effort:** ~4h. New "Personalizar" button on Stats screen → drag-to-reorder list with toggle switches → save to AsyncStorage.  
**Mobile:** Bottom sheet with section list, drag handles, and eye/hide toggles. Reset to default button.

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
| **1.17** | **Confidence Calibration** | **✅ Ready** | **~4h** | **🔴 High** | **P1** | 🟢 Yes |
| **1.15** | **Peak Hours Analysis** | **✅ Ready** | **~2h** | **🟡 Medium** | **P1** | 🟢 Yes |
| **1.20** | **Home/Away Split** | **✅ Ready** | **~2h** | **🟡 Medium** | **P1** | 🟢 Yes |
| **1.21** | **Favourite vs Underdog** | **✅ Ready** | **~2h** | **🟡 Medium** | **P1** | 🟢 Yes |
| **1.16** | **Closing Rate / Leg Kill** | **✅ Ready** | **~3h** | **🟡 Medium** | **P1** | 🟢 Yes |
| **1.22** | **Yield Over Time (ROI Trend)** | **✅ Ready** | **~3h** | **🟡 Medium** | **P1** | 🟢 Yes |
| **2.16** | **Insights & Tips Engine** | **✅ Ready** | **~4h** | **🔴 High** | **P1** | 🟢 Yes |
| **2.15** | **Quick Log Mode** | **✅ Ready** | **~3h** | **🔴 High** | **P1** | 🟢 Yes |
| **2.17** | **Boletin Cloning** | **✅ Ready** | **~2h** | **🟡 Medium** | **P1** | 🟢 Yes |
| **2.19** | **Advanced Search & Filter** | **✅ Ready** | **~4h** | **🟡 Medium** | **P1** | 🟢 Yes |
| **3.8** | **Boletin Swipe Gestures** | **✅ Ready** | **~4h** | **🔴 High** | **P1** | 🟢 Yes |
| **3.9** | **Batch Resolve Mode** | **✅ Ready** | **~4h** | **🔴 High** | **P1** | 🟢 Yes |
| **3.10** | **Stats Comparison Periods** | **✅ Ready** | **~3h** | **🟡 Medium** | **P1** | 🟢 Yes |
| **3.13** | **Share Card / Social Image** | **✅ Ready** | **~4h** | **🟡 Medium** | **P1** | 🟢 Yes |
| 1.6 | EV Tracking | 🟡 Needs work | ~6h | 🔴 High | **P2** | ❌ No |
| 2.4 | Bankroll Management | 🟡 Needs work | ~5h | 🔴 High | **P2** | ❌ No |
| **1.19** | **Variance / StdDev Tracker** | **✅ Ready** | **~3h** | **🟡 Medium** | **P2** | 🟢 Yes |
| **1.18** | **Monthly Targets / Goals** | **✅ Ready** | **~4h** | **🟡 Medium** | **P2** | ❌ No |
| **2.13** | **Bet Tagging** | **🟡 Needs work** | **~5h** | **🟡 Medium** | **P2** | ❌ No |
| **2.14** | **Undo / Edit Resolved Bets** | **✅ Ready** | **~3h** | **🟡 Medium** | **P2** | 🟢 Yes |
| **2.18** | **Responsible Gambling Tools** | **🟡 Needs work** | **~6h** | **🔴 High** | **P2** | ❌ No |
| **2.11** | **Recurring Bet Templates** | **🟡 Needs work** | **~4h** | **🟡 Medium** | **P2** | ❌ No |
| **3.7** | **Pull-to-Refresh + Smart Sync** | **✅ Ready** | **~2h** | **🟢 Low** | **P2** | 🟢 Yes |
| **3.12** | **Offline Mode / Optimistic UI** | **✅ Ready** | **~6h** | **🟡 Medium** | **P2** | 🟢 Yes |
| **3.14** | **Guided Stat Explanations** | **✅ Ready** | **~2h** | **🟢 Low** | **P2** | 🟢 Yes |
| **3.15** | **Customisable Stats Dashboard** | **✅ Ready** | **~4h** | **🟡 Medium** | **P2** | 🟢 Yes |
| 3.3 | Quick-Add from Notification | ✅ Ready | ~2h | 🟢 Low | **P2** | 🟢 Yes |
| 3.4 | Onboarding Flow | ✅ Ready | ~3h | 🟢 Low | **P2** | 🟢 Yes |
| **3.11** | **Accessibility Improvements** | **✅ Ready** | **~6h** | **🟡 Medium** | **P2** | 🟢 Yes |
| 1.7 | Kelly Criterion | 🟡 Needs work | ~3h+ | 🟡 Medium | **P3** | ❌ No |
| 1.9 | Leaderboard vs Friends | 🟡 Needs work | ~7h | 🟡 Medium | **P3** | ❌ No |
| 2.8 | Shared Comments | 🟡 Needs work | ~6h | 🟡 Medium | **P3** | ❌ No |
| 2.10 | Multi-Currency/Odds | 🟡 Needs work | ~5h | 🟢 Low | **P3** | ❌ No |
| **2.12** | **OCR Bet Slip Import** | **🟡 Needs work** | **~10h** | **🔴 High** | **P3** | ❌ No |
| 2.6 | Auto-Settlement | 🔴 Blocked | ~32h | 🔴 High | **Future** | ❌ No |
| 2.5 | Smart Alerts | 🔴 Blocked | ~6h+ | 🔴 High | **Future** | ❌ No |
| 2.7 | Live Scores | 🔴 Blocked | ~4h+ | 🟡 Medium | **Future** | ❌ No |
| 3.5 | Home Screen Widget | 🟡 Needs work | ~8h | 🟡 Medium | **Future** | ❌ No |
