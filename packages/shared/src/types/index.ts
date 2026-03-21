// ─── Enums ────────────────────────────────────────────────────────────────────
// These mirror the Prisma enums in apps/api/src/prisma/schema.prisma.
// Using TypeScript enums with string values so they work with z.nativeEnum()
// and remain compatible with Prisma's generated types.

export enum AuthProvider {
  EMAIL = 'EMAIL',
  GOOGLE = 'GOOGLE',
  HYBRID = 'HYBRID',
}

export enum Theme {
  LIGHT = 'LIGHT',
  DARK = 'DARK',
  SYSTEM = 'SYSTEM',
}

export enum Sport {
  FOOTBALL = 'FOOTBALL',
  BASKETBALL = 'BASKETBALL',
  TENNIS = 'TENNIS',
  HANDBALL = 'HANDBALL',
  VOLLEYBALL = 'VOLLEYBALL',
  HOCKEY = 'HOCKEY',
  RUGBY = 'RUGBY',
  AMERICAN_FOOTBALL = 'AMERICAN_FOOTBALL',
  BASEBALL = 'BASEBALL',
  OTHER = 'OTHER',
}

export enum EventStatus {
  UPCOMING = 'UPCOMING',
  LIVE = 'LIVE',
  FINISHED = 'FINISHED',
  CANCELLED = 'CANCELLED',
  POSTPONED = 'POSTPONED',
}

export enum BoletinStatus {
  PENDING = 'PENDING',
  WON = 'WON',
  LOST = 'LOST',
  VOID = 'VOID',
  PARTIAL = 'PARTIAL',
}

export enum ItemResult {
  PENDING = 'PENDING',
  WON = 'WON',
  LOST = 'LOST',
  VOID = 'VOID',
}

export enum RequestStatus {
  PENDING = 'PENDING',
  ACCEPTED = 'ACCEPTED',
  DECLINED = 'DECLINED',
}

export enum NotificationType {
  FRIEND_REQUEST = 'FRIEND_REQUEST',
  FRIEND_ACCEPTED = 'FRIEND_ACCEPTED',
  BOLETIN_SHARED = 'BOLETIN_SHARED',
  EVENT_RESULT = 'EVENT_RESULT',
  ODDS_CHANGE = 'ODDS_CHANGE',
  SYSTEM = 'SYSTEM',
}

// ─── Models ───────────────────────────────────────────────────────────────────
// All DateTime fields are typed as string (ISO 8601) — this is how they arrive
// over JSON from the API. Decimal fields are typed as string to preserve
// precision and avoid IEEE 754 floating-point issues.

export interface User {
  id: string;
  email: string;
  username: string;
  /** null for Google-only accounts */
  passwordHash: string | null;
  /** Firebase UID from Google Sign-In */
  googleId: string | null;
  authProvider: AuthProvider;
  isEmailVerified: boolean;
  emailVerifyToken: string | null;
  emailVerifyExpiry: string | null;
  passwordResetToken: string | null;
  passwordResetExpiry: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  bio: string | null;
  expoPushToken: string | null;
  /** Betting site slugs preferred by this user */
  preferredSites: string[];
  theme: Theme;
  /** ISO 4217 currency code, e.g. "EUR" */
  currency: string;
  lastLoginAt: string | null;
  failedLoginAttempts: number;
  /** Brute-force lockout expiry */
  lockedUntil: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Safe subset of User for API responses.
 * Omits all sensitive credential and security fields.
 */
export type PublicUser = Omit<
  User,
  | 'passwordHash'
  | 'emailVerifyToken'
  | 'emailVerifyExpiry'
  | 'passwordResetToken'
  | 'passwordResetExpiry'
  | 'expoPushToken'
  | 'failedLoginAttempts'
  | 'lockedUntil'
>;

export interface RefreshToken {
  id: string;
  token: string;
  userId: string;
  expiresAt: string;
  createdAt: string;
}

export interface BettingSite {
  id: string;
  /** URL-friendly identifier, e.g. "betclic", "bet365" */
  slug: string;
  name: string;
  logoUrl: string | null;
  baseUrl: string;
  isActive: boolean;
  lastScraped: string | null;
  createdAt: string;
}

export interface SportEvent {
  id: string;
  /** ID assigned by the betting site */
  externalId: string | null;
  sport: Sport;
  league: string;
  homeTeam: string;
  awayTeam: string;
  eventDate: string;
  status: EventStatus;
  homeScore: number | null;
  awayScore: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface Odd {
  id: string;
  siteId: string;
  eventId: string;
  /** e.g. "1X2", "Over/Under 2.5", "BTTS" */
  market: string;
  /** e.g. "1", "X", "2", "Over", "Under" */
  selection: string;
  /** Serialised as string to preserve decimal precision */
  value: string;
  isActive: boolean;
  scrapedAt: string;
  updatedAt: string;
}

export interface Boletin {
  id: string;
  userId: string;
  name: string | null;
  /** Decimal serialised as string */
  stake: string;
  /** Decimal serialised as string */
  totalOdds: string;
  /** Decimal serialised as string */
  potentialReturn: string;
  status: BoletinStatus;
  /** Decimal serialised as string; null while PENDING */
  actualReturn: string | null;
  notes: string | null;
  isPublic: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface BoletinItem {
  id: string;
  boletinId: string;
  eventId: string;
  siteId: string;
  market: string;
  selection: string;
  /** Decimal serialised as string */
  oddValue: string;
  result: ItemResult;
}

export interface Friendship {
  id: string;
  userId: string;
  friendId: string;
  createdAt: string;
}

export interface FriendRequest {
  id: string;
  senderId: string;
  receiverId: string;
  status: RequestStatus;
  createdAt: string;
  updatedAt: string;
}

export interface SharedBoletin {
  id: string;
  boletinId: string;
  sharedById: string;
  sharedWithId: string;
  message: string | null;
  createdAt: string;
}

export interface CompactUser {
  id: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
}

export interface SocialUser extends CompactUser {
  bio: string | null;
  lastLoginAt: string | null;
}

export interface CompactBettingSite {
  id: string;
  slug: string;
  name: string;
  logoUrl: string | null;
}

export interface CompactSportEvent {
  id: string;
  league: string;
  homeTeam: string;
  awayTeam: string;
  eventDate: string;
  status: EventStatus;
  homeScore: number | null;
  awayScore: number | null;
}

export interface BoletinItemDetail extends BoletinItem {
  event: CompactSportEvent;
  site: CompactBettingSite;
}

export interface BoletinShareDetail extends SharedBoletin {
  sharedBy: CompactUser;
  sharedWith: CompactUser;
}

export interface BoletinDetail extends Boletin {
  user: CompactUser;
  items: BoletinItemDetail[];
  shares: BoletinShareDetail[];
}

export interface Notification {
  id: string;
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  data: Record<string, unknown> | null;
  isRead: boolean;
  createdAt: string;
}

export interface UsernameAvailability {
  available: boolean;
}

export interface UserSearchResult extends SocialUser {
  isFriend: boolean;
  hasPendingRequest: boolean;
  pendingRequestDirection: 'sent' | 'received' | null;
}

export interface FriendshipDetail extends Friendship {
  friend: SocialUser;
}

export interface FriendRequestDetail extends FriendRequest {
  sender: SocialUser;
  receiver: SocialUser;
}

export interface FriendRequestsOverview {
  received: FriendRequestDetail[];
  sent: FriendRequestDetail[];
}

export interface PublicBoletinPreview {
  id: string;
  name: string | null;
  status: BoletinStatus;
  createdAt: string;
  stake: string;
  totalOdds: string;
  potentialReturn: string;
  actualReturn: string | null;
  isPublic: boolean;
  itemCount: number;
}

export interface PublicProfileStats {
  publicBoletins: number;
  settledBoletins: number;
  winRate: number;
  roi: number;
  totalStaked: number;
  totalReturned: number;
  profitLoss: number;
}

export interface PublicProfile {
  user: SocialUser & {
    createdAt: string;
  };
  stats: PublicProfileStats;
  publicBoletins: PublicBoletinPreview[];
}

export type FriendActivityType = 'PUBLIC_BOLETIN';

export interface FriendFeedItem {
  id: string;
  type: FriendActivityType;
  createdAt: string;
  user: SocialUser;
  message: string;
  boletin: PublicBoletinPreview;
  previewEvents: string[];
}

export interface NotificationsPageMeta extends PaginationMeta {
  unreadCount: number;
}

// ─── Scraper types ────────────────────────────────────────────────────────────

export interface ScrapedSelection {
  selection: string;
  value: number;
}

export interface ScrapedMarket {
  /** e.g. "1X2", "Over/Under 2.5" */
  market: string;
  selections: ScrapedSelection[];
}

export interface ScrapedEvent {
  externalId: string;
  sport: Sport;
  league: string;
  homeTeam: string;
  awayTeam: string;
  eventDate: Date;
  markets: ScrapedMarket[];
}

// ─── API response wrapper ─────────────────────────────────────────────────────

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  /** Cursor for cursor-based pagination */
  cursor?: string;
}

/**
 * Standard envelope for all API responses.
 * Every endpoint returns this shape.
 */
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  meta?: {
    pagination?: PaginationMeta;
  };
}

// ─── Auth response shapes ─────────────────────────────────────────────────────

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface LoginResponse extends AuthTokens {
  user: PublicUser;
}

export interface GoogleAuthResponse {
  isNewUser: boolean;
  /** Present only when isNewUser=false — full session tokens. */
  accessToken?: string;
  /** Present only when isNewUser=false. */
  refreshToken?: string;
  /** Present only when isNewUser=false. */
  user?: PublicUser;
  /**
   * Present only when isNewUser=true.
   * Short-lived (10 min), scoped to google-onboarding.
   * Must be passed to POST /api/auth/google/complete-registration.
   */
  tempToken?: string;
}

// ─── Socket.io event payloads ─────────────────────────────────────────────────

export interface OddsUpdatedPayload {
  eventId: string;
  siteId: string;
  market: string;
  selection: string;
  oldValue: string;
  newValue: string;
}

export interface EventStatusChangePayload {
  eventId: string;
  status: EventStatus;
  homeScore: number | null;
  awayScore: number | null;
}

export interface BoletinResultPayload {
  boletinId: string;
  status: BoletinStatus;
  actualReturn: string | null;
}

export interface FriendActivityPayload {
  userId: string;
  type: NotificationType;
  data: Record<string, unknown>;
}

// ─── Statistics payloads ─────────────────────────────────────────────────────

export type StatsPeriod = 'week' | 'month' | 'year' | 'all';

export interface StatsSummary {
  period: StatsPeriod;
  totalBoletins: number;
  settledBoletins: number;
  pendingBoletins: number;
  wonBoletins: number;
  lostBoletins: number;
  voidBoletins: number;
  partialBoletins: number;
  totalStaked: number;
  settledStake: number;
  totalReturned: number;
  profitLoss: number;
  roi: number;
  winRate: number;
  averageOdds: number;
  averageStake: number;
  averageReturn: number;
}

export interface StatsBreakdownRow {
  key: string;
  label: string;
  totalBets: number;
  won: number;
  lost: number;
  void: number;
  pending: number;
  settledStake: number;
  totalStaked: number;
  totalReturned: number;
  profitLoss: number;
  roi: number;
  winRate: number;
}

export interface StatsBySportRow extends StatsBreakdownRow {
  sport: Sport;
}

export interface StatsBySiteRow extends StatsBreakdownRow {
  siteId: string;
  slug: string;
  logoUrl: string | null;
}

export interface StatsByMarketRow extends StatsBreakdownRow {
  market: string;
}

export interface StatsByOddsRangeRow extends StatsBreakdownRow {
  minOdds: number | null;
  maxOdds: number | null;
}

export interface StatsTimelinePoint {
  key: string;
  label: string;
  bucketStart: string;
  bucketEnd: string;
  totalStaked: number;
  totalReturned: number;
  profitLoss: number;
  roi: number;
  settledBoletins: number;
  pendingBoletins: number;
}

export interface StatsTopBoletin {
  id: string;
  name: string | null;
  status: BoletinStatus;
  createdAt: string;
  stake: number;
  totalOdds: number;
  potentialReturn: number;
  actualReturn: number | null;
  profitLoss: number;
  items: Array<{
    id: string;
    homeTeam: string;
    awayTeam: string;
    market: string;
    selection: string;
  }>;
}

export interface PersonalStats {
  summary: StatsSummary;
  bySport: StatsBySportRow[];
  bySite: StatsBySiteRow[];
  byMarket: StatsByMarketRow[];
  byOddsRange: StatsByOddsRangeRow[];
  timeline: StatsTimelinePoint[];
  bestBoletins: StatsTopBoletin[];
  worstBoletins: StatsTopBoletin[];
}
