---
mode: agent
description: Complete BetIntel mobile redesign prompt using the ui-ux-pro-max design skill and React Native implementation constraints.
---

Use the #ui-ux-pro-max skill for this entire task.

## Project: BetIntel - Complete Mobile UI/UX Redesign

### App Context
BetIntel is a Portuguese sports betting companion app for iOS and Android, built with React Native (Expo SDK 51), NativeWind (Tailwind CSS for React Native), Expo Router, and TypeScript strict mode. The app lets users track odds from Portuguese betting sites (Betclic, Placard, Bet365, ESC Online, Moosh, Solverde), build and manage betting slips ("boletins"), track performance stats, and share with friends.

### Step 1 - Design System
Run the design system search:

```bash
python3 .github/prompts/ui-ux-pro-max/scripts/search.py "sports betting fintech dashboard dark mobile portuguese" --design-system --persist -p "BetIntel" -f markdown
```

Then run supplementary searches:

```bash
# Charts for stats screens
python3 .github/prompts/ui-ux-pro-max/scripts/search.py "real-time dashboard financial performance charts" --domain chart

# UX for data-heavy lists with real-time updates
python3 .github/prompts/ui-ux-pro-max/scripts/search.py "animation real-time list performance accessibility" --domain ux

# Typography for fintech/sports
python3 .github/prompts/ui-ux-pro-max/scripts/search.py "fintech bold modern sport" --domain typography

# React Native specific guidance
python3 .github/prompts/ui-ux-pro-max/scripts/search.py "flatlist animation navigation tabs" --stack react-native
```

### Step 2 - Design Constraints (MANDATORY)
These constraints are non-negotiable - apply them to every screen and component:

**Color Palette (already defined in theme/tokens.ts - enforce these)**
- Background: `#0D0D0D` (dark) / `#F2F2F7` (light)
- Surface cards: `#1A1A1A` / `#FFFFFF`
- Primary (win/money): `#00C851`
- Danger (loss): `#FF3B30`
- Warning (pending): `#FF9500`
- Gold (best odds highlight): `#FFD700`
- Live indicator: pulsing `#FF3B30`
- Text primary: `#FFFFFF` / `#000000`
- Text secondary: `#A0A0A0` / `#6C6C70`

**Tech Rules**
- All styling via NativeWind (Tailwind class names) + `StyleSheet` only for shadows/platform specifics
- No inline `style={{ color: '...' }}` unless unavoidable for dynamic values
- Use `useTheme()` hook for all color access - never hardcode hex values in components
- Icons: `MaterialCommunityIcons` + `Ionicons` from `@expo/vector-icons` - no emojis as UI icons
- Animations: `react-native-reanimated` v3 only
- Charts: `victory-native` (XL)
- Images/logos: `expo-image` with blurhash placeholders
- All lists: `FlashList` (not FlatList) with `estimatedItemSize`
- List skeletons: use `components/ui/Skeleton.tsx`

**UX Rules**
- Every interactive element needs `activeOpacity` or Reanimated press feedback
- Loading states: skeleton screens (not spinners) for all data-driven views
- Empty states: illustrated, not just text - use `components/ui/EmptyState.tsx`
- Errors: toast notifications via `components/ui/Toast.tsx`
- All screens handle: loading | error | empty | data states
- Portuguese (PT-PT) for all copy - dates DD/MM/YYYY, 24h, currency `€1.234,56`

### Step 3 - Screens to Redesign (implement one by one)

#### AUTH SCREENS
1. **Login** (`app/(auth)/login.tsx`)
   - Dark, premium feel - think Revolut/N26, not a sportsbook
   - App mark/logomark at top (not text logo)
   - Email + password fields with animated floating labels
   - Show/hide password toggle
   - `Entrar` CTA - full width, primary green, Reanimated press scale
   - Google Sign-In button - white card style, Google logo SVG, dark text
   - `Esqueceste a password?` subtle link
   - `Criar conta` link at bottom
   - Smooth error shake animation on invalid submit
   - Account lockout countdown timer in red

2. **Register** (`app/(auth)/register.tsx`)
   - Step indicator at top (`Step 1: Dados`, `Step 2: Verificacao`)
   - Username field with debounced live check - green checkmark / red X
   - Password strength bar: 4 segments, animated fill
   - Confirm password match indicator
   - Progress CTA changes label based on step

3. **Google Username Picker** (`app/(auth)/google-username.tsx`)
   - Google avatar in a glowing ring at top
   - Display name shown for reassurance
   - Single focused username input
   - Live availability: spinner -> checkmark/X transition

#### MAIN NAVIGATION
4. **Tab Bar** (update `app/(tabs)/_layout.tsx`)
   - Floating pill-style tab bar (not standard OS tab bar)
   - Tabs: Home (odds feed icon), Boletins, Stats, Amigos, Perfil
   - Active tab: primary green with label; inactive: icon only
   - Badge on Amigos tab for pending friend requests
   - Subtle blur background (iOS) / opaque elevated (Android)
   - Micro-animation: active tab indicator morphs between positions

#### ODDS & EVENTS
5. **Home / Odds Feed** (`app/(tabs)/index.tsx`)
   - Full-bleed header, not a standard navbar - search + notification bell overlaid on a subtle gradient
   - Live events horizontal scroll strip: each card shows score, pulsing LIVE dot, time - frosted glass cards
   - Sport filter pills: scrollable, icon + label, active pill fills with green
   - Odds cards: per-event, show league flag + name, teams, event time
   - Multi-site odds comparison table inside card: site logo | market | odds columns
   - Best odd value highlighted gold with subtle glow
   - Odds flash animation (green up / red down) on change - Reanimated layout animation
   - Tap -> event detail; long press -> add to boletin quick action sheet

6. **Event Detail** (`app/odds/[eventId].tsx`)
   - Hero banner: sport gradient, home team | score/time | away team
   - Scrollable market tabs (1X2, O/U, Dupla Hipotese, BTTS, Handicap)
   - Odds comparison table: site logo | home | draw | away (or relevant selections)
   - Tapped cell: highlight with green ring, add-to-boletin confirmation
   - Sparkline chart (24h odds movement) for selected cell - collapse/expand
   - FAB bottom-right: `Adicionar ao Boletin`

7. **Filter Modal** (`app/odds/filter.tsx`) - bottom sheet (`snapPoints: 75%, 95%`)
   - Sites: logo grid, multi-select, `Todos` toggle
   - Sports: 3-column icon grid
   - Odds range: dual-handle range slider, animated thumb
   - Date: preset pills + custom calendar
   - Markets: checkbox list
   - Sticky Apply / Reset footer

#### BOLETINS
8. **My Boletins** (`app/(tabs)/slips.tsx`)
   - Status tabs: Todos | Pendente | Ganhou | Perdeu | Void - animated underline indicator
   - Month summary bar: apostado / retorno / ROI (color-coded)
   - Boletin cards: status chip, stake -> potential return arrow layout, event count, date
   - Swipe right: share action (green); swipe left: delete (red) - with confirmation
   - FAB: create new boletin

9. **Create Boletin** (`app/boletins/create.tsx`)
   - Selections list: site logo chip | event | selection | odds - swipe to remove
   - Live odds calculator card: stake input -> total odds -> potential return
   - Calculator card updates with Reanimated layout animation on each change
   - Optional name + notes fields
   - `Guardar Boletin` sticky CTA

10. **Boletin Detail** (`app/boletins/[id].tsx`)
    - Status banner: full-width, color-coded (green won / red lost / orange pending)
    - Summary row: stake | odds | return | ROI
    - Events list: result icon (check / x / pending / void) | match | market | selection | site logo | odds | result score
    - Collapsible notes section
    - Share + Edit buttons in header (edit only if PENDING)

#### STATS
11. **Statistics** (`app/(tabs)/stats.tsx`)
    - Period selector tabs: Esta Semana | Mes | Ano | Sempre
    - Hero ROI card: large number (color-coded), trend arrow, vs previous period
    - Win rate: circular arc chart (Victory Native), % centered
    - P&L timeline: area chart (green above 0, red below)
    - By Sport: horizontal bar chart rows with sport icon
    - By Site: data table with logo | apostas | ganhos | ROI
    - By Market: same pattern
    - By Odds Range: grouped bar chart (<1.5, 1.5-2, 2-3, 3-5, 5+)
    - Best / worst boletins: horizontal scroll cards at bottom

#### SOCIAL
12. **Friends** (`app/(tabs)/friends.tsx`)
    - Tabs: Feed | Amigos | Pedidos (badge count)
    - Feed: activity items with avatar, action summary, time, boletin card preview
    - Amigos: alphabetical list with avatar, username, last active
    - Pedidos: received requests (accept/decline inline) + sent requests

#### PROFILE
13. **Profile** (`app/(tabs)/profile.tsx`)
    - Profile card: large avatar, display name, username, bio, edit button
    - Stats ribbon: ROI | win rate | total boletins
    - Preferences: theme picker (3 options with live preview), notification toggles, default sites, currency
    - Account actions: change password, link/unlink Google, logout (destructive, red)

### Step 4 - Component Library
Redesign or create these shared components following the design system:
- `components/ui/Button.tsx` - variants: primary, secondary, ghost, danger; sizes sm/md/lg; loading state with spinner; Reanimated press scale
- `components/ui/Input.tsx` - animated floating label; with icon slot (left/right); error state with shake; character counter
- `components/ui/Card.tsx` - base surface card with shadow (platform-specific), optional press state
- `components/ui/Badge.tsx` / `StatusBadge.tsx` - color-coded status pills
- `components/ui/Skeleton.tsx` - shimmer animation blocks
- `components/ui/Toast.tsx` - top-of-screen slide-down toasts (success/error/info/warning)
- `components/ui/Avatar.tsx` - with initials fallback, optional online dot, size variants
- `components/ui/BottomSheet.tsx` - wrapper around `@gorhom/bottom-sheet`, dark scrim
- `components/odds/OddsCell.tsx` - tappable cell with flash animation (green/red on value change)
- `components/odds/OddsCard.tsx` - full event card with comparison table
- `components/odds/LiveBadge.tsx` - pulsing dot + `AO VIVO` text
- `components/boletins/BoletinCard.tsx` - summary card with swipe actions
- `components/boletins/OddsCalculator.tsx` - live stake/odds/return calculator
- `components/stats/WinRateRing.tsx` - Victory Native circular arc chart
- `components/stats/PnLChart.tsx` - area chart with positive (green) / negative (red) fills

### Step 5 - Pre-Delivery Checklist
Before delivering each screen/component, verify:
- [ ] No emojis used as icons - only MaterialCommunityIcons / Ionicons
- [ ] All colors use `useTheme()` tokens - never hardcoded hex in components
- [ ] All lists use FlashList with `estimatedItemSize`
- [ ] Every interactive element has press feedback (Reanimated or `activeOpacity`)
- [ ] Loading / empty / error states all handled
- [ ] Works in both light and dark mode
- [ ] Portuguese copy throughout (PT-PT)
- [ ] TypeScript strict - no `any`
- [ ] NativeWind classes for layout - only StyleSheet for platform-specific shadows/borders