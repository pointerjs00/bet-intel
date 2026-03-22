# Design System Master File — BetIntel

> **LOGIC:** When building a specific page, first check `design-system/betintel/pages/[page-name].md`.
> If that file exists, its rules **override** this Master file.
> If not, strictly follow the rules below.

---

**Project:** BetIntel
**Platform:** React Native (Expo) — iOS + Android
**Style:** Dark Mode OLED Primary / Light Mode Secondary
**Category:** Sports Betting / Fintech

---

## Global Rules

### Color Palette (from `apps/mobile/theme/tokens.ts` — source of truth)

#### Dark Mode
| Role | Hex | Token Key |
|------|-----|-----------|
| Background | `#0D0D0D` | `colors.dark.background` |
| Surface | `#1A1A1A` | `colors.dark.surface` |
| Surface Raised | `#242424` | `colors.dark.surfaceRaised` |
| Border | `#2E2E2E` | `colors.dark.border` |
| Primary (Win/CTA) | `#00C851` | `colors.dark.primary` |
| Primary Dark | `#009A3E` | `colors.dark.primaryDark` |
| Danger (Loss) | `#FF3B30` | `colors.dark.danger` |
| Warning (Pending) | `#FF9500` | `colors.dark.warning` |
| Info | `#007AFF` | `colors.dark.info` |
| Text Primary | `#FFFFFF` | `colors.dark.textPrimary` |
| Text Secondary | `#A0A0A0` | `colors.dark.textSecondary` |
| Text Muted | `#505050` | `colors.dark.textMuted` |
| Gold (Best Odds) | `#FFD700` | `colors.dark.gold` |
| Live | `#FF3B30` | `colors.dark.live` |

#### Light Mode
| Role | Hex | Token Key |
|------|-----|-----------|
| Background | `#F2F2F7` | `colors.light.background` |
| Surface | `#FFFFFF` | `colors.light.surface` |
| Surface Raised | `#F8F8F8` | `colors.light.surfaceRaised` |
| Border | `#E5E5EA` | `colors.light.border` |
| Primary | `#00A843` | `colors.light.primary` |
| Text Primary | `#000000` | `colors.light.textPrimary` |
| Text Secondary | `#6C6C70` | `colors.light.textSecondary` |
| Text Muted | `#AEAEB2` | `colors.light.textMuted` |

**Rule: Never hardcode hex in components — always use `useTheme()` hook.**

### Typography

- **Heading Font:** Outfit (Google Fonts — bold, modern, startup feel)
- **Body Font:** Rubik (Google Fonts — clean, highly legible at small sizes)
- **Alternate heading option:** Bebas Neue (for large hero numbers like ROI %, odds values)
- **Mono/Data font:** IBM Plex Mono (for odds values, stake amounts — financial trust)
- **Mood:** bold, sporty, data-driven, modern, confident

### Font Scale (from tokens.ts)
| Token | Size | Usage |
|-------|------|-------|
| `xs` | 11px | Labels, captions |
| `sm` | 13px | Secondary text, timestamps |
| `md` | 15px | Body text |
| `lg` | 17px | Section headers |
| `xl` | 20px | Card titles |
| `xxl` | 24px | Screen titles |
| `display` | 32px | Hero metrics (ROI, totals) |

### Spacing (from tokens.ts)
| Token | Value | Usage |
|-------|-------|-------|
| `xs` | 4px | Tight gaps, inline spacing |
| `sm` | 8px | Icon gaps, chip padding |
| `md` | 12px | Card inner padding |
| `lg` | 16px | Standard section padding |
| `xl` | 24px | Section gaps |
| `xxl` | 32px | Screen padding, large gaps |

### Border Radius (from tokens.ts)
| Token | Value | Usage |
|-------|-------|-------|
| `sm` | 6px | Chips, small badges |
| `md` | 10px | Inputs, buttons |
| `lg` | 14px | Cards |
| `xl` | 20px | Bottom sheets, modals |
| `full` | 9999px | Avatars, circular elements |

### Shadow Depths (Platform-specific — use StyleSheet only)
| Level | Usage |
|-------|-------|
| Subtle | Cards at rest |
| Medium | Active/pressed cards, buttons |
| Large | Bottom sheets, modals, floating tab bar |

**Rule: Use `Platform.select()` for iOS shadowX / Android elevation.**

---

## Component Specs (React Native)

### Buttons
```tsx
// variants: primary | secondary | ghost | danger
// sizes: sm (h=36) | md (h=44) | lg (h=52)
// Press animation: Reanimated withSpring scale(0.97)
// Loading: ActivityIndicator replacing text, disabled state
// Border radius: tokens.radius.md (10px)
// Primary: bg=colors.primary, text=white
// Secondary: bg=transparent, border=colors.border, text=colors.textPrimary
// Ghost: bg=transparent, text=colors.primary
// Danger: bg=colors.danger, text=white
```

### Cards
```tsx
// Base card: bg=colors.surface, borderRadius=tokens.radius.lg (14px)
// Border: 1px colors.border (light mode) / none (dark mode)
// Platform shadow via StyleSheet
// Press state: Reanimated opacity(0.85) for tappable cards
// Padding: tokens.spacing.lg (16px)
```

### Inputs
```tsx
// Animated floating label: Reanimated translateY + fontSize interpolation
// Focus: border turns colors.primary, label floats up
// Error: border turns colors.danger, shake animation (translateX spring)
// Icon slot: left or right, 20x20, colors.textSecondary
// Password toggle: eye/eye-off icon right slot
// Height: 52px, borderRadius: tokens.radius.md
// Character counter: bottom-right, colors.textMuted
```

### Bottom Sheets (@gorhom/bottom-sheet wrapper)
```tsx
// Scrim: bg=rgba(0,0,0,0.6), animates opacity
// Handle: 40x4px, colors.border, centered
// Content bg: colors.surface
// Border radius top: tokens.radius.xl (20px)
// Snap points defined per use case
```

---

## Style Guidelines

**Style:** Dark Mode (OLED Primary) with Full Light Mode Support

**Keywords:** Dark theme, OLED black, high contrast, betting green, sporty, data-dense, premium fintech

**Best For:** Sports betting apps, fintech dashboards, real-time data, OLED devices

**Key Effects:**
- Subtle glow on gold-highlighted best odds values
- Pulsing red dot for live events (Reanimated looping opacity 0.4→1.0)
- Green/red flash on odds value changes (0.3s fade)
- Press scale animations on tappable cards (withSpring, damping: 15)
- Layout animations for list item insertion/removal (LayoutAnimation or Reanimated FadingTransition)
- Shimmer skeleton loading (linear gradient animation)

### Navigation Pattern

**Tab Bar:** Floating pill-style bottom tab bar
- Position: absolute, bottom: 16, left: 16, right: 16
- Background: colors.surface with blur (iOS) / opaque (Android)
- Border radius: tokens.radius.xl (20px)
- Shadow: large elevation
- Active tab: primary green icon + label; inactive: textMuted icon only
- Active indicator: animated pill that morphs between positions (Reanimated)

### Screen Layout Pattern
- All screens: SafeAreaView with bg=colors.background
- Pull-to-refresh on all data screens (RefreshControl with colors.primary tint)
- Header: transparent/gradient overlays preferred over solid bars
- Content: ScrollView or FlashList with paddingHorizontal=tokens.spacing.lg
- FAB placement: bottom-right, 16px from edges, above tab bar

---

## Anti-Patterns (Do NOT Use)

- ❌ **Emojis as icons** — Use MaterialCommunityIcons / Ionicons from `@expo/vector-icons`
- ❌ **Hardcoded hex values** — Always go through `useTheme()` → `colors.xxx`
- ❌ **FlatList for long lists** — Use FlashList with `estimatedItemSize`
- ❌ **Inline `style={{ color: '#xxx' }}`** — Use theme tokens or NativeWind classes
- ❌ **Missing press feedback** — All tappable elements need `activeOpacity` or Reanimated gesture
- ❌ **Spinners for initial load** — Use Skeleton shimmer screens
- ❌ **Blank empty states** — Always show illustrated EmptyState component
- ❌ **English copy** — All user-facing text must be Portuguese (PT-PT)
- ❌ **Light backgrounds in dark mode** — Respect `colors.background` / `colors.surface`
- ❌ **Magic numbers** — Always reference `tokens.spacing.xx`, `tokens.radius.xx`, `tokens.font.sizes.xx`
- ❌ **`any` type** — TypeScript strict mode, no exceptions
- ❌ **ScrollView with .map()** — Use FlashList or SectionList for data lists
- ❌ **Animated API** — Use Reanimated 3 for all animations

---

## Pre-Delivery Checklist

Before delivering any screen or component, verify:

- [ ] No emojis used as icons (MaterialCommunityIcons / Ionicons only)
- [ ] All colors via `useTheme()` hook — zero hardcoded hex in JSX
- [ ] All lists use FlashList with `estimatedItemSize`
- [ ] Every tappable element has press feedback (Reanimated or activeOpacity)
- [ ] Loading state: Skeleton shimmer (not spinner)
- [ ] Empty state: EmptyState component with illustration
- [ ] Error state: Toast notification
- [ ] Works in both light AND dark mode (tested)
- [ ] Portuguese (PT-PT) copy throughout
- [ ] Dates: DD/MM/YYYY, 24h format
- [ ] Currency: €1.234,56 format
- [ ] TypeScript strict — no `any`, all props typed
- [ ] NativeWind classes + StyleSheet only for platform shadows
- [ ] Shadows use Platform.select() for iOS/Android
- [ ] Animations use Reanimated 3 (not Animated API)
- [ ] `prefers-reduced-motion` / `accessibilityReduceMotion` respected
- [ ] Light mode: text contrast 4.5:1 minimum
- [ ] Focus states visible for keyboard navigation
- [ ] `prefers-reduced-motion` respected
- [ ] Responsive: 375px, 768px, 1024px, 1440px
- [ ] No content hidden behind fixed navbars
- [ ] No horizontal scroll on mobile
