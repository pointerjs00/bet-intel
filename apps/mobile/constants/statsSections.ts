export interface StatsSectionDef {
  id: string;
  label: string;
  icon: string; // Ionicons name
}

/** Ordered list of all stat sections. Default order is presentation order. */
export const STATS_SECTIONS: StatsSectionDef[] = [
  { id: 'goals', label: 'Objetivos mensais', icon: 'flag-outline' },
  { id: 'roi', label: 'ROI do período', icon: 'trending-up-outline' },
  { id: 'hero-metrics', label: 'Total Apostado / Lucro', icon: 'cash-outline' },
  { id: 'avg-odds', label: 'Odd média (ganhas/perdidas)', icon: 'swap-vertical-outline' },
  { id: 'win-rate', label: 'Taxa de Vitória', icon: 'trophy-outline' },
  { id: 'streaks', label: 'Sequências', icon: 'flame-outline' },
  { id: 'recent-form', label: 'Forma Recente', icon: 'pulse-outline' },
  { id: 'stake-by-outcome', label: 'Stake média por resultado', icon: 'analytics-outline' },
  { id: 'totals', label: 'Total boletins / Stake média', icon: 'layers-outline' },
  { id: 'averages', label: 'Odd média geral / Ganhos', icon: 'stats-chart-outline' },
  { id: 'efficiency', label: 'Eficiência de odds', icon: 'speedometer-outline' },
  { id: 'pnl-chart', label: 'Evolução P&L', icon: 'bar-chart-outline' },
  { id: 'by-sport', label: 'Por desporto', icon: 'football-outline' },
  { id: 'by-team', label: 'Por equipa', icon: 'people-outline' },
  { id: 'by-competition', label: 'Por competição', icon: 'ribbon-outline' },
  { id: 'by-market', label: 'Por mercado', icon: 'grid-outline' },
  { id: 'by-odds-range', label: 'Por intervalo de odds', icon: 'options-outline' },
  { id: 'by-site', label: 'Por casa de apostas', icon: 'business-outline' },
  { id: 'by-weekday', label: 'Por dia da semana', icon: 'calendar-outline' },
  { id: 'by-leg-count', label: 'Por nº de seleções', icon: 'layers-outline' },
  { id: 'freebet', label: 'Freebets', icon: 'gift-outline' },
  { id: 'heatmap', label: 'Calendário de apostas', icon: 'grid-outline' },
  { id: 'by-stake', label: 'Por faixa de stake', icon: 'cash-outline' },
  { id: 'sport-market-matrix', label: 'Matriz Desporto × Mercado', icon: 'stats-chart-outline' },
  { id: 'insights', label: 'Insights', icon: 'bulb-outline' },
  { id: 'roi-trend', label: 'Tendência de ROI', icon: 'trending-up-outline' },
  { id: 'calibration', label: 'Calibração', icon: 'locate-outline' },
  { id: 'home-away', label: 'Casa vs Fora', icon: 'swap-horizontal-outline' },
  { id: 'favourite-underdog', label: 'Favoritos vs Underdogs', icon: 'podium-outline' },
  { id: 'leg-kill', label: 'Perna Assassina', icon: 'skull-outline' },
  { id: 'by-hour', label: 'Por hora do dia', icon: 'time-outline' },
  { id: 'variance', label: 'Variância / Desvio padrão', icon: 'pulse-outline' },
  { id: 'best-worst', label: 'Melhores / Piores boletins', icon: 'medal-outline' },
];

export const DEFAULT_SECTION_ORDER = STATS_SECTIONS.map((s) => s.id);

export function getSectionDef(id: string): StatsSectionDef | undefined {
  return STATS_SECTIONS.find((s) => s.id === id);
}
