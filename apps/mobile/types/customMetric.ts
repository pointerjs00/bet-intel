import type { Ionicons } from '@expo/vector-icons';

// ── Data source definitions ─────────────────────────────────────────────────

/** Summary fields the user can pick for a single-value metric. */
export type SummaryField =
  | 'roi'
  | 'winRate'
  | 'totalStaked'
  | 'profitLoss'
  | 'totalBoletins'
  | 'settledBoletins'
  | 'wonBoletins'
  | 'lostBoletins'
  | 'averageOdds'
  | 'averageWonOdds'
  | 'averageLostOdds'
  | 'averageStake'
  | 'averageReturn'
  | 'averageWonStake'
  | 'averageLostStake'
  | 'oddsEfficiency'
  | 'homeROI'
  | 'homeWinRate'
  | 'homeBets'
  | 'awayROI'
  | 'awayWinRate'
  | 'awayBets'
  | 'favouriteROI'
  | 'favouriteWinRate'
  | 'favouriteBets'
  | 'underdogROI'
  | 'underdogWinRate'
  | 'underdogBets'
  | 'variance'
  | 'stdDev';

/** Breakdown keys from PersonalStats that produce StatsBreakdownRow[]. */
export type BreakdownSource =
  | 'bySport'
  | 'byTeam'
  | 'byCompetition'
  | 'byMarket'
  | 'byOddsRange'
  | 'byWeekday'
  | 'byLegCount'
  | 'byStakeBracket'
  | 'bySite'
  | 'byHour';

/** Metric to extract from a breakdown row. */
export type BreakdownMetric = 'roi' | 'winRate' | 'totalBets' | 'profitLoss';

/** Timeline metric to chart. */
export type TimelineMetric = 'profitLoss' | 'totalStaked' | 'roi' | 'settledBoletins';

// ── Data source union ───────────────────────────────────────────────────────

export type CustomMetricDataSource =
  | { type: 'summary'; field: SummaryField }
  | { type: 'breakdown'; source: BreakdownSource; metric: BreakdownMetric; topN: number }
  | { type: 'timeline'; metric: TimelineMetric; cumulative: boolean };

// ── Visualization types ─────────────────────────────────────────────────────

export type VisualizationType =
  | 'number'
  | 'bar-chart'
  | 'line-chart'
  | 'progress-ring';

// ── Format type ─────────────────────────────────────────────────────────────

export type MetricFormat = 'currency' | 'percentage' | 'number' | 'odds';

// ── Custom metric definition ────────────────────────────────────────────────

export interface CustomMetricDef {
  id: string;
  name: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  dataSource: CustomMetricDataSource;
  visualization: VisualizationType;
  format: MetricFormat;
  createdAt: number;
  updatedAt: number;
}

// ── Catalog entries for the editor UI ───────────────────────────────────────

export interface SummaryFieldOption {
  field: SummaryField;
  label: string;
  defaultFormat: MetricFormat;
  icon: keyof typeof Ionicons.glyphMap;
}

export interface BreakdownOption {
  source: BreakdownSource;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
}

export const SUMMARY_FIELD_OPTIONS: SummaryFieldOption[] = [
  { field: 'roi', label: 'ROI', defaultFormat: 'percentage', icon: 'trending-up-outline' },
  { field: 'winRate', label: 'Taxa de vitória', defaultFormat: 'percentage', icon: 'trophy-outline' },
  { field: 'totalStaked', label: 'Total apostado', defaultFormat: 'currency', icon: 'cash-outline' },
  { field: 'profitLoss', label: 'Lucro / Prejuízo', defaultFormat: 'currency', icon: 'wallet-outline' },
  { field: 'totalBoletins', label: 'Total boletins', defaultFormat: 'number', icon: 'layers-outline' },
  { field: 'settledBoletins', label: 'Boletins decididos', defaultFormat: 'number', icon: 'checkmark-done-outline' },
  { field: 'wonBoletins', label: 'Boletins ganhos', defaultFormat: 'number', icon: 'checkmark-circle-outline' },
  { field: 'lostBoletins', label: 'Boletins perdidos', defaultFormat: 'number', icon: 'close-circle-outline' },
  { field: 'averageOdds', label: 'Odd média', defaultFormat: 'odds', icon: 'swap-vertical-outline' },
  { field: 'averageWonOdds', label: 'Odd média (ganhas)', defaultFormat: 'odds', icon: 'arrow-up-outline' },
  { field: 'averageLostOdds', label: 'Odd média (perdidas)', defaultFormat: 'odds', icon: 'arrow-down-outline' },
  { field: 'averageStake', label: 'Stake média', defaultFormat: 'currency', icon: 'analytics-outline' },
  { field: 'averageReturn', label: 'Retorno médio', defaultFormat: 'currency', icon: 'return-down-back-outline' },
  { field: 'averageWonStake', label: 'Stake média (ganhas)', defaultFormat: 'currency', icon: 'arrow-up-circle-outline' },
  { field: 'averageLostStake', label: 'Stake média (perdidas)', defaultFormat: 'currency', icon: 'arrow-down-circle-outline' },
  { field: 'oddsEfficiency', label: 'Eficiência de odds', defaultFormat: 'percentage', icon: 'speedometer-outline' },
  { field: 'homeROI', label: 'ROI Casa', defaultFormat: 'percentage', icon: 'home-outline' },
  { field: 'homeWinRate', label: 'Win % Casa', defaultFormat: 'percentage', icon: 'home-outline' },
  { field: 'homeBets', label: 'Apostas Casa', defaultFormat: 'number', icon: 'home-outline' },
  { field: 'awayROI', label: 'ROI Fora', defaultFormat: 'percentage', icon: 'airplane-outline' },
  { field: 'awayWinRate', label: 'Win % Fora', defaultFormat: 'percentage', icon: 'airplane-outline' },
  { field: 'awayBets', label: 'Apostas Fora', defaultFormat: 'number', icon: 'airplane-outline' },
  { field: 'favouriteROI', label: 'ROI Favoritos', defaultFormat: 'percentage', icon: 'podium-outline' },
  { field: 'favouriteWinRate', label: 'Win % Favoritos', defaultFormat: 'percentage', icon: 'podium-outline' },
  { field: 'favouriteBets', label: 'Apostas Favoritos', defaultFormat: 'number', icon: 'podium-outline' },
  { field: 'underdogROI', label: 'ROI Underdogs', defaultFormat: 'percentage', icon: 'flash-outline' },
  { field: 'underdogWinRate', label: 'Win % Underdogs', defaultFormat: 'percentage', icon: 'flash-outline' },
  { field: 'underdogBets', label: 'Apostas Underdogs', defaultFormat: 'number', icon: 'flash-outline' },
  { field: 'variance', label: 'Variância', defaultFormat: 'currency', icon: 'pulse-outline' },
  { field: 'stdDev', label: 'Desvio padrão', defaultFormat: 'currency', icon: 'pulse-outline' },
];

export const BREAKDOWN_OPTIONS: BreakdownOption[] = [
  { source: 'bySport', label: 'Por desporto', icon: 'football-outline' },
  { source: 'byTeam', label: 'Por equipa', icon: 'people-outline' },
  { source: 'byCompetition', label: 'Por competição', icon: 'ribbon-outline' },
  { source: 'byMarket', label: 'Por mercado', icon: 'grid-outline' },
  { source: 'byOddsRange', label: 'Por intervalo de odds', icon: 'options-outline' },
  { source: 'byWeekday', label: 'Por dia da semana', icon: 'calendar-outline' },
  { source: 'byLegCount', label: 'Por nº seleções', icon: 'layers-outline' },
  { source: 'byStakeBracket', label: 'Por faixa de stake', icon: 'cash-outline' },
  { source: 'bySite', label: 'Por casa de apostas', icon: 'business-outline' },
  { source: 'byHour', label: 'Por hora do dia', icon: 'time-outline' },
];

export const TIMELINE_METRIC_OPTIONS: Array<{
  metric: TimelineMetric;
  label: string;
  defaultFormat: MetricFormat;
  icon: keyof typeof Ionicons.glyphMap;
}> = [
  { metric: 'profitLoss', label: 'Lucro / Prejuízo', defaultFormat: 'currency', icon: 'wallet-outline' },
  { metric: 'totalStaked', label: 'Total apostado', defaultFormat: 'currency', icon: 'cash-outline' },
  { metric: 'roi', label: 'ROI', defaultFormat: 'percentage', icon: 'trending-up-outline' },
  { metric: 'settledBoletins', label: 'Boletins decididos', defaultFormat: 'number', icon: 'layers-outline' },
];

export const METRIC_COLOR_OPTIONS = [
  '#00C851', // green
  '#007AFF', // blue
  '#FF9500', // orange
  '#FF3B30', // red
  '#AF52DE', // purple
  '#5856D6', // indigo
  '#FFD700', // gold
  '#30B0C7', // teal
  '#FF2D55', // pink
  '#8E8E93', // gray
];

export const METRIC_ICON_OPTIONS: Array<keyof typeof Ionicons.glyphMap> = [
  'analytics-outline',
  'bar-chart-outline',
  'trending-up-outline',
  'trophy-outline',
  'cash-outline',
  'wallet-outline',
  'flame-outline',
  'flash-outline',
  'football-outline',
  'pulse-outline',
  'podium-outline',
  'speedometer-outline',
  'star-outline',
  'ribbon-outline',
  'rocket-outline',
  'diamond-outline',
];
