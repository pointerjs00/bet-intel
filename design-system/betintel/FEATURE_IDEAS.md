# BetIntel — Feature Ideas, Stats & Metrics Roadmap

> High-level proposals. Each item is independent and can be prioritised separately.

---

## 1. New Stats & Metrics

### 1.1 Expected Value (EV) Tracking
**What:** For each bet, calculate the implied probability from the odd and compare it to the user's historical win rate on that market/sport. Show cumulative EV vs actual return over time.  
**Why:** Helps the user see whether they are finding value or just variance.  
**High-level:** Add `expectedValue` field computed locally from `oddValue` and the user's historical win rate per market; surface as a line on the P&L chart and a +EV / −EV column in breakdown tables.

---

### 1.2 Streak Tracker
**What:** Longest winning streak, current streak (W/L), longest losing streak.  
**Why:** Psychologically important — helps the user spot tilt or hot hands.  
**High-level:** Compute on the ordered boletin list; display as a compact 3-cell row card below the ROI card.

---

### 1.3 Closing Line Value (CLV)
**What:** Compare the odd at the time the bet was placed against the closing odd (odd at event start). Positive CLV = the user consistently out-prices the market.  
**Why:** CLV is the single best predictor of long-term profitability.  
**High-level:** Store `closingOdd` on `BoletinItem` (scraped at event kickoff); show average CLV per site and per market in the breakdown tables.

---

### 1.4 Kelly Criterion Tracker
**What:** Given the user's historical win rate per market, show what the Kelly-optimal stake would have been vs what they actually staked.  
**Why:** Identifies systematic over/under-staking.  
**High-level:** Compute offline per boletin; display as an overlay on the P&L timeline chart (actual stake vs Kelly stake).

---

### 1.5 Bet Frequency Heatmap
**What:** Calendar heatmap (GitHub-style) showing how many bets were placed each day of the year, colour-coded by profit/loss.  
**Why:** Reveals patterns — e.g. "I bet recklessly on Saturdays" or "I only bet profitably midweek".  
**High-level:** New `HeatmapCalendar` component using a 52×7 grid of coloured `View` cells; data from existing boletin dates.

---

### 1.6 Sport × Market Matrix
**What:** Cross-tab table — sports as rows, market types (1X2, O/U, BTTS…) as columns — showing ROI in each cell.  
**Why:** Pinpoints where the user actually has an edge (e.g. good at BTTS in football, terrible at tennis 1X2).  
**High-level:** Aggregate in the stats API; render with a scrollable matrix component using colour-scaled cells (green → red).

---

### 1.7 Average Stake by Outcome
**What:** Show average stake on WON vs LOST bets.  
**Why:** Reveals whether the user subconsciously stakes more on bets they lose (confidence bias).  
**High-level:** Simple aggregation added to `summary` in the stats API; two metric cards side-by-side on the Stats screen.

---

### 1.8 Profit/Loss by Day of Week
**What:** Bar chart showing net P&L for each weekday (Mon–Sun).  
**Why:** Many bettors have day-of-week bias tied to specific leagues/fixtures.  
**High-level:** New breakdown endpoint `/api/stats/me/by-weekday`; `BreakdownTable` reuse with weekday labels.

---

### 1.9 Best / Worst Site ROI (enhanced)
**What:** Extend the existing by-site table with: volume (amount staked), average odd, and a sparkline of monthly ROI trend per site.  
**Why:** A site might look profitable in total but only because of one lucky month.  
**High-level:** Backend returns monthly buckets per site; mobile renders a 20px sparkline using Victory Native inside the table row.

---

### 1.10 Personal Leaderboard vs Friends
**What:** Rank the user and their friends by ROI, total profit, or win rate for a chosen period.  
**Why:** Social engagement / motivation.  
**High-level:** New `/api/stats/friends/leaderboard` endpoint; new card on Friends screen and optionally on Stats screen.

---

## 2. New App Features

### 2.1 Bet Builder / Accumulator Simulator
**What:** Before placing a bet, the user selects selections from the odds feed and the app calculates total odds, potential return, and shows the historical ROI for that combination of sports/markets.  
**Why:** Turns the odds feed into a pre-bet decision tool.  
**High-level:** The existing `BoletinBuilderStore` already holds selections; add a "Simular" mode that doesn't save, just shows projections using historical stats.

---

### 2.2 Smart Alerts (Odds Movement Notifications)
**What:** User pins an event + selection + target odd; when scraped odds reach or exceed that value, a push notification fires.  
**Why:** Captures value odds that appear briefly.  
**High-level:** New `OddsAlert` table in Prisma; Bull job checks pinned alerts after every scrape cycle; Expo Notifications for delivery.

---

### 2.3 Bet Journal / Notes Feed
**What:** A free-text per-boletin journal visible in a chronological feed — user can record reasoning, emotions, or post-mortems.  
**Why:** Core discipline habit for professional bettors; the `notes` field already exists on `Boletin`.  
**High-level:** Surface the existing `notes` field as a `JournalFeed` tab/section showing boletins sorted by date with their notes visible inline; add a quick-note floating button on the bets screen.

---

### 2.4 CSV / PDF Export
**What:** Export all boletins (or a filtered subset) to CSV for spreadsheet analysis or PDF for records.  
**Why:** Power-user feature; some jurisdictions require betting records for tax purposes.  
**High-level:** Backend `/api/boletins/export?format=csv|pdf` endpoint; mobile shows a share sheet with the file; PDF generated with `pdfkit` on the server.

---

### 2.5 Bankroll Management Module
**What:** User sets a starting bankroll. The app tracks net balance over time (bankroll + P&L), shows how many units they have left, and warns if they drop below a configurable threshold.  
**Why:** Responsible gambling + professional bankroll discipline.  
**High-level:** New `Bankroll` table; new screen in Profile/Settings; balance chart on Stats screen as an alternative to P&L.

---

### 2.6 Live Score Integration
**What:** Show live scores inside Event Detail and Boletin Detail screens, updating via WebSocket.  
**Why:** Users want to follow their bets without leaving the app.  
**High-level:** Integrate a free scores API (e.g. api-football, TheSportsDB); push score updates through the existing Socket.io `event:statusChange` event which is already defined.

---

### 2.7 Multi-Currency & Odds Format Support
**What:** Allow users to switch between EUR/GBP/USD and between Decimal / Fractional / American odds display formats.  
**Why:** Internationalisation; some Portuguese users also bet on UK-facing sites that show fractional odds.  
**High-level:** Store preference on `User.currency`; conversion functions in `@betintel/shared`; odds format toggle in Profile/Settings.

---

### 2.8 Duplicate Bet Detection
**What:** When the user tries to add a selection already present in another open boletin, warn them.  
**Why:** Accidental duplication is common and inflates perceived exposure.  
**High-level:** Check `BoletinBuilderStore` items against open boletins from the cache before adding; show an inline warning toast.

---

### 2.9 Auto-Result Settlement
**What:** After an event finishes, automatically mark each `BoletinItem` as WON/LOST/VOID based on the scraped result and update the parent `Boletin` status.  
**Why:** Currently users must manually update results, which is a significant friction point.  
**High-level:** Bull job running after each event status change; result resolution logic in `statsService` already partially exists; requires matching scraped final score → market outcome.

---

### 2.10 Shared Boletin Comments & Reactions
**What:** When a boletin is shared with a friend, the friend can leave a reaction (emoji) or short comment.  
**Why:** Increases social stickiness.  
**High-level:** New `BoletinComment` table with `boletinId`, `userId`, `body`, `createdAt`; comment thread shown at the bottom of the `SharedBoletin` detail view; Socket.io event `boletin:comment` for real-time delivery.

---

## 3. UX & Quality-of-Life Improvements

### 3.1 Onboarding Flow
A 3-step intro carousel (shown once on first launch): what the app does, how to add a boletin, how to read your stats.

### 3.2 Empty State Coaching
When the user has zero boletins, the Stats screen should show a friendly illustration + call-to-action card with a shortcut to create their first boletin.

### 3.3 Haptic Feedback
Light haptic taps on chip selection, boletin save success, and pull-to-refresh completion via `expo-haptics`.

### 3.4 Quick-Add from Notification
When a "bet result settled" notification arrives, tapping it should deep-link directly to the resolved boletin detail screen.

### 3.5 Widget (iOS / Android)
A home screen widget showing the user's current month ROI, open boletin count, and last result. Requires Expo Widgets (currently experimental) or a React Native Widget extension.

### 3.6 Dark Mode OLED Scheduled Auto-Switch
Automatically switch to OLED dark mode between 22:00–07:00 regardless of system setting, overridable in Settings.

---

## Priority Suggestion

| Item | Impact | Effort | Priority |
|---|---|---|---|
| Auto-Result Settlement (2.9) | 🔴 High | 🟡 Medium | P0 |
| Smart Alerts (2.2) | 🔴 High | 🟡 Medium | P0 |
| Streak Tracker (1.2) | 🟡 Medium | 🟢 Low | P1 |
| Bet Frequency Heatmap (1.5) | 🟡 Medium | 🟡 Medium | P1 |
| Bankroll Management (2.5) | 🔴 High | 🔴 High | P1 |
| EV Tracking (1.1) | 🔴 High | 🔴 High | P2 |
| CLV (1.3) | 🔴 High | 🔴 High | P2 |
| CSV/PDF Export (2.4) | 🟡 Medium | 🟢 Low | P2 |
| Sport × Market Matrix (1.6) | 🟡 Medium | 🟡 Medium | P2 |
| Live Scores (2.6) | 🟡 Medium | 🔴 High | P3 |
