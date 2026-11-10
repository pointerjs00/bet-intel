// Pre-match context for a match (plan #58): form of each team, head-to-head and the table
// around both teams. Data from ESPN via /sports/football/preview.
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { AppText } from '../ui/AppText';
import { ListCard, ListRow } from '../ui/ListCard';
import { SectionHeader } from '../ui/SectionHeader';
import { Skeleton } from '../ui/Skeleton';
import { TeamBadge } from '../ui/TeamBadge';
import { useMatchPreview } from '../../services/sportsService';
import { useTheme } from '../../theme/useTheme';

const RESULT_LABEL: Record<string, string> = { W: 'V', D: 'E', L: 'D' };

function FormPills({ results }: { results: string[] }) {
  const { colors } = useTheme();
  if (results.length === 0) return <AppText variant="caption">Sem jogos recentes</AppText>;
  return (
    <View accessibilityLabel={`Forma: ${results.map((r) => RESULT_LABEL[r]).join(' ')}`} style={styles.pills}>
      {results.map((r, i) => {
        const bg = r === 'W' ? colors.positive : r === 'L' ? colors.negative : colors.textMuted;
        return (
          <View key={i} style={[styles.pill, { backgroundColor: `${bg}26` }]}>
            <AppText style={{ color: bg, fontWeight: '800' }} variant="label">{RESULT_LABEL[r]}</AppText>
          </View>
        );
      })}
    </View>
  );
}

export function MatchPreviewSection({ league, id, home, away }: { league: string; id: string; home: string; away: string }) {
  const { colors } = useTheme();
  const q = useMatchPreview(league, id);
  const p = q.data;

  if (q.isLoading) return <Skeleton height={120} width="100%" />;
  if (!p) return null;

  // Table: the two teams plus one neighbour above and below each, so it stays short.
  const rows = p.standings?.rows ?? [];
  const idx = rows
    .map((r, i) => ({ r, i }))
    .filter(({ r }) => r.team === home || r.team === away || home.includes(r.team) || away.includes(r.team))
    .map(({ i }) => i);
  const keep = new Set<number>();
  idx.forEach((i) => { [i - 1, i, i + 1].forEach((k) => { if (k >= 0 && k < rows.length) keep.add(k); }); });
  const table = [...keep].sort((a, b) => a - b).map((i) => rows[i]!);

  return (
    <>
      <SectionHeader title="Forma (últimos 5)" />
      <ListCard>
        <ListRow>
          <TeamBadge name={home} size={24} />
          <AppText numberOfLines={1} style={styles.flex} variant="bodyStrong">{home}</AppText>
          <FormPills results={p.form.home} />
        </ListRow>
        <ListRow>
          <TeamBadge name={away} size={24} />
          <AppText numberOfLines={1} style={styles.flex} variant="bodyStrong">{away}</AppText>
          <FormPills results={p.form.away} />
        </ListRow>
      </ListCard>

      {p.h2h.length > 0 ? (
        <>
          <SectionHeader title="Confrontos diretos" />
          <ListCard>
            {p.h2h.map((g, i) => (
              <ListRow key={i}>
                <View style={styles.flex}>
                  <AppText numberOfLines={1} variant="body">{g.home} <AppText variant="number">{g.homeScore}–{g.awayScore}</AppText> {g.away}</AppText>
                  <AppText variant="caption">{new Date(g.date).toLocaleDateString('pt-PT', { day: '2-digit', month: 'short', year: 'numeric' })} · {g.competition}</AppText>
                </View>
              </ListRow>
            ))}
          </ListCard>
        </>
      ) : null}

      {table.length > 0 ? (
        <>
          <SectionHeader title="Classificação" />
          <ListCard>
            <ListRow>
              <AppText style={styles.rank} variant="label">#</AppText>
              <AppText style={styles.flex} variant="label">Equipa</AppText>
              <AppText style={styles.num} variant="label">J</AppText>
              <AppText style={styles.num} variant="label">DG</AppText>
              <AppText style={styles.num} variant="label">Pts</AppText>
            </ListRow>
            {table.map((r) => {
              const ours = r.team === home || r.team === away || home.includes(r.team) || away.includes(r.team);
              return (
                <ListRow key={r.rank} style={ours ? { backgroundColor: `${colors.primary}14` } : undefined}>
                  <AppText style={styles.rank} variant="number">{r.rank}</AppText>
                  <View style={[styles.flex, styles.team]}>
                    <TeamBadge imageUrl={r.logo} name={r.team} size={20} variant="team" />
                    <AppText numberOfLines={1} style={styles.flex} variant={ours ? 'bodyStrong' : 'body'}>{r.team}</AppText>
                  </View>
                  <AppText style={styles.num} variant="body">{r.played}</AppText>
                  <AppText style={styles.num} variant="body">{r.goalDiff}</AppText>
                  <AppText style={styles.num} variant="bodyStrong">{r.points}</AppText>
                </ListRow>
              );
            })}
          </ListCard>
        </>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  pills: { flexDirection: 'row', gap: 4 },
  pill: { alignItems: 'center', borderRadius: 7, height: 24, justifyContent: 'center', width: 24 },
  rank: { width: 26 },
  num: { textAlign: 'right', width: 34 },
  team: { alignItems: 'center', flexDirection: 'row', gap: 8 },
});
