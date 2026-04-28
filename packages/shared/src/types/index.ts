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



export enum BoletinStatus {
  PENDING = 'PENDING',
  WON = 'WON',
  LOST = 'LOST',
  VOID = 'VOID',
  PARTIAL = 'PARTIAL',
  CASHOUT = 'CASHOUT',
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
  BOLETIN_RESULT = 'BOLETIN_RESULT',
  SYSTEM = 'SYSTEM',
}

export enum GoalType {
  ROI = 'ROI',
  WIN_RATE = 'WIN_RATE',
  BET_COUNT = 'BET_COUNT',
  PROFIT = 'PROFIT',
}

export interface BettingGoal {
  type: GoalType;
  /** Target value: ROI/WIN_RATE in %, BET_COUNT as integer, PROFIT in € */
  target: number;
  enabled: boolean;
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

  theme: Theme;
  /** ISO 4217 currency code, e.g. "EUR" */
  currency: string;
  defaultBoletinsPublic: boolean;
  goals: BettingGoal[];
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

// ─── Reference Data ───────────────────────────────────────────────────────────

export interface Competition {
  id: string;
  name: string;
  country: string;
  sport: Sport;
  tier: number;
  points?: number | null;
  logoUrl?: string | null;
  countryPrestige?: number | null;
  countryPoints?: number | null;
  countryOrder?: number | null;
}

export interface Team {
  id: string;
  name: string;
  sport: Sport;
  country: string | null;
  imageUrl?: string | null;
  displayName?: string | null;
  rank?: number | null;
}

export interface Market {
  id: string;
  name: string;
  category: string | null;
  sport: Sport | null;
}

export interface Boletin {
  id: string;
  userId: string;
  name: string | null;
  /** Slug of the betting site used, e.g. "betclic" */
  siteSlug: string | null;
  /** Decimal serialised as string */
  stake: string;
  /** Decimal serialised as string */
  totalOdds: string;
  /** Decimal serialised as string */
  potentialReturn: string;
  status: BoletinStatus;
  /** Decimal serialised as string; null while PENDING */
  actualReturn: string | null;
  /** Decimal serialised as string; set when status is CASHOUT */
  cashoutAmount: string | null;
  notes: string | null;
  isPublic: boolean;
  /** When true the stake was a bookmaker freebet — not real money out of pocket. */
  isFreebet: boolean;
  /** ISO-8601 string — when the bet was actually placed (may differ from createdAt) */
  betDate: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface BoletinItem {
  id: string;
  boletinId: string;
  homeTeam: string;
  awayTeam: string;
  competition: string;
  sport: Sport;
  market: string;
  selection: string;
  /** Decimal serialised as string */
  oddValue: string;
  result: ItemResult;
  /** ISO-8601 datetime of the match kick-off (null if unknown) */
  kickoffAt: string | null;
}

export interface AgendaItem {
  kickoffAt: string;
  boletinId: string;
  boletinName: string | null;
  itemId: string;
  homeTeam: string;
  awayTeam: string;
  competition: string;
  sport: Sport;
  market: string;
  selection: string;
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

export interface BoletinItemDetail extends BoletinItem {}

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

export type FriendActivityType = 'PUBLIC_BOLETIN' | 'SHARED_BOLETIN';

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

export interface StatsStreaks {
  currentType: 'WON' | 'LOST' | null;
  currentCount: number;
  longestWin: number;
  longestLoss: number;
}

export interface StatsFreebetSummary {
  totalFreebets: number;
  wonFreebets: number;
  lostFreebets: number;
  totalReturned: number;
  profitLoss: number;
}

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
  averageWonOdds: number;
  averageLostOdds: number;
  averageStake: number;
  averageReturn: number;
  averageWonStake: number;
  averageLostStake: number;
  /** Odds efficiency: (actual_return / implied_return) * 100. >100 = outperforming. */
  oddsEfficiency: number;
  streaks: StatsStreaks;
  freebetSummary: StatsFreebetSummary;
  /** Standard deviation of P&L per boletin */
  variance: number;
  /** Standard deviation value (sqrt of variance) */
  stdDev: number;
  /** ROI when betting on home teams (1X2 selection "1") */
  homeROI: number;
  /** Win rate when betting on home teams */
  homeWinRate: number;
  /** Number of home team bets */
  homeBets: number;
  /** ROI when betting on away teams (1X2 selection "2") */
  awayROI: number;
  /** Win rate when betting on away teams */
  awayWinRate: number;
  /** Number of away team bets */
  awayBets: number;
  /** ROI on favourite picks (odds < 2.00) */
  favouriteROI: number;
  /** Win rate on favourite picks */
  favouriteWinRate: number;
  /** Number of favourite bets */
  favouriteBets: number;
  /** ROI on underdog picks (odds >= 2.00) */
  underdogROI: number;
  /** Win rate on underdog picks */
  underdogWinRate: number;
  /** Number of underdog bets */
  underdogBets: number;
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

export interface StatsByTeamRow extends StatsBreakdownRow {
  team: string;
}

export interface StatsByCompetitionRow extends StatsBreakdownRow {
  competition: string;
}

export interface StatsByMarketRow extends StatsBreakdownRow {
  market: string;
}

export interface StatsByOddsRangeRow extends StatsBreakdownRow {
  minOdds: number | null;
  maxOdds: number | null;
}

export interface StatsByWeekdayRow extends StatsBreakdownRow {
  /** 0 = Sunday, 1 = Monday, …, 6 = Saturday */
  weekday: number;
}

export interface StatsByLegCountRow extends StatsBreakdownRow {
  legCount: number;
}

export interface StatsByStakeBracketRow extends StatsBreakdownRow {
  minStake: number;
  maxStake: number | null;
}

export interface StatsBySportMarketCell {
  sport: string;
  market: string;
  totalBets: number;
  won: number;
  lost: number;
  roi: number;
  winRate: number;
}

export interface SiteMonthlyROI {
  month: string;
  roi: number;
}

export interface StatsBySiteRow extends StatsBreakdownRow {
  siteSlug: string;
  averageOdds: number;
  monthlySeries: SiteMonthlyROI[];
}

export interface StatsByHourRow extends StatsBreakdownRow {
  /** Hour 0-23 */
  hour: number;
}

export interface StatsLegKillRow {
  /** 1-indexed leg position */
  legPosition: number;
  label: string;
  /** Times this leg position was the one that killed the parlay */
  killCount: number;
  /** Percentage of total lost parlays this leg position killed */
  killRate: number;
}

export interface StatsCalibrationPoint {
  /** Label for this implied probability bucket, e.g. "60-70%" */
  label: string;
  /** Centre of the implied probability bucket (0-1) */
  impliedProbability: number;
  /** User's actual win rate for bets in this bucket (0-1) */
  actualWinRate: number;
  /** Number of bets in this bucket */
  sampleSize: number;
}

export interface StatsROITrendPoint {
  /** Index of the bet (0-based) */
  betIndex: number;
  /** Rolling-window ROI % at this point */
  roi: number;
}

export interface StatsInsight {
  id: string;
  /** Icon name (Ionicons) */
  icon: string;
  /** Colour hint: 'positive' | 'negative' | 'neutral' */
  sentiment: 'positive' | 'negative' | 'neutral';
  /** Portuguese text */
  title: string;
  /** Portuguese text — longer explanation */
  body: string;
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

export interface AiReview {
  strongPoints: string[];
  weakPoints: string[];
  patterns: string[];
  recommendation: string;
  /** ISO timestamp of when this review was generated */
  cachedAt: string;
}

export interface PersonalStats {
  summary: StatsSummary;
  bySport: StatsBySportRow[];
  byTeam: StatsByTeamRow[];
  byCompetition: StatsByCompetitionRow[];
  byMarket: StatsByMarketRow[];
  byOddsRange: StatsByOddsRangeRow[];
  byWeekday: StatsByWeekdayRow[];
  byLegCount: StatsByLegCountRow[];
  byStakeBracket: StatsByStakeBracketRow[];
  bySportMarket: StatsBySportMarketCell[];
  bySite: StatsBySiteRow[];
  byHour: StatsByHourRow[];
  legKillDistribution: StatsLegKillRow[];
  calibration: StatsCalibrationPoint[];
  roiTrend: StatsROITrendPoint[];
  insights: StatsInsight[];
  timeline: StatsTimelinePoint[];
  bestBoletins: StatsTopBoletin[];
  worstBoletins: StatsTopBoletin[];
}

// ─── Favourites ───────────────────────────────────────────────────────────────

export enum FavouriteType {
  COMPETITION = 'COMPETITION',
  COUNTRY = 'COUNTRY',
  TEAM = 'TEAM',
}

export interface UserFavourite {
  id: string;
  userId: string;
  type: FavouriteType;
  sport: Sport;
  targetKey: string;
  createdAt: string;
}
