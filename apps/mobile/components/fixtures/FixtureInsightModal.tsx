import React, { useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFixtureInsight } from '../../services/teamStatsService';
import type { TeamInsight, H2HInsight, SharpOdds } from '../../services/teamStatsService';
import { useTheme } from '../../theme/useTheme';

// ─── Types ────────────────────────────────────────────────────────────────────

interface FixtureInsightModalProps {
  visible: boolean;
  fixtureId: string | null;
  homeTeam: string;
  awayTeam: string;
  onClose: () => void;
}

/**
 * A single match in a team's recent history.
 * Expected to live on TeamInsight.recentMatches — add this field to your
 * backend if not already present, alongside the existing per-team sampleSize.
 */
interface TeamMatch {
  date: string;          // ISO date string
  homeTeam: string;
  awayTeam: string;
  homeScore: number | null;
  awayScore: number | null;
  /** Was the subject team (the one whose card this is) playing at home? */
  isHome: boolean;
}

// ─── Stat metadata ────────────────────────────────────────────────────────────

/**
 * Stats that open a match-history drilldown screen when tapped.
 * matchFired: given one match, did this stat apply?
 */
interface DrilldownMeta {
  kind: 'drilldown';
  key: string;
  short: string;
  label: string;
  description: string;
  matchFired: (m: TeamMatch) => boolean;
  firedLabel: string;
  notFiredLabel: string;
}

/**
 * Stats that show an inline tooltip when tapped.
 * Used for averages where a per-match breakdown doesn't make sense.
 */
interface TooltipMeta {
  kind: 'tooltip';
  key: string;
  short: string;
  label: string;
  description: string;
}

type StatMeta = DrilldownMeta | TooltipMeta;

const STAT_META: Record<string, StatMeta> = {
  avgGoalsFor: {
    kind: 'tooltip',
    key: 'avgGoalsFor',
    short: 'Méd. GM',
    label: 'Golos marcados / jogo',
    description:
      'Média de golos marcados por jogo neste contexto (casa ou fora). Calculado dividindo o total de golos marcados pelo número de jogos da amostra.',
  },
  avgGoalsAgainst: {
    kind: 'tooltip',
    key: 'avgGoalsAgainst',
    short: 'Méd. GS',
    label: 'Golos sofridos / jogo',
    description:
      'Média de golos sofridos por jogo neste contexto. Calculado dividindo o total de golos sofridos pelo número de jogos da amostra.',
  },
  over25: {
    kind: 'drilldown',
    key: 'over25',
    short: '+2.5',
    label: 'Over 2.5 Golos',
    description:
      'Percentagem de jogos em que o total de golos foi igual ou superior a 3. Um jogo conta como Over 2.5 independentemente de quem marcou — basta que a soma dos golos das duas equipas seja ≥ 3.',
    matchFired: (m) => (m.homeScore ?? 0) + (m.awayScore ?? 0) >= 3,
    firedLabel: 'Over 2.5 ✓',
    notFiredLabel: 'Under 2.5',
  },
  btts: {
    kind: 'drilldown',
    key: 'btts',
    short: 'BTTS',
    label: 'Ambas marcam (BTTS)',
    description:
      'Percentagem de jogos em que ambas as equipas marcaram pelo menos 1 golo. Não depende do resultado — um 1–1 ou um 3–1 contam igualmente.',
    matchFired: (m) => (m.homeScore ?? 0) >= 1 && (m.awayScore ?? 0) >= 1,
    firedLabel: 'Ambas marcaram ✓',
    notFiredLabel: 'Não ambas',
  },
  cleanSheet: {
    kind: 'drilldown',
    key: 'cleanSheet',
    short: 'Baliza a zero',
    label: 'Baliza a zero',
    description:
      'Percentagem de jogos em que esta equipa não sofreu nenhum golo. Pode ter ganho, empatado a zeros, ou em casos raros perdido por forfait — apenas conta não ter sofrido golos.',
    matchFired: (m) =>
      m.isHome ? (m.awayScore ?? 1) === 0 : (m.homeScore ?? 1) === 0,
    firedLabel: 'Baliza a zero ✓',
    notFiredLabel: 'Sofreu golo(s)',
  },
  failedToScore: {
    kind: 'drilldown',
    key: 'failedToScore',
    short: 'Não marcou',
    label: 'Não marcou',
    description:
      'Percentagem de jogos em que esta equipa não marcou nenhum golo, independentemente do resultado final.',
    matchFired: (m) =>
      m.isHome ? (m.homeScore ?? 1) === 0 : (m.awayScore ?? 1) === 0,
    firedLabel: 'Não marcou ✓',
    notFiredLabel: 'Marcou',
  },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function pct(n: number | null | undefined): string {
  if (n == null || !isFinite(n)) return '—';
  return `${Math.round(n)}%`;
}

function fmt1(n: number | null | undefined): string {
  if (n == null || !isFinite(n)) return '—';
  return n.toFixed(1);
}

// ─── Stat drilldown screen ────────────────────────────────────────────────────
// Replaces the main scroll view (no nested Modal) when a drilldown stat is tapped.

interface DrilldownState {
  meta: DrilldownMeta;
  teamName: string;
  venue: 'Em casa' | 'Fora';
  matches: TeamMatch[];
}

function StatDrilldownScreen({
  meta,
  teamName,
  venue,
  matches,
  onBack,
}: DrilldownState & { onBack: () => void }) {
  const { colors } = useTheme();

  const fired = matches.filter((m) => meta.matchFired(m)).length;
  const total = matches.length;
  const rate = total > 0 ? Math.round((fired / total) * 100) : 0;

  return (
    <View style={[drillStyles.root, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[drillStyles.header, { borderBottomColor: colors.border }]}>
        <Pressable hitSlop={14} onPress={onBack} style={drillStyles.backBtn}>
          <Ionicons name="chevron-back" size={22} color={colors.primary} />
          <Text style={[drillStyles.backText, { color: colors.primary }]}>Análise</Text>
        </Pressable>
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Hero card: stat + description */}
        <View
          style={[
            drillStyles.heroCard,
            { backgroundColor: `${colors.primary}12`, borderColor: `${colors.primary}28` },
          ]}
        >
          <View style={drillStyles.heroTop}>
            <View style={drillStyles.heroLeft}>
              <Text style={[drillStyles.heroTeam, { color: colors.textPrimary }]} numberOfLines={2}>
                {teamName}
              </Text>
              <Text style={[drillStyles.heroVenue, { color: colors.textMuted }]}>{venue}</Text>
            </View>
            <View style={drillStyles.heroPctWrap}>
              <Text style={[drillStyles.heroPct, { color: colors.primary }]}>{rate}%</Text>
              <Text style={[drillStyles.heroPctLabel, { color: colors.textMuted }]}>
                {meta.short}
              </Text>
            </View>
          </View>

          {/* Progress bar */}
          <View style={[drillStyles.barTrack, { backgroundColor: colors.border }]}>
            <View
              style={[
                drillStyles.barFill,
                { width: `${rate}%` as any, backgroundColor: colors.primary },
              ]}
            />
          </View>
          <Text style={[drillStyles.barCaption, { color: colors.textMuted }]}>
            {fired} de {total} jogos
          </Text>

          {/* Full stat explanation — replaces tooltip */}
          <View style={[drillStyles.descBox, { borderTopColor: colors.border }]}>
            <Text style={[drillStyles.descTitle, { color: colors.textPrimary }]}>
              {meta.label}
            </Text>
            <Text style={[drillStyles.descBody, { color: colors.textSecondary }]}>
              {meta.description}
            </Text>
          </View>
        </View>

        {/* Match list */}
        <View style={drillStyles.listHeader}>
          <Text style={[drillStyles.listTitle, { color: colors.textMuted }]}>
            JOGOS DA AMOSTRA
          </Text>
          <View style={drillStyles.listLegend}>
            <View style={[drillStyles.legendDot, { backgroundColor: colors.primary }]} />
            <Text style={[drillStyles.listLegendText, { color: colors.textMuted }]}>
              = {meta.firedLabel}
            </Text>
          </View>
        </View>

        {matches.length === 0 ? (
          <View style={drillStyles.emptyWrap}>
            <Ionicons name="stats-chart-outline" size={32} color={colors.textMuted} />
            <Text style={[drillStyles.emptyText, { color: colors.textMuted }]}>
              Sem jogos disponíveis
            </Text>
          </View>
        ) : (
          matches.map((m, i) => {
            const didFire = meta.matchFired(m);
            return (
              <View
                key={i}
                style={[
                  drillStyles.matchRow,
                  { borderBottomColor: colors.border },
                  didFire && { backgroundColor: `${colors.primary}08` },
                ]}
              >
                {/* Fired indicator strip */}
                <View
                  style={[
                    drillStyles.firedStrip,
                    { backgroundColor: didFire ? colors.primary : 'transparent' },
                  ]}
                />

                {/* Date */}
                <Text style={[drillStyles.matchDate, { color: colors.textMuted }]}>
                  {new Date(m.date).toLocaleDateString('pt-PT', {
                    day: '2-digit',
                    month: '2-digit',
                    year: '2-digit',
                  })}
                </Text>

                {/* Teams + score */}
                <View style={drillStyles.matchCenter}>
                  <Text
                    numberOfLines={1}
                    style={[
                      drillStyles.matchTeam,
                      {
                        color: m.isHome ? colors.textPrimary : colors.textSecondary,
                        fontWeight: m.isHome ? '700' : '500',
                      },
                    ]}
                  >
                    {m.homeTeam}
                  </Text>
                  <View style={[drillStyles.scoreBox, { backgroundColor: colors.surfaceRaised }]}>
                    <Text style={[drillStyles.matchScore, { color: colors.textPrimary }]}>
                      {m.homeScore ?? '?'}–{m.awayScore ?? '?'}
                    </Text>
                  </View>
                  <Text
                    numberOfLines={1}
                    style={[
                      drillStyles.matchTeam,
                      drillStyles.matchTeamRight,
                      {
                        color: !m.isHome ? colors.textPrimary : colors.textSecondary,
                        fontWeight: !m.isHome ? '700' : '500',
                      },
                    ]}
                  >
                    {m.awayTeam}
                  </Text>
                </View>

                {/* Result badge */}
                <View
                  style={[
                    drillStyles.badge,
                    {
                      backgroundColor: didFire
                        ? `${colors.primary}22`
                        : `${colors.border}80`,
                    },
                  ]}
                >
                  <Text
                    style={[
                      drillStyles.badgeText,
                      { color: didFire ? colors.primary : colors.textMuted },
                    ]}
                  >
                    {didFire ? meta.firedLabel : meta.notFiredLabel}
                  </Text>
                </View>
              </View>
            );
          })
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

// ─── Fixed inline tooltip ─────────────────────────────────────────────────────
// Uses a dismiss-overlay so it never clips off-screen and closes on outside tap.

function InfoTooltip({
  text,
  align = 'center',
}: {
  text: string;
  align?: 'left' | 'center' | 'right';
}) {
  const { colors } = useTheme();
  const [open, setOpen] = useState(false);

  const boxAlign =
    align === 'left'
      ? tooltipStyles.boxLeft
      : align === 'right'
      ? tooltipStyles.boxRight
      : tooltipStyles.boxCenter;

  return (
    <View style={tooltipStyles.container}>
      <Pressable hitSlop={10} onPress={() => setOpen((v) => !v)}>
        <Ionicons name="information-circle-outline" size={14} color={colors.textMuted} />
      </Pressable>
      {open && (
        <>
          {/* Full-screen dismiss layer */}
          <Pressable style={tooltipStyles.dismissLayer} onPress={() => setOpen(false)} />
          <View
            style={[
              tooltipStyles.box,
              boxAlign,
              { backgroundColor: colors.surfaceRaised, borderColor: colors.border },
            ]}
          >
            <Text style={[tooltipStyles.text, { color: colors.textSecondary }]}>{text}</Text>
          </View>
        </>
      )}
    </View>
  );
}

// ─── Section header ───────────────────────────────────────────────────────────

function SectionHeader({
  icon,
  title,
  subtitle,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle?: string;
}) {
  const { colors } = useTheme();
  return (
    <View style={secStyles.headerWrap}>
      <View style={secStyles.header}>
        <Ionicons name={icon} size={14} color={colors.primary} />
        <Text style={[secStyles.title, { color: colors.primary }]}>{title}</Text>
      </View>
      {subtitle && (
        <Text style={[secStyles.subtitle, { color: colors.textMuted }]}>{subtitle}</Text>
      )}
    </View>
  );
}

// ─── Stat grid item ───────────────────────────────────────────────────────────

interface StatGridItemProps {
  value: string;
  metaKey: string;
  highlight?: boolean;
  teamName?: string;
  venue?: 'Em casa' | 'Fora';
  matches?: TeamMatch[];
  tooltipAlign?: 'left' | 'center' | 'right';
  onDrilldown?: (state: DrilldownState) => void;
}

function StatGridItem({
  value,
  metaKey,
  highlight,
  teamName,
  venue,
  matches,
  tooltipAlign = 'center',
  onDrilldown,
}: StatGridItemProps) {
  const { colors } = useTheme();
  const meta = STAT_META[metaKey];
  if (!meta) return null;

  const isDrilldown = meta.kind === 'drilldown';

  const handlePress = () => {
    if (isDrilldown && onDrilldown && teamName && venue && matches) {
      onDrilldown({ meta: meta as DrilldownMeta, teamName, venue, matches });
    }
  };

  const inner = (
    <View style={gridItemStyles.inner}>
      <Text
        style={[
          gridItemStyles.value,
          { color: isDrilldown ? colors.primary : colors.textPrimary },
        ]}
      >
        {value}
      </Text>
      <View style={gridItemStyles.labelRow}>
        <Text
          style={[
            gridItemStyles.label,
            { color: isDrilldown ? colors.primary : colors.textMuted },
          ]}
        >
          {meta.short}
        </Text>
        {isDrilldown ? (
          <Ionicons name="chevron-forward" size={10} color={colors.primary} />
        ) : (
          <InfoTooltip text={meta.description} align={tooltipAlign} />
        )}
      </View>
    </View>
  );

  if (isDrilldown) {
    return (
      <Pressable
        onPress={handlePress}
        style={({ pressed }) => [gridItemStyles.wrap, pressed && { opacity: 0.55 }]}
      >
        {inner}
      </Pressable>
    );
  }

  return <View style={gridItemStyles.wrap}>{inner}</View>;
}

// ─── Form pills ───────────────────────────────────────────────────────────────

function FormPills({ form }: { form: ('W' | 'D' | 'L')[] }) {
  const LABEL: Record<string, string> = { W: 'V', D: 'E', L: 'D' };
  return (
    <View style={pillStyles.wrap}>
      <Text style={pillStyles.formLabel}>Últimos 5 jogos</Text>
      <View style={pillStyles.row}>
        {form.map((r, i) => (
          <View
            key={i}
            style={[
              pillStyles.pill,
              {
                backgroundColor:
                  r === 'W' ? '#22c55e' : r === 'D' ? '#94a3b8' : '#ef4444',
              },
            ]}
          >
            <Text style={pillStyles.pillText}>{LABEL[r] ?? r}</Text>
          </View>
        ))}
      </View>
      <View style={pillStyles.legend}>
        {[
          { color: '#22c55e', label: 'Vitória' },
          { color: '#94a3b8', label: 'Empate' },
          { color: '#ef4444', label: 'Derrota' },
        ].map(({ color, label }) => (
          <View key={label} style={pillStyles.legendItem}>
            <View style={[pillStyles.dot, { backgroundColor: color }]} />
            <Text style={pillStyles.legendText}>{label}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

// ─── Team insight card ────────────────────────────────────────────────────────

function TeamInsightCard({
  label,
  venue,
  insight,
  onDrilldown,
}: {
  label: string;
  venue: 'Em casa' | 'Fora';
  insight: TeamInsight;
  onDrilldown: (state: DrilldownState) => void;
}) {
  const { colors } = useTheme();
  const isHome = venue === 'Em casa';
  // Cast to our local type — backend should provide recentMatches on TeamInsight
  const matches: TeamMatch[] = (insight.recentMatches ?? []) as unknown as TeamMatch[];

  return (
    <View
      style={[
        teamCardStyles.card,
        { backgroundColor: colors.surfaceRaised, borderColor: colors.border },
      ]}
    >
      {/* Card header */}
      <View style={teamCardStyles.header}>
        <View style={teamCardStyles.titleRow}>
          <Text style={teamCardStyles.venueIcon}>{isHome ? '🏠' : '✈️'}</Text>
          <Text
            numberOfLines={1}
            style={[teamCardStyles.teamName, { color: colors.textPrimary }]}
          >
            {label}
          </Text>
        </View>
        <View style={[teamCardStyles.venueBadge, { backgroundColor: `${colors.primary}15` }]}>
          <Text style={[teamCardStyles.venueBadgeText, { color: colors.textMuted }]}>
            {venue}
          </Text>
        </View>
      </View>

      {insight.formLast5.length > 0 && <FormPills form={insight.formLast5} />}

      <View style={[teamCardStyles.divider, { backgroundColor: colors.border }]} />

      {/* Hint for drilldown stats */}
      <View
        style={[
          teamCardStyles.hintRow,
          {
            borderColor: `${colors.primary}25`,
            backgroundColor: `${colors.primary}08`,
          },
        ]}
      >
        <Ionicons name="hand-left-outline" size={11} color={colors.primary} />
        <Text style={[teamCardStyles.hintText, { color: colors.primary }]}>
          Toca nas estatísticas a verde para ver os jogos
        </Text>
      </View>

      {/* Stat grid: 3 columns */}
      <View style={teamCardStyles.grid}>
        {/* Averages: tooltip only */}
        <StatGridItem
          value={fmt1(insight.avgGoalsFor)}
          metaKey="avgGoalsFor"
          tooltipAlign="left"
        />
        <StatGridItem
          value={fmt1(insight.avgGoalsAgainst)}
          metaKey="avgGoalsAgainst"
          tooltipAlign="center"
        />
        {/* Empty third cell to keep grid aligned */}
        <View style={gridItemStyles.wrap} />

        {/* Drilldown stats */}
        <StatGridItem
          value={pct(insight.over25Pct)}
          metaKey="over25"
          highlight
          teamName={label}
          venue={venue}
          matches={matches}
          onDrilldown={onDrilldown}
        />
        <StatGridItem
          value={pct(insight.bttsPct)}
          metaKey="btts"
          highlight
          teamName={label}
          venue={venue}
          matches={matches}
          onDrilldown={onDrilldown}
        />
        <StatGridItem
          value={pct(insight.cleanSheetPct)}
          metaKey="cleanSheet"
          teamName={label}
          venue={venue}
          matches={matches}
          onDrilldown={onDrilldown}
        />
        <StatGridItem
          value={pct(insight.failedToScorePct)}
          metaKey="failedToScore"
          teamName={label}
          venue={venue}
          matches={matches}
          onDrilldown={onDrilldown}
        />
      </View>

      <View style={[teamCardStyles.sampleRow, { borderTopColor: colors.border }]}>
        <Ionicons name="stats-chart-outline" size={11} color={colors.textMuted} />
        <Text style={[teamCardStyles.sample, { color: colors.textMuted }]}>
          Baseado em {insight.sampleSize}{' '}
          {isHome ? 'jogos em casa' : 'jogos fora'} esta época
        </Text>
      </View>
    </View>
  );
}

// ─── Combined probability card ─────────────────────────────────────────────────

function CombinedCard({
  over25,
  btts,
}: {
  over25: number | null | undefined;
  btts: number | null | undefined;
}) {
  const { colors } = useTheme();
  const hasOver25 = over25 != null && isFinite(over25);
  const hasBtts = btts != null && isFinite(btts);
  if (!hasOver25 && !hasBtts) return null;
  return (
    <View
      style={[
        combinedStyles.card,
        { backgroundColor: `${colors.primary}12`, borderColor: `${colors.primary}30` },
      ]}
    >
      <SectionHeader
        icon="analytics-outline"
        title="Probabilidade combinada"
        subtitle="Estimativa baseada nos dados de ambas as equipas"
      />
      <View style={combinedStyles.row}>
        {hasOver25 && (
          <View style={combinedStyles.item}>
            <Text style={[combinedStyles.pct, { color: colors.primary }]}>{pct(over25)}</Text>
            <Text style={[combinedStyles.lbl, { color: colors.textSecondary }]}>
              Over 2.5 Golos
            </Text>
            <Text style={[combinedStyles.sublbl, { color: colors.textMuted }]}>
              3+ golos no jogo
            </Text>
          </View>
        )}
        {hasOver25 && hasBtts && (
          <View style={[combinedStyles.divider, { backgroundColor: colors.border }]} />
        )}
        {hasBtts && (
          <View style={combinedStyles.item}>
            <Text style={[combinedStyles.pct, { color: colors.primary }]}>{pct(btts)}</Text>
            <Text style={[combinedStyles.lbl, { color: colors.textSecondary }]}>
              Ambas marcam
            </Text>
            <Text style={[combinedStyles.sublbl, { color: colors.textMuted }]}>
              as duas equipas marcam
            </Text>
          </View>
        )}
      </View>
    </View>
  );
}

// ─── H2H card ─────────────────────────────────────────────────────────────────

function H2HCard({
  h2h,
  homeTeam,
  awayTeam,
}: {
  h2h: H2HInsight;
  homeTeam: string;
  awayTeam: string;
}) {
  const { colors } = useTheme();
  const total = h2h.homeWins + h2h.draws + h2h.awayWins;
  return (
    <View>
      <SectionHeader
        icon="swap-horizontal-outline"
        title="Head-to-Head"
        subtitle={`Histórico dos últimos ${h2h.total ?? total} confrontos directos`}
      />
      <View
        style={[
          h2hStyles.card,
          { backgroundColor: colors.surfaceRaised, borderColor: colors.border },
        ]}
      >
        {total > 0 && (
          <>
            <View style={h2hStyles.barWrap}>
              <Text
                style={[h2hStyles.barLabel, { color: colors.textSecondary }]}
                numberOfLines={1}
              >
                {homeTeam}
              </Text>
              <View style={[h2hStyles.barTrack, { backgroundColor: colors.border }]}>
                <View
                  style={[h2hStyles.barSegment, { flex: h2h.homeWins, backgroundColor: '#22c55e' }]}
                />
                <View
                  style={[h2hStyles.barSegment, { flex: h2h.draws, backgroundColor: '#94a3b8' }]}
                />
                <View
                  style={[h2hStyles.barSegment, { flex: h2h.awayWins, backgroundColor: '#ef4444' }]}
                />
              </View>
              <Text
                style={[
                  h2hStyles.barLabel,
                  { color: colors.textSecondary, textAlign: 'right' },
                ]}
                numberOfLines={1}
              >
                {awayTeam}
              </Text>
            </View>
            <View style={h2hStyles.barLegend}>
              {[
                { color: '#22c55e', label: 'Vitória casa' },
                { color: '#94a3b8', label: 'Empate' },
                { color: '#ef4444', label: 'Vitória fora' },
              ].map(({ color, label }) => (
                <View key={label} style={h2hStyles.barLegendItem}>
                  <View style={[h2hStyles.barDot, { backgroundColor: color }]} />
                  <Text style={[h2hStyles.barLegendText, { color: colors.textMuted }]}>
                    {label}
                  </Text>
                </View>
              ))}
            </View>
          </>
        )}

        <View style={[h2hStyles.summaryRow, { backgroundColor: `${colors.primary}08`, borderRadius: 8 }]}>
          {[
            { val: h2h.homeWins, lbl: 'V casa', color: '#22c55e' },
            { val: h2h.draws, lbl: 'Empates', color: colors.textMuted },
            { val: h2h.awayWins, lbl: 'V fora', color: '#ef4444' },
            { val: fmt1(h2h.avgGoalsPerGame), lbl: 'Golos/jogo', color: colors.textPrimary },
            { val: pct(h2h.over25Pct), lbl: '+2.5', color: colors.primary },
          ].map(({ val, lbl, color }, idx, arr) => (
            <React.Fragment key={lbl}>
              <View style={h2hStyles.summaryItem}>
                <Text style={[h2hStyles.summaryVal, { color }]}>{val}</Text>
                <Text style={[h2hStyles.summaryLbl, { color: colors.textMuted }]}>{lbl}</Text>
              </View>
              {idx < arr.length - 1 && (
                <View style={[h2hStyles.summaryDivider, { backgroundColor: colors.border }]} />
              )}
            </React.Fragment>
          ))}
        </View>

        {h2h.recentMatches.length > 0 && (
          <View style={h2hStyles.recentList}>
            <Text style={[h2hStyles.recentTitle, { color: colors.textMuted }]}>
              Últimos resultados
            </Text>
            {h2h.recentMatches.slice(0, 5).map((m, i) => (
              <View
                key={i}
                style={[h2hStyles.recentRow, { borderTopColor: colors.border }]}
              >
                <Text style={[h2hStyles.recentDate, { color: colors.textMuted }]}>
                  {new Date(m.date).toLocaleDateString('pt-PT', {
                    day: '2-digit',
                    month: '2-digit',
                    year: '2-digit',
                  })}
                </Text>
                <Text
                  numberOfLines={1}
                  style={[h2hStyles.recentTeam, { color: colors.textSecondary }]}
                >
                  {m.homeTeam}
                </Text>
                <View style={[h2hStyles.scoreBox, { backgroundColor: colors.background }]}>
                  <Text style={[h2hStyles.recentScore, { color: colors.textPrimary }]}>
                    {m.homeScore ?? '?'}–{m.awayScore ?? '?'}
                  </Text>
                </View>
                <Text
                  numberOfLines={1}
                  style={[
                    h2hStyles.recentTeam,
                    { color: colors.textSecondary, textAlign: 'right' },
                  ]}
                >
                  {m.awayTeam}
                </Text>
              </View>
            ))}
          </View>
        )}
      </View>
    </View>
  );
}

// ─── Sharp odds card ───────────────────────────────────────────────────────────

function SharpOddsCard({ odds }: { odds: SharpOdds }) {
  const { colors } = useTheme();
  if (!odds.pinnacleHome && !odds.pinnacleDraw && !odds.pinnacleAway) return null;
  return (
    <View>
      <SectionHeader
        icon="trending-up-outline"
        title="Odds Pinnacle (sharp)"
        subtitle="Probabilidades implícitas do mercado de referência mundial"
      />
      <View
        style={[
          sharpStyles.card,
          { backgroundColor: colors.surfaceRaised, borderColor: colors.border },
        ]}
      >
        <View style={sharpStyles.row}>
          {[
            { lbl: '1 — Casa', odd: odds.pinnacleHome, implied: odds.impliedHome },
            { lbl: 'X — Empate', odd: odds.pinnacleDraw, implied: odds.impliedDraw },
            { lbl: '2 — Fora', odd: odds.pinnacleAway, implied: odds.impliedAway },
          ].map(({ lbl, odd, implied }) =>
            odd !== null ? (
              <View key={lbl} style={sharpStyles.col}>
                <Text style={[sharpStyles.colLbl, { color: colors.textMuted }]}>{lbl}</Text>
                <Text style={[sharpStyles.colOdd, { color: colors.textPrimary }]}>
                  {odd.toFixed(2)}
                </Text>
                {implied !== null && (
                  <View
                    style={[
                      sharpStyles.impliedBadge,
                      { backgroundColor: `${colors.primary}18` },
                    ]}
                  >
                    <Text style={[sharpStyles.colImplied, { color: colors.primary }]}>
                      {pct(implied * 100)} prob.
                    </Text>
                  </View>
                )}
              </View>
            ) : null,
          )}
        </View>
        <View style={[sharpStyles.noteRow, { borderTopColor: colors.border }]}>
          <Ionicons name="information-circle-outline" size={12} color={colors.textMuted} />
          <Text style={[sharpStyles.note, { color: colors.textMuted }]}>
            {odds.note ?? 'Odds de fecho Pinnacle — consideradas as mais precisas do mercado'}
          </Text>
        </View>
      </View>
    </View>
  );
}

// ─── Player lists ──────────────────────────────────────────────────────────────

function PlayerList({
  title,
  players,
  isInjury,
}: {
  title: string;
  players: { playerName: string; goals?: number; assists?: number; type?: string }[];
  isInjury?: boolean;
}) {
  const { colors } = useTheme();
  if (players.length === 0) return null;
  return (
    <View style={playerStyles.wrap}>
      <Text style={[playerStyles.title, { color: colors.textMuted }]}>{title}</Text>
      {players.map((p, i) => (
        <View key={i} style={playerStyles.row}>
          <Ionicons
            name={isInjury ? 'bandage-outline' : 'football-outline'}
            size={13}
            color={isInjury ? '#ef4444' : colors.primary}
          />
          <Text
            style={[playerStyles.name, { color: colors.textSecondary }]}
            numberOfLines={1}
          >
            {p.playerName}
          </Text>
          {!isInjury && p.goals !== undefined && (
            <View style={playerStyles.statRow}>
              <Text style={[playerStyles.stat, { color: colors.textMuted }]}>⚽ {p.goals}</Text>
              {p.assists !== undefined && (
                <Text style={[playerStyles.stat, { color: colors.textMuted }]}>
                  🅰 {p.assists}
                </Text>
              )}
            </View>
          )}
          {isInjury && p.type && (
            <View style={[playerStyles.injuryBadge, { backgroundColor: '#ef444418' }]}>
              <Text style={[playerStyles.stat, { color: '#ef4444' }]}>{p.type}</Text>
            </View>
          )}
        </View>
      ))}
    </View>
  );
}

// ─── Main modal ────────────────────────────────────────────────────────────────

export function FixtureInsightModal({
  visible,
  fixtureId,
  homeTeam,
  awayTeam,
  onClose,
}: FixtureInsightModalProps) {
  const { colors, tokens } = useTheme();
  const { data: insight, isLoading, isError } = useFixtureInsight(fixtureId);
  const [drilldown, setDrilldown] = useState<DrilldownState | null>(null);

  const hasInjuries =
    (insight?.homeInjuries?.length ?? 0) > 0 || (insight?.awayInjuries?.length ?? 0) > 0;
  const hasScorers =
    (insight?.homeTopScorers?.length ?? 0) > 0 || (insight?.awayTopScorers?.length ?? 0) > 0;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={drilldown ? () => setDrilldown(null) : onClose}
    >
      <View style={[modalStyles.root, { backgroundColor: colors.background }]}>
        {/* ── Drilldown screen replaces main content ── */}
        {drilldown ? (
          <StatDrilldownScreen {...drilldown} onBack={() => setDrilldown(null)} />
        ) : (
          <>
            {/* Header */}
            <View style={[modalStyles.header, { borderBottomColor: colors.border }]}>
              <View style={{ flex: 1 }}>
                <View style={modalStyles.titleRow}>
                  <Ionicons name="bar-chart-outline" size={16} color={colors.primary} />
                  <Text style={[modalStyles.title, { color: colors.textPrimary }]}>
                    Análise do jogo
                  </Text>
                </View>
                <Text
                  style={[modalStyles.subtitle, { color: colors.textSecondary }]}
                  numberOfLines={1}
                >
                  {homeTeam} vs {awayTeam}
                </Text>
              </View>
              <Pressable hitSlop={10} onPress={onClose} style={modalStyles.closeBtn}>
                <Ionicons name="close" size={22} color={colors.textSecondary} />
              </Pressable>
            </View>

            {/* Explanation banner */}
            <View
              style={[
                modalStyles.explainBanner,
                {
                  backgroundColor: `${colors.primary}10`,
                  borderBottomColor: colors.border,
                },
              ]}
            >
              <Ionicons name="bulb-outline" size={13} color={colors.primary} />
              <Text style={[modalStyles.explainText, { color: colors.textSecondary }]}>
                Dados desta época. Toca nas estatísticas a verde para ver o histórico de jogos.
              </Text>
            </View>

            {/* Body */}
            {isLoading ? (
              <View style={modalStyles.center}>
                <ActivityIndicator size="large" color={colors.primary} />
                <Text style={[modalStyles.loadingText, { color: colors.textMuted }]}>
                  A carregar análise…
                </Text>
              </View>
            ) : isError || !insight ? (
              <View style={modalStyles.center}>
                <Ionicons name="alert-circle-outline" size={40} color={colors.textMuted} />
                <Text style={[modalStyles.loadingText, { color: colors.textMuted }]}>
                  Não foi possível carregar a análise.
                </Text>
              </View>
            ) : (
              <ScrollView
                contentContainerStyle={[
                  modalStyles.scrollContent,
                  { paddingBottom: tokens.spacing?.xl ?? 32 },
                ]}
                showsVerticalScrollIndicator={false}
              >
                {insight.message && (
                  <View
                    style={[
                      msgStyles.box,
                      {
                        backgroundColor: `${colors.primary}12`,
                        borderColor: `${colors.primary}28`,
                      },
                    ]}
                  >
                    <Ionicons
                      name="information-circle-outline"
                      size={14}
                      color={colors.primary}
                    />
                    <Text style={[msgStyles.text, { color: colors.textSecondary }]}>
                      {insight.message}
                    </Text>
                  </View>
                )}

                <CombinedCard over25={insight.combinedOver25} btts={insight.combinedBtts} />

                {insight.homeTeamAtHome && (
                  <TeamInsightCard
                    label={insight.homeTeam}
                    venue="Em casa"
                    insight={insight.homeTeamAtHome}
                    onDrilldown={setDrilldown}
                  />
                )}

                {insight.awayTeamAway && (
                  <TeamInsightCard
                    label={insight.awayTeam}
                    venue="Fora"
                    insight={insight.awayTeamAway}
                    onDrilldown={setDrilldown}
                  />
                )}

                {insight.h2h && insight.h2h.total > 0 && (
                  <H2HCard
                    h2h={insight.h2h}
                    homeTeam={insight.homeTeam}
                    awayTeam={insight.awayTeam}
                  />
                )}

                {insight.sharpOdds && <SharpOddsCard odds={insight.sharpOdds} />}

                {hasInjuries && (
                  <View>
                    <SectionHeader
                      icon="bandage-outline"
                      title="Lesões / Baixas"
                      subtitle="Jogadores indisponíveis para este jogo"
                    />
                    <View
                      style={[
                        sideStyles.wrap,
                        {
                          backgroundColor: colors.surfaceRaised,
                          borderColor: colors.border,
                        },
                      ]}
                    >
                      <PlayerList
                        title={`${insight.homeTeam} (casa)`}
                        players={insight.homeInjuries}
                        isInjury
                      />
                      <PlayerList
                        title={`${insight.awayTeam} (fora)`}
                        players={insight.awayInjuries}
                        isInjury
                      />
                    </View>
                  </View>
                )}

                {hasScorers && (
                  <View>
                    <SectionHeader
                      icon="football-outline"
                      title="Melhores marcadores"
                      subtitle="Golos e assistências esta época"
                    />
                    <View
                      style={[
                        sideStyles.wrap,
                        {
                          backgroundColor: colors.surfaceRaised,
                          borderColor: colors.border,
                        },
                      ]}
                    >
                      <PlayerList
                        title={`${insight.homeTeam} (casa)`}
                        players={insight.homeTopScorers}
                      />
                      <PlayerList
                        title={`${insight.awayTeam} (fora)`}
                        players={insight.awayTopScorers}
                      />
                    </View>
                  </View>
                )}

                {insight.computedAt && (
                  <View style={modalStyles.computedAtRow}>
                    <Ionicons name="time-outline" size={11} color={colors.textMuted} />
                    <Text style={[modalStyles.computedAt, { color: colors.textMuted }]}>
                      Análise calculada em{' '}
                      {new Date(insight.computedAt).toLocaleString('pt-PT', {
                        day: '2-digit',
                        month: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </Text>
                  </View>
                )}
              </ScrollView>
            )}
          </>
        )}
      </View>
    </Modal>
  );
}

// ─── Styles ────────────────────────────────────────────────────────────────────

const modalStyles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 14,
  },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 },
  title: { fontSize: 17, fontWeight: '800' },
  subtitle: { fontSize: 13, fontWeight: '500' },
  closeBtn: { alignItems: 'center', justifyContent: 'center', padding: 4 },
  explainBanner: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'flex-start',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  explainText: { flex: 1, fontSize: 12, fontWeight: '500', lineHeight: 17 },
  center: {
    alignItems: 'center',
    flex: 1,
    gap: 12,
    justifyContent: 'center',
    padding: 32,
  },
  loadingText: { fontSize: 14, fontWeight: '500', textAlign: 'center' },
  scrollContent: { gap: 16, paddingHorizontal: 16, paddingTop: 16 },
  computedAtRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    justifyContent: 'center',
    marginTop: 4,
  },
  computedAt: { fontSize: 11, textAlign: 'center' },
});

const tooltipStyles = StyleSheet.create({
  container: { position: 'relative' },
  // Full-screen invisible layer to dismiss tooltip on outside tap
  dismissLayer: {
    position: 'absolute',
    top: -600,
    left: -600,
    right: -600,
    bottom: -600,
    zIndex: 98,
  },
  box: {
    position: 'absolute',
    bottom: 22,
    width: 190,
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    zIndex: 99,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 10,
  },
  boxLeft: { left: 0 },
  boxCenter: { left: -85 },
  boxRight: { right: 0 },
  text: { fontSize: 12, lineHeight: 17 },
});

const pillStyles = StyleSheet.create({
  wrap: { marginBottom: 10 },
  formLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: '#94a3b8',
    textTransform: 'uppercase',
    marginBottom: 6,
    letterSpacing: 0.5,
  },
  row: { flexDirection: 'row', gap: 4, marginBottom: 6 },
  pill: {
    alignItems: 'center',
    borderRadius: 4,
    height: 22,
    justifyContent: 'center',
    width: 22,
  },
  pillText: { color: '#fff', fontSize: 10, fontWeight: '800' },
  legend: { flexDirection: 'row', gap: 12 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  legendText: { fontSize: 10, color: '#94a3b8' },
});

const secStyles = StyleSheet.create({
  headerWrap: { marginBottom: 8, gap: 2 },
  header: { alignItems: 'center', flexDirection: 'row', gap: 6 },
  title: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  subtitle: { fontSize: 12, fontWeight: '400' },
});

const gridItemStyles = StyleSheet.create({
  wrap: { alignItems: 'center', minWidth: '28%', flex: 1 },
  inner: { alignItems: 'center' },
  value: { fontSize: 17, fontWeight: '800' },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    marginTop: 2,
  },
  label: { fontSize: 10, fontWeight: '600', textTransform: 'uppercase' },
});

const teamCardStyles = StyleSheet.create({
  card: { borderRadius: 12, borderWidth: 1, padding: 12 },
  header: { alignItems: 'center', flexDirection: 'row', gap: 8, marginBottom: 10 },
  titleRow: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 },
  venueIcon: { fontSize: 14 },
  teamName: { flex: 1, fontSize: 14, fontWeight: '800' },
  venueBadge: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  venueBadgeText: { fontSize: 11, fontWeight: '700' },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginVertical: 10,
  },
  hintRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: 6,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 5,
    marginBottom: 10,
  },
  hintText: { fontSize: 11, fontWeight: '600' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 10 },
  sampleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 8,
  },
  sample: { fontSize: 10, fontWeight: '500' },
});

const combinedStyles = StyleSheet.create({
  card: { borderRadius: 12, borderWidth: 1, padding: 14, gap: 12 },
  row: { alignItems: 'center', flexDirection: 'row' },
  item: { alignItems: 'center', flex: 1 },
  pct: { fontSize: 28, fontWeight: '900' },
  lbl: { fontSize: 13, fontWeight: '700', marginTop: 2, textAlign: 'center' },
  sublbl: { fontSize: 11, fontWeight: '500', textAlign: 'center', marginTop: 1 },
  divider: { width: StyleSheet.hairlineWidth, height: 50 },
});

const h2hStyles = StyleSheet.create({
  card: { borderRadius: 12, borderWidth: 1, padding: 12, gap: 10 },
  barWrap: { alignItems: 'center', flexDirection: 'row', gap: 8 },
  barLabel: { flex: 1, fontSize: 11, fontWeight: '600' },
  barTrack: {
    borderRadius: 4,
    flexDirection: 'row',
    height: 8,
    overflow: 'hidden',
    width: 100,
  },
  barSegment: { height: '100%' },
  barLegend: { flexDirection: 'row', gap: 12, marginTop: 2 },
  barLegendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  barDot: { width: 6, height: 6, borderRadius: 3 },
  barLegendText: { fontSize: 10 },
  summaryRow: { flexDirection: 'row', padding: 10 },
  summaryItem: { flex: 1, alignItems: 'center' },
  summaryVal: { fontSize: 15, fontWeight: '800' },
  summaryLbl: { fontSize: 10, fontWeight: '500', marginTop: 2 },
  summaryDivider: { width: StyleSheet.hairlineWidth, height: 30, alignSelf: 'center' },
  recentList: { gap: 0 },
  recentTitle: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
    marginBottom: 4,
    textTransform: 'uppercase',
  },
  recentRow: {
    alignItems: 'center',
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: 6,
    paddingVertical: 6,
  },
  recentDate: { fontSize: 11, fontWeight: '500', minWidth: 44 },
  recentTeam: { flex: 1, fontSize: 12, fontWeight: '500' },
  scoreBox: { borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 },
  recentScore: { fontSize: 13, fontWeight: '800', minWidth: 36, textAlign: 'center' },
});

const sharpStyles = StyleSheet.create({
  card: { borderRadius: 12, borderWidth: 1, padding: 12, gap: 8 },
  row: { flexDirection: 'row', gap: 8 },
  col: { alignItems: 'center', flex: 1 },
  colLbl: { fontSize: 11, fontWeight: '700', letterSpacing: 0.3, textAlign: 'center' },
  colOdd: { fontSize: 20, fontWeight: '900', marginTop: 4 },
  impliedBadge: { borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2, marginTop: 4 },
  colImplied: { fontSize: 12, fontWeight: '700' },
  noteRow: {
    flexDirection: 'row',
    gap: 6,
    alignItems: 'flex-start',
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 8,
  },
  note: { flex: 1, fontSize: 11, fontStyle: 'italic' },
});

const playerStyles = StyleSheet.create({
  wrap: { gap: 4, marginBottom: 6 },
  title: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
    marginBottom: 4,
    textTransform: 'uppercase',
  },
  row: { alignItems: 'center', flexDirection: 'row', gap: 6, paddingVertical: 3 },
  name: { flex: 1, fontSize: 13, fontWeight: '500' },
  statRow: { flexDirection: 'row', gap: 6 },
  stat: { fontSize: 12, fontWeight: '700' },
  injuryBadge: { borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 },
});

const sideStyles = StyleSheet.create({
  wrap: { borderRadius: 12, borderWidth: 1, gap: 4, padding: 12 },
});

const msgStyles = StyleSheet.create({
  box: {
    alignItems: 'flex-start',
    borderRadius: 10,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 8,
    padding: 10,
  },
  text: { flex: 1, fontSize: 13, fontWeight: '500' },
});

// ─── Drilldown screen styles ───────────────────────────────────────────────────

const drillStyles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 16,
    paddingTop: 18,
    paddingBottom: 12,
  },
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  backText: { fontSize: 16, fontWeight: '600' },

  heroCard: {
    margin: 16,
    borderRadius: 14,
    borderWidth: 1,
    padding: 16,
    gap: 12,
  },
  heroTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  heroLeft: { flex: 1, marginRight: 12 },
  heroTeam: { fontSize: 15, fontWeight: '800' },
  heroVenue: { fontSize: 12, fontWeight: '500', marginTop: 2 },
  heroPctWrap: { alignItems: 'flex-end' },
  heroPct: { fontSize: 36, fontWeight: '900', lineHeight: 40 },
  heroPctLabel: {
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    marginTop: 2,
  },

  barTrack: { height: 8, borderRadius: 4, overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: 4 },
  barCaption: { fontSize: 12, fontWeight: '500' },

  descBox: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 12,
    gap: 6,
  },
  descTitle: { fontSize: 14, fontWeight: '800' },
  descBody: { fontSize: 13, lineHeight: 19 },

  listHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  listTitle: { fontSize: 10, fontWeight: '700', letterSpacing: 0.5 },
  listLegend: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendDot: { width: 6, height: 6, borderRadius: 3 },
  listLegendText: { fontSize: 10, fontWeight: '500' },

  emptyWrap: { alignItems: 'center', gap: 8, paddingVertical: 40 },
  emptyText: { fontSize: 14, fontWeight: '500' },

  matchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingRight: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  firedStrip: {
    width: 3,
    height: 32,
    borderRadius: 2,
    marginRight: 4,
  },
  matchDate: { fontSize: 11, fontWeight: '500', minWidth: 46 },
  matchCenter: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  matchTeam: { flex: 1, fontSize: 12 },
  matchTeamRight: { textAlign: 'right' },
  scoreBox: {
    borderRadius: 5,
    paddingHorizontal: 7,
    paddingVertical: 3,
    minWidth: 40,
    alignItems: 'center',
  },
  matchScore: { fontSize: 13, fontWeight: '800' },
  badge: {
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 3,
    minWidth: 70,
    alignItems: 'center',
  },
  badgeText: { fontSize: 10, fontWeight: '700' },
});