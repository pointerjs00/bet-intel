import type { PersonalStats, StatsSummary } from '@betintel/shared';

// ─── Types ────────────────────────────────────────────────────────────────────

export type ExplainerVerdict = 'good' | 'neutral' | 'needs-work' | 'info-only';

export interface StatExplanation {
  statLabel: string;
  statValue: string;
  plainExplanation: string;
  verdict: ExplainerVerdict;
  verdictLabel: string;
  calculationSteps: string;
  isAvailable: boolean;
  unavailableReason?: string;
}

export interface ExplainBoletinData {
  stake: number;
  totalOdds: number;
  potentialReturn: number;
  actualReturn: number;
  profit: number;
  roi: number;
  status: string;
  isFreebet: boolean;
  items: Array<{ oddValue: number; market: string; result?: string | null }>;
  impliedProbability: number;
  oddsEfficiency: number | null;
  selectionCount: number;
  boletinName: string | null;
}

export interface MarketStat {
  market: string;
  winRate: number;
  totalBets: number;
  roi: number;
}

// ─── Formatters ───────────────────────────────────────────────────────────────

function eur(value: number): string {
  const abs = Math.abs(value);
  return value < 0 ? `-€${abs.toFixed(2)}` : `€${abs.toFixed(2)}`;
}

function pct(value: number, decimals = 1): string {
  return `${value.toFixed(decimals)}%`;
}

function odds(value: number): string {
  return value.toFixed(2);
}

// ─── Boletin-specific explainers ──────────────────────────────────────────────

export function explainROI(data: ExplainBoletinData): StatExplanation {
  const { stake, actualReturn, profit, roi, status } = data;

  if (status === 'VOID') {
    return unavailable('ROI', '—', 'Aposta cancelada — a stake foi devolvida integralmente. O ROI não se aplica.');
  }

  const sign = roi > 0 ? '+' : '';
  const roiStr = `${sign}${pct(roi)}`;

  let plain: string;
  if (roi > 0) {
    plain = `O ROI diz-te quanto ganhaste em relação ao que apostaste, em percentagem. Apostaste ${eur(stake)} e recebeste ${eur(actualReturn)}. Ganhaste ${pct(roi)} do que apostaste — por cada euro apostado, ficaste com mais €${(roi / 100).toFixed(2)} no bolso.`;
  } else if (roi === 0) {
    plain = `O ROI diz-te quanto ganhaste (ou perdeste) em relação ao que apostaste. Apostaste ${eur(stake)} e recebeste exactamente o mesmo — recuperaste o teu dinheiro mas sem lucro nem prejuízo.`;
  } else {
    plain = `O ROI diz-te quanto perdeste em relação ao que apostaste, em percentagem. Apostaste ${eur(stake)} e recebeste ${eur(actualReturn)}. Perdeste ${pct(Math.abs(roi))} do que apostaste — por cada euro apostado, perdeste €${(Math.abs(roi) / 100).toFixed(2)}.`;
  }

  const verdict: ExplainerVerdict = roi > 0 ? 'good' : roi === 0 ? 'neutral' : 'needs-work';

  const steps = [
    `ROI = ((Retorno - Aposta) ÷ Aposta) × 100`,
    `    = ((${eur(actualReturn)} - ${eur(stake)}) ÷ ${eur(stake)}) × 100`,
    `    = (${eur(profit)} ÷ ${eur(stake)}) × 100`,
    `    = ${roiStr}`,
  ].join('\n');

  return make('ROI', roiStr, plain, verdict, verdict === 'good' ? 'Bom' : verdict === 'neutral' ? 'Normal' : 'A melhorar', steps);
}

export function explainTotalOdds(data: ExplainBoletinData): StatExplanation {
  const { stake, totalOdds, potentialReturn, items, selectionCount } = data;
  const oddsList = items.map((i) => odds(i.oddValue)).join(' × ');
  const plain = `As odds totais mostram o quanto o teu boletin ia multiplicar a tua aposta se ganhasses tudo. Tinhas ${selectionCount} seleç${selectionCount === 1 ? 'ão' : 'ões'}, com odds de ${oddsList}. Multiplicando tudo, obtens ${odds(totalOdds)}x — se ganhasses, receberias ${eur(potentialReturn)} por cada ${eur(stake)} apostado.`;

  const label = totalOdds < 2 ? 'Favorito' : totalOdds <= 5 ? 'Risco médio' : 'Acumulador';
  const steps = [
    `Odds Totais = ${oddsList}`,
    `           = ${odds(totalOdds)}`,
  ].join('\n');

  return make('Odds Totais', `${odds(totalOdds)}x`, plain, 'info-only', label, steps);
}

export function explainPotentialReturn(data: ExplainBoletinData): StatExplanation {
  const { stake, totalOdds, potentialReturn, actualReturn, status } = data;

  if (status === 'VOID') return unavailable('Retorno Potencial', '—', 'Aposta cancelada — a stake foi devolvida.');

  let statusNote = '';
  if (status === 'WON') statusNote = ` E ganhaste mesmo! Recebeste ${eur(actualReturn)}.`;
  else if (status === 'LOST') statusNote = ' Infelizmente não aconteceu desta vez.';
  else if (status === 'CASHOUT') statusNote = ` Fizeste cashout e recebeste ${eur(actualReturn)} em vez de esperares pelo resultado final.`;

  const plain = `O retorno potencial era o valor que ias receber se todas as seleções ganhassem. Calculou-se multiplicando a tua aposta (${eur(stake)}) pelas odds totais (${odds(totalOdds)}x), dando ${eur(potentialReturn)}.${statusNote}`;
  const steps = [
    `Retorno Potencial = Aposta × Odds Totais`,
    `                  = ${eur(stake)} × ${odds(totalOdds)}`,
    `                  = ${eur(potentialReturn)}`,
  ].join('\n');

  return make('Retorno Potencial', eur(potentialReturn), plain, 'info-only', '', steps);
}

export function explainProfit(data: ExplainBoletinData): StatExplanation {
  const { stake, actualReturn, profit, status, isFreebet } = data;

  if (status === 'VOID') return unavailable('Lucro / Prejuízo', '€0.00', 'Aposta cancelada — a stake foi devolvida na totalidade.');

  const profitStr = profit >= 0 ? `+${eur(profit)}` : eur(profit);
  let plain: string;

  if (isFreebet && status === 'LOST') {
    plain = `Esta era uma freebet, por isso não perdeste dinheiro real — a aposta era grátis. O teu saldo fica inalterado.`;
  } else if (profit > 0) {
    plain = `O lucro é quanto dinheiro ganhaste depois de descontar o que apostaste. Apostaste ${eur(stake)} e recebeste ${eur(actualReturn)} — ficaste com ${eur(profit)} a mais do que punhas no início.`;
  } else if (profit === 0) {
    plain = `Recuperaste exactamente o que apostaste (${eur(stake)}) — nem lucro nem prejuízo. Devolução total.`;
  } else {
    plain = `O prejuízo é quanto dinheiro perdeste nesta aposta. Apostaste ${eur(stake)} e não recebeste nada — perdeste ${eur(Math.abs(profit))}.`;
  }

  const verdict: ExplainerVerdict = profit > 0 ? 'good' : profit === 0 ? 'neutral' : 'needs-work';
  const steps = [
    `Lucro = Retorno Real - Aposta`,
    `      = ${eur(actualReturn)} - ${eur(stake)}`,
    `      = ${profitStr}`,
  ].join('\n');

  return make('Lucro / Prejuízo', profitStr, plain, verdict, verdict === 'good' ? 'Bom' : verdict === 'neutral' ? 'Normal' : 'A melhorar', steps);
}

export function explainOddsEfficiency(data: ExplainBoletinData): StatExplanation {
  const { totalOdds, impliedProbability, oddsEfficiency, actualReturn, potentialReturn, status } = data;

  if (status === 'VOID' || oddsEfficiency === null) {
    return unavailable('Eficiência de Odds', '—', 'Não disponível para apostas canceladas.');
  }

  const effStr = pct(oddsEfficiency);
  const plain = status === 'WON'
    ? `A eficiência de odds compara o que aconteceu com o que as odds "esperavam". Com odds de ${odds(totalOdds)}x, a casa achava que tinhas ${pct(impliedProbability)} de hipóteses de ganhar. Ganhaste — superaste as expectativas. Eficiência ${effStr}: quanto mais acima de 100%, melhor.`
    : `A eficiência de odds compara o resultado real com as expectativas das odds. Com ${odds(totalOdds)}x, tinhas ${pct(impliedProbability)} de hipóteses. Perdeste — abaixo de 100% significa que o resultado foi pior do que as odds sugeriam (${effStr}).`;

  const verdict: ExplainerVerdict = oddsEfficiency >= 100 ? 'good' : oddsEfficiency >= 85 ? 'neutral' : 'needs-work';
  const steps = [
    `Probabilidade implícita = (1 ÷ ${odds(totalOdds)}) × 100 = ${pct(impliedProbability)}`,
    ``,
    `Eficiência = (Retorno Real ÷ Retorno Potencial) × 100`,
    `           = (${eur(actualReturn)} ÷ ${eur(potentialReturn)}) × 100`,
    `           = ${effStr}`,
  ].join('\n');

  return make('Eficiência de Odds', effStr, plain, verdict, verdict === 'good' ? 'Bom' : verdict === 'neutral' ? 'Normal' : 'A melhorar', steps);
}

export function explainImpliedProbability(data: ExplainBoletinData): StatExplanation {
  const { totalOdds, impliedProbability, status } = data;
  const oneInN = Math.round(100 / impliedProbability);
  const statusNote = status === 'WON' ? ' E ganhaste!' : status === 'LOST' ? ' E não ganhaste, que era o resultado mais provável.' : '';

  const plain = `A probabilidade implícita é o que as odds dizem sobre as tuas hipóteses, segundo a casa de apostas. Com odds de ${odds(totalOdds)}x, considerava que tinhas ${pct(impliedProbability)} de hipóteses de ganhar — ou seja, em ${oneInN} boletins iguais, esperaria que ganhasses apenas 1.${statusNote}`;
  const steps = [
    `Probabilidade Implícita = (1 ÷ Odds Totais) × 100`,
    `                        = (1 ÷ ${odds(totalOdds)}) × 100`,
    `                        = ${pct(impliedProbability)}`,
  ].join('\n');

  return make('Probabilidade Implícita', pct(impliedProbability), plain, 'info-only', '', steps);
}

export function explainLegCount(data: ExplainBoletinData): StatExplanation {
  const { selectionCount } = data;
  const note = selectionCount === 1
    ? 'Uma única seleção é o tipo mais simples — ganhas ou perdes com base num único resultado.'
    : selectionCount <= 3
    ? `Com ${selectionCount} seleções, todas precisam de ganhar para o boletin ser vencedor. Mais seleções = mais difícil, mas prémio maior.`
    : `Com ${selectionCount} seleções, é um acumulador de alto risco. A probabilidade de todas ganharem diminui muito com cada seleção — mas o prémio potencial é muito maior.`;

  const plain = `Este boletin tinha ${selectionCount} seleç${selectionCount === 1 ? 'ão' : 'ões'} (também chamadas "pernas"). ${note}`;
  return make('Nº de Seleções', `${selectionCount}`, plain, 'info-only', '', `Número de seleções = ${selectionCount}`);
}

export function explainMarketWinRate(data: ExplainBoletinData, marketStats: MarketStat[]): StatExplanation {
  const uniqueMarkets = [...new Set(data.items.map((i) => i.market))];

  const lines: string[] = [];
  let overallVerdict: ExplainerVerdict = 'info-only';
  let firstRate: number | null = null;

  for (const market of uniqueMarkets) {
    const row = marketStats.find((r) => r.market.toLowerCase() === market.toLowerCase());
    if (!row || row.totalBets < 3) continue;
    if (firstRate === null) firstRate = row.winRate;

    const comparison = row.winRate > data.impliedProbability
      ? 'Isso é melhor do que as odds sugeriam — podes ter vantagem neste mercado!'
      : row.winRate < data.impliedProbability * 0.85
      ? 'Isso é pior do que as odds sugeriam — este mercado pode não ser o teu ponto forte.'
      : 'Estás dentro do esperado pelas odds neste mercado.';

    lines.push(`Em "${market}", ganhas ${pct(row.winRate)} das vezes (em ${row.totalBets} apostas). ${comparison}`);

    const v: ExplainerVerdict = row.winRate >= data.impliedProbability ? 'good'
      : row.winRate >= data.impliedProbability * 0.85 ? 'neutral'
      : 'needs-work';
    if (overallVerdict === 'info-only' || v === 'needs-work') overallVerdict = v;
    else if (overallVerdict === 'good' && v === 'neutral') overallVerdict = 'neutral';
  }

  if (lines.length === 0) {
    return unavailable('Taxa de Vitória (Mercado)', '—', 'Ainda não tens apostas suficientes neste mercado (mínimo 3 apostas).');
  }

  const verdictLabel = overallVerdict === 'good' ? 'Bom' : overallVerdict === 'neutral' ? 'Normal' : overallVerdict === 'needs-work' ? 'A melhorar' : '';
  const steps = `Win Rate = (Apostas ganhas ÷ Total apostas) × 100\nMínimo de 3 apostas por mercado para análise fiável.`;

  return make('Taxa de Vitória (Mercado)', firstRate !== null ? pct(firstRate) : '—', lines.join('\n\n'), overallVerdict, verdictLabel, steps);
}

// ─── Overall-stats explainers (for metric-info.tsx) ───────────────────────────

export function explainMetricFromSummary(metricKey: string, stats: PersonalStats): StatExplanation | null {
  const summary: StatsSummary = stats.summary;
  const settled = summary.settledBoletins;

  if (settled < 5) {
    return {
      statLabel: metricKey,
      statValue: '—',
      plainExplanation: 'Ainda não tens apostas suficientes para calcular este valor. Continua a registar as tuas apostas!',
      verdict: 'info-only',
      verdictLabel: '',
      calculationSteps: '',
      isAvailable: false,
      unavailableReason: `Precisas de pelo menos 5 apostas resolvidas (tens ${settled}).`,
    };
  }

  switch (metricKey) {
    case 'roi': {
      const r = summary.roi;
      const sign = r >= 0 ? '+' : '';
      const plain = r > 0
        ? `O teu ROI é ${sign}${pct(r)} — por cada €100 apostados, ganhaste €${(100 * r / 100).toFixed(2)} a mais. Com ${settled} boletins resolvidos e ${eur(summary.totalStaked)} apostados no total, o teu lucro acumulado é de ${eur(summary.profitLoss)}.`
        : r === 0
        ? `O teu ROI é 0% — apostaste ${eur(summary.totalStaked)} e recuperaste exactamente o mesmo. Estás no equilíbrio.`
        : `O teu ROI é ${pct(r)} — por cada €100 apostados, perdeste €${Math.abs(r).toFixed(2)}. Com ${settled} boletins e ${eur(summary.totalStaked)} apostados, o teu prejuízo acumulado é de ${eur(Math.abs(summary.profitLoss))}.`;
      const verdict: ExplainerVerdict = r > 0 ? 'good' : r >= -5 ? 'neutral' : 'needs-work';
      return make('ROI', `${sign}${pct(r)}`, plain, verdict, verdict === 'good' ? 'Bom' : verdict === 'neutral' ? 'Normal' : 'A melhorar',
        `ROI = ((Retorno Total - Stake Total) ÷ Stake Total) × 100\n    = ((${eur(summary.totalReturned)} - ${eur(summary.totalStaked)}) ÷ ${eur(summary.totalStaked)}) × 100\n    = ${sign}${pct(r)}`);
    }

    case 'win-rate': {
      const wr = summary.winRate;
      const plain = `A tua taxa de vitória é ${pct(wr)} — em cada 100 apostas resolvidas, ganhaste aproximadamente ${Math.round(wr)} vezes. Dos teus ${settled} boletins, ${summary.wonBoletins} foram ganhos. Uma taxa de vitória alta por si só não chega — o que importa é combiná-la com odds adequadas ao teu histórico.`;
      const verdict: ExplainerVerdict = wr >= 55 ? 'good' : wr >= 40 ? 'neutral' : 'needs-work';
      return make('Taxa de Vitória', pct(wr), plain, verdict, verdict === 'good' ? 'Bom' : verdict === 'neutral' ? 'Normal' : 'A melhorar',
        `Win Rate = (Boletins Ganhos ÷ Boletins Resolvidos) × 100\n         = (${summary.wonBoletins} ÷ ${settled}) × 100\n         = ${pct(wr)}`);
    }

    case 'odds-efficiency': {
      const oe = summary.oddsEfficiency;
      const plain = oe >= 100
        ? `A tua eficiência de odds é ${pct(oe)} — estás a ganhar mais do que o que as odds "esperavam". Isso significa que as tuas selecções têm valor real acima das probabilidades implícitas das casas de apostas.`
        : `A tua eficiência de odds é ${pct(oe)} — abaixo de 100% significa que os teus resultados ficaram um pouco aquém das expectativas das odds. A média do mercado está em torno de 90–95% (margem da casa).`;
      const verdict: ExplainerVerdict = oe >= 100 ? 'good' : oe >= 85 ? 'neutral' : 'needs-work';
      return make('Eficiência de Odds', pct(oe), plain, verdict, verdict === 'good' ? 'Bom' : verdict === 'neutral' ? 'Normal' : 'A melhorar',
        `Eficiência = (Retorno Total Real ÷ Retorno Total Esperado) × 100`);
    }

    case 'avg-stake-outcome': {
      const plain = `Em média, apostas ${eur(summary.averageWonStake)} nas apostas que ganhas e ${eur(summary.averageLostStake)} nas que perdes. ${
        summary.averageLostStake > summary.averageWonStake
          ? `Atenção: apostas mais quando perdes (${eur(summary.averageLostStake)}) do que quando ganhas (${eur(summary.averageWonStake)}). Isso pode indicar apostas de "recuperação" — aumentar stakes depois de derrotas é uma das maiores armadilhas das apostas.`
          : `Apostas mais quando ganhas, o que é um bom sinal de disciplina.`
      }`;
      const verdict: ExplainerVerdict = summary.averageLostStake > summary.averageWonStake * 1.2 ? 'needs-work' : summary.averageWonStake >= summary.averageLostStake ? 'good' : 'neutral';
      return make('Stake Médio por Resultado', `${eur(summary.averageWonStake)} / ${eur(summary.averageLostStake)}`, plain, verdict,
        verdict === 'good' ? 'Bom' : verdict === 'neutral' ? 'Normal' : 'A melhorar',
        `Stake médio vitórias = ${eur(summary.averageWonStake)}\nStake médio derrotas = ${eur(summary.averageLostStake)}`);
    }

    case 'boletim-roi':
      return explainMetricFromSummary('roi', stats);

    case 'boletim-odds-efficiency':
      return explainMetricFromSummary('odds-efficiency', stats);

    case 'boletim-selections': {
      const rows = stats.byLegCount.filter((r) => r.totalBets >= 3);
      if (rows.length === 0) {
        return unavailable('Seleções', '—', 'Ainda não tens apostas suficientes por número de seleções (mínimo 3 por categoria).');
      }
      const best = rows.reduce((a, b) => (a.roi > b.roi ? a : b));
      const worst = rows.reduce((a, b) => (a.roi < b.roi ? a : b));
      const lines = rows
        .sort((a, b) => a.legCount - b.legCount)
        .map((r) => {
          const label = r.legCount === 1 ? 'Singulares' : r.legCount === 2 ? 'Duplas' : r.legCount === 3 ? 'Triplas' : `${r.legCount} pernas`;
          return `${label}: ${r.totalBets} apostas, win ${pct(r.winRate)}, ROI ${r.roi >= 0 ? '+' : ''}${pct(r.roi)}`;
        })
        .join('\n');
      const plain = `Aqui está o teu desempenho por número de seleções:\n\n${lines}\n\nO teu melhor formato é ${best.legCount === 1 ? 'singulares' : `${best.legCount} pernas`} (ROI ${best.roi >= 0 ? '+' : ''}${pct(best.roi)})${worst.legCount !== best.legCount ? ` e o pior é ${worst.legCount === 1 ? 'singulares' : `${worst.legCount} pernas`} (ROI ${pct(worst.roi)})` : ''}.`;
      const verdict: ExplainerVerdict = best.roi > 0 ? 'good' : best.roi > -5 ? 'neutral' : 'needs-work';
      return make('Seleções', `${rows.length} tipos`, plain, verdict, verdict === 'good' ? 'Bom' : verdict === 'neutral' ? 'Normal' : 'A melhorar', lines);
    }

    case 'boletim-total-odds': {
      const avgOdds = summary.averageOdds;
      const plain = `As tuas odds médias são ${odds(avgOdds)}x. Odds mais altas significam maiores prémios mas menor probabilidade de ganhar. As tuas odds médias nas apostas ganhas foram ${odds(summary.averageWonOdds)}x e nas perdidas ${odds(summary.averageLostOdds)}x.`;
      const verdict: ExplainerVerdict = summary.averageWonOdds >= summary.averageLostOdds ? 'good' : 'neutral';
      return make('Odds Totais', `${odds(avgOdds)}x`, plain, verdict, verdict === 'good' ? 'Bom' : 'Normal', `Odds médias ganhas: ${odds(summary.averageWonOdds)}x\nOdds médias perdidas: ${odds(summary.averageLostOdds)}x`);
    }

    case 'boletim-profit': {
      const pl = summary.profitLoss;
      const sign = pl >= 0 ? '+' : '';
      const plain = pl >= 0
        ? `No total, ganhaste ${eur(pl)} com ${settled} boletins resolvidos e ${eur(summary.totalStaked)} apostados.`
        : `No total, perdeste ${eur(Math.abs(pl))} com ${settled} boletins resolvidos e ${eur(summary.totalStaked)} apostados.`;
      const verdict: ExplainerVerdict = pl > 0 ? 'good' : pl >= -summary.totalStaked * 0.05 ? 'neutral' : 'needs-work';
      return make('Lucro / Prejuízo', `${sign}${eur(pl)}`, plain, verdict, verdict === 'good' ? 'Bom' : verdict === 'neutral' ? 'Normal' : 'A melhorar',
        `Lucro = Retorno Total - Stake Total\n      = ${eur(summary.totalReturned)} - ${eur(summary.totalStaked)}\n      = ${sign}${eur(pl)}`);
    }

    case 'boletim-potential-return': {
      const plain = `O teu retorno médio por boletim é ${eur(summary.averageReturn)}. No total, recebeste ${eur(summary.totalReturned)} de ${eur(summary.totalStaked)} apostados.`;
      return make('Retorno Potencial', eur(summary.averageReturn), plain, 'info-only', '',
        `Retorno médio = Retorno Total ÷ Boletins Resolvidos\n              = ${eur(summary.totalReturned)} ÷ ${settled}\n              = ${eur(summary.averageReturn)}`);
    }

    case 'boletim-implied-prob': {
      const impliedProb = summary.averageOdds > 0 ? (1 / summary.averageOdds) * 100 : 0;
      const plain = `Com odds médias de ${odds(summary.averageOdds)}x, as casas de apostas acham que tens em média ${pct(impliedProb)} de hipóteses de ganhar cada boletim. A tua taxa de vitória real é ${pct(summary.winRate)} — ${summary.winRate > impliedProb ? 'acima do esperado, bom sinal' : 'abaixo do esperado pelas odds'}.`;
      const verdict: ExplainerVerdict = summary.winRate > impliedProb ? 'good' : summary.winRate > impliedProb * 0.85 ? 'neutral' : 'needs-work';
      return make('Prob. Implícita', pct(impliedProb), plain, verdict, verdict === 'good' ? 'Bom' : verdict === 'neutral' ? 'Normal' : 'A melhorar', '');
    }

    case 'boletim-market-win-rate': {
      const rows = stats.byMarket.filter((r) => r.totalBets >= 3).sort((a, b) => b.winRate - a.winRate);
      if (rows.length === 0) return unavailable('Taxa Mercado', '—', 'Ainda não tens apostas suficientes por mercado (mínimo 3 por mercado).');
      const best = rows[0]!;
      const plain = `O teu melhor mercado é "${best.market}" com ${pct(best.winRate)} de win rate em ${best.totalBets} apostas (ROI ${best.roi >= 0 ? '+' : ''}${pct(best.roi)}).${rows.length > 1 ? `\n\nOutros mercados: ${rows.slice(1, 4).map((r) => `${r.market} ${pct(r.winRate)}`).join(', ')}.` : ''}`;
      const verdict: ExplainerVerdict = best.roi > 0 ? 'good' : best.roi > -5 ? 'neutral' : 'needs-work';
      return make('Taxa Mercado', pct(best.winRate), plain, verdict, verdict === 'good' ? 'Bom' : 'Normal', '');
    }

    default:
      return null;
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function make(
  statLabel: string,
  statValue: string,
  plainExplanation: string,
  verdict: ExplainerVerdict,
  verdictLabel: string,
  calculationSteps: string,
): StatExplanation {
  return { statLabel, statValue, plainExplanation, verdict, verdictLabel, calculationSteps, isAvailable: true };
}

function unavailable(statLabel: string, statValue: string, reason: string): StatExplanation {
  return {
    statLabel,
    statValue,
    plainExplanation: reason,
    verdict: 'info-only',
    verdictLabel: '',
    calculationSteps: '',
    isAvailable: false,
    unavailableReason: reason,
  };
}
