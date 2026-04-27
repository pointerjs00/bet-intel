import { GoogleGenerativeAI } from '@google/generative-ai';
import type { AiReview, PersonalStats } from '@betintel/shared';
import { redis } from '../../utils/redis';
import { getPersonalStats } from './statsService';
import { logger } from '../../utils/logger';

const AI_REVIEW_TTL = 60 * 60 * 24; // 24h
const AI_REVIEW_CACHE_PREFIX = 'ai-review:';

function getGenAI() {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw Object.assign(new Error('GEMINI_API_KEY não configurada no servidor'), { statusCode: 500 });
  return new GoogleGenerativeAI(key);
}

function buildPrompt(stats: PersonalStats): string {
  const s = stats.summary;

  const topSports = [...(stats.bySport ?? [])]
    .sort((a, b) => b.totalBets - a.totalBets)
    .slice(0, 5);

  const topMarkets = [...(stats.byMarket ?? [])]
    .sort((a, b) => b.totalBets - a.totalBets)
    .slice(0, 5);

  const oddsRanges = (stats.byOddsRange ?? []).filter((r) => r.totalBets > 0);

  const legCounts = [...(stats.byLegCount ?? [])].sort((a, b) => a.legCount - b.legCount);

  const sites = (stats.bySite ?? []).filter((r) => r.totalBets >= 3);
  let bestSite: (typeof sites)[0] | null = null;
  let worstSite: (typeof sites)[0] | null = null;
  if (sites.length > 0) {
    bestSite = sites.reduce((best, r) => (r.roi > best.roi ? r : best));
    worstSite = sites.reduce((worst, r) => (r.roi < worst.roi ? r : worst));
    if (bestSite === worstSite) worstSite = null;
  }

  const streakLine = s.streaks
    ? `Série atual: ${s.streaks.currentType === 'WON' ? s.streaks.currentCount + ' vitórias' : s.streaks.currentType === 'LOST' ? s.streaks.currentCount + ' derrotas' : 'nenhuma'} | Melhor série de vitórias: ${s.streaks.longestWin}`
    : '';

  const lines: string[] = [
    'Sou um apostador desportivo português. Com base nos meus dados históricos de apostas, analisa a minha performance como um treinador de apostas experiente e honesto.',
    '',
    'RESUMO GERAL:',
    `- Apostas resolvidas: ${s.settledBoletins} | Pendentes: ${s.pendingBoletins}`,
    `- Taxa de vitória: ${s.winRate.toFixed(1)}%`,
    `- ROI: ${s.roi.toFixed(1)}%`,
    `- Lucro/Prejuízo: €${s.profitLoss.toFixed(2)}`,
    `- Stake total apostado: €${s.totalStaked.toFixed(2)}`,
    `- Odd média: ${s.averageOdds.toFixed(2)}`,
    `- Odd média vitórias: ${s.averageWonOdds.toFixed(2)} | Odd média derrotas: ${s.averageLostOdds.toFixed(2)}`,
    `- Stake médio vencedor: €${s.averageWonStake.toFixed(2)} | Stake médio perdedor: €${s.averageLostStake.toFixed(2)}`,
  ];

  if (streakLine) lines.push(`- ${streakLine}`);

  if (topSports.length > 0) {
    lines.push('', 'POR DESPORTO (mais apostados):');
    for (const r of topSports) {
      lines.push(`- ${r.label}: ${r.totalBets} apostas, ${r.winRate.toFixed(0)}% win, ${r.roi.toFixed(1)}% ROI`);
    }
  }

  if (topMarkets.length > 0) {
    lines.push('', 'POR MERCADO (mais apostados):');
    for (const r of topMarkets) {
      lines.push(`- ${r.market}: ${r.totalBets} apostas, ${r.winRate.toFixed(0)}% win, ${r.roi.toFixed(1)}% ROI`);
    }
  }

  if (oddsRanges.length > 0) {
    lines.push('', 'POR RANGE DE ODDS:');
    for (const r of oddsRanges) {
      lines.push(`- ${r.label}: ${r.totalBets} apostas, ${r.winRate.toFixed(0)}% win, ${r.roi.toFixed(1)}% ROI`);
    }
  }

  if (legCounts.length > 0) {
    lines.push('', 'POR NÚMERO DE SELEÇÕES (acumuladores):');
    for (const r of legCounts) {
      lines.push(`- ${r.legCount} seleção(ões): ${r.totalBets} apostas, ${r.winRate.toFixed(0)}% win, ${r.roi.toFixed(1)}% ROI`);
    }
  }

  if (bestSite || worstSite) {
    lines.push('', 'POR SITE:');
    if (bestSite) lines.push(`- Melhor ROI: ${bestSite.siteSlug} (${bestSite.roi.toFixed(1)}%, ${bestSite.totalBets} apostas)`);
    if (worstSite) lines.push(`- Pior ROI: ${worstSite.siteSlug} (${worstSite.roi.toFixed(1)}%, ${worstSite.totalBets} apostas)`);
  }

  if (s.homeBets > 0 || s.awayBets > 0) {
    lines.push('', 'CASA vs FORA (mercados 1X2):');
    if (s.homeBets > 0) lines.push(`- Casa: ${s.homeBets} apostas, ${s.homeWinRate.toFixed(0)}% win, ${s.homeROI.toFixed(1)}% ROI`);
    if (s.awayBets > 0) lines.push(`- Fora: ${s.awayBets} apostas, ${s.awayWinRate.toFixed(0)}% win, ${s.awayROI.toFixed(1)}% ROI`);
  }

  if (s.favouriteBets > 0 || s.underdogBets > 0) {
    lines.push('', 'FAVORITOS vs UNDERDOGS:');
    if (s.favouriteBets > 0) lines.push(`- Favoritos (odds < 2.00): ${s.favouriteBets} apostas, ${s.favouriteWinRate.toFixed(0)}% win, ${s.favouriteROI.toFixed(1)}% ROI`);
    if (s.underdogBets > 0) lines.push(`- Underdogs (odds ≥ 2.00): ${s.underdogBets} apostas, ${s.underdogWinRate.toFixed(0)}% win, ${s.underdogROI.toFixed(1)}% ROI`);
  }

  lines.push(
    '',
    'Com base nestes dados, fornece uma análise estruturada em JSON com exactamente estas 4 chaves:',
    '{ "strongPoints": ["...", "..."], "weakPoints": ["...", "..."], "patterns": ["...", "..."], "recommendation": "..." }',
    '',
    'Regras estritas:',
    '- strongPoints: 2-3 pontos fortes, com dados concretos (percentagens, valores em euros)',
    '- weakPoints: 2-3 fraquezas identificadas, com dados concretos',
    '- patterns: 2-3 padrões comportamentais notáveis (ex: excesso de acumuladores, stakes maiores em perdas, apostas em odds acima do histórico)',
    '- recommendation: UMA recomendação concreta e acionável (máx. 2 frases). Específica ao utilizador, não genérica.',
    '- Escreve tudo em Português europeu, sem emojis',
    '- Cada bullet máx. 100 palavras. Direto e quantitativo.',
    `- Se tiveres menos de 10 apostas resolvidas (tens ${s.settledBoletins}), refere isso, dá conselhos gerais e pede mais dados.`,
    '- Responde APENAS com JSON válido, sem nenhum texto extra, sem markdown code fences.',
  );

  return lines.join('\n');
}

function buildExportPrompt(stats: PersonalStats): string {
  const s = stats.summary;

  const topSports = [...(stats.bySport ?? [])].sort((a, b) => b.totalBets - a.totalBets).slice(0, 5);
  const topMarkets = [...(stats.byMarket ?? [])].sort((a, b) => b.totalBets - a.totalBets).slice(0, 5);
  const oddsRanges = (stats.byOddsRange ?? []).filter((r) => r.totalBets > 0);
  const legCounts = [...(stats.byLegCount ?? [])].sort((a, b) => a.legCount - b.legCount);
  const sites = (stats.bySite ?? []).filter((r) => r.totalBets >= 3);

  let bestSite: (typeof sites)[0] | null = null;
  let worstSite: (typeof sites)[0] | null = null;
  if (sites.length > 0) {
    bestSite = sites.reduce((best, r) => (r.roi > best.roi ? r : best));
    worstSite = sites.reduce((worst, r) => (r.roi < worst.roi ? r : worst));
    if (bestSite === worstSite) worstSite = null;
  }

  const streakLine = s.streaks
    ? `Série atual: ${s.streaks.currentType === 'WON' ? s.streaks.currentCount + ' vitórias' : s.streaks.currentType === 'LOST' ? s.streaks.currentCount + ' derrotas' : 'nenhuma'} | Melhor série de vitórias: ${s.streaks.longestWin}`
    : '';

  const lines: string[] = [
    'Sou um apostador desportivo português e preciso de uma análise honesta da minha performance com base nos seguintes dados históricos de apostas. Analisa como um treinador experiente — identifica pontos fortes, fraquezas, padrões comportamentais e dá-me uma recomendação concreta e acionável.',
    '',
    'RESUMO GERAL:',
    `- Apostas resolvidas: ${s.settledBoletins} | Pendentes: ${s.pendingBoletins}`,
    `- Taxa de vitória: ${s.winRate.toFixed(1)}%`,
    `- ROI: ${s.roi.toFixed(1)}%`,
    `- Lucro/Prejuízo: €${s.profitLoss.toFixed(2)}`,
    `- Stake total apostado: €${s.totalStaked.toFixed(2)}`,
    `- Odd média: ${s.averageOdds.toFixed(2)}`,
    `- Odd média vitórias: ${s.averageWonOdds.toFixed(2)} | Odd média derrotas: ${s.averageLostOdds.toFixed(2)}`,
    `- Stake médio vencedor: €${s.averageWonStake.toFixed(2)} | Stake médio perdedor: €${s.averageLostStake.toFixed(2)}`,
  ];

  if (streakLine) lines.push(`- ${streakLine}`);

  if (topSports.length > 0) {
    lines.push('', 'POR DESPORTO (mais apostados):');
    for (const r of topSports) lines.push(`- ${r.label}: ${r.totalBets} apostas, ${r.winRate.toFixed(0)}% win, ${r.roi.toFixed(1)}% ROI`);
  }

  if (topMarkets.length > 0) {
    lines.push('', 'POR MERCADO (mais apostados):');
    for (const r of topMarkets) lines.push(`- ${r.market}: ${r.totalBets} apostas, ${r.winRate.toFixed(0)}% win, ${r.roi.toFixed(1)}% ROI`);
  }

  if (oddsRanges.length > 0) {
    lines.push('', 'POR RANGE DE ODDS:');
    for (const r of oddsRanges) lines.push(`- ${r.label}: ${r.totalBets} apostas, ${r.winRate.toFixed(0)}% win, ${r.roi.toFixed(1)}% ROI`);
  }

  if (legCounts.length > 0) {
    lines.push('', 'POR NÚMERO DE SELEÇÕES:');
    for (const r of legCounts) lines.push(`- ${r.legCount} seleção(ões): ${r.totalBets} apostas, ${r.winRate.toFixed(0)}% win, ${r.roi.toFixed(1)}% ROI`);
  }

  if (bestSite || worstSite) {
    lines.push('', 'POR SITE:');
    if (bestSite) lines.push(`- Melhor ROI: ${bestSite.siteSlug} (${bestSite.roi.toFixed(1)}%, ${bestSite.totalBets} apostas)`);
    if (worstSite) lines.push(`- Pior ROI: ${worstSite.siteSlug} (${worstSite.roi.toFixed(1)}%, ${worstSite.totalBets} apostas)`);
  }

  if (s.homeBets > 0 || s.awayBets > 0) {
    lines.push('', 'CASA vs FORA:');
    if (s.homeBets > 0) lines.push(`- Casa: ${s.homeBets} apostas, ${s.homeWinRate.toFixed(0)}% win, ${s.homeROI.toFixed(1)}% ROI`);
    if (s.awayBets > 0) lines.push(`- Fora: ${s.awayBets} apostas, ${s.awayWinRate.toFixed(0)}% win, ${s.awayROI.toFixed(1)}% ROI`);
  }

  if (s.favouriteBets > 0 || s.underdogBets > 0) {
    lines.push('', 'FAVORITOS vs UNDERDOGS:');
    if (s.favouriteBets > 0) lines.push(`- Favoritos (odds < 2.00): ${s.favouriteBets} apostas, ${s.favouriteWinRate.toFixed(0)}% win, ${s.favouriteROI.toFixed(1)}% ROI`);
    if (s.underdogBets > 0) lines.push(`- Underdogs (odds ≥ 2.00): ${s.underdogBets} apostas, ${s.underdogWinRate.toFixed(0)}% win, ${s.underdogROI.toFixed(1)}% ROI`);
  }

  lines.push(
    '',
    'Com base nestes dados, faz uma análise detalhada em texto livre (sem JSON, sem listas técnicas) que cubra:',
    '1. Os meus pontos fortes, com dados concretos (percentagens, valores em euros)',
    '2. As minhas fraquezas e onde estou a perder dinheiro',
    '3. Padrões comportamentais notáveis que identificas',
    '4. Uma recomendação concreta e acionável específica para mim',
    '',
    'Escreve em Português europeu, de forma direta e quantitativa. Sê honesto.',
    s.settledBoletins < 10
      ? `Nota: tenho apenas ${s.settledBoletins} apostas resolvidas — refere isso e pede mais dados para uma análise mais precisa.`
      : '',
  );

  return lines.filter(Boolean).join('\n');
}

export async function getAiReviewPrompt(userId: string): Promise<string> {
  const stats = await getPersonalStats(userId, { period: 'all' });
  return buildExportPrompt(stats);
}

export async function getAiReview(userId: string): Promise<AiReview> {
  const cacheKey = `${AI_REVIEW_CACHE_PREFIX}${userId}`;

  try {
    const cached = await redis.get(cacheKey);
    if (cached) return JSON.parse(cached) as AiReview;
  } catch {
    // Cache miss — proceed
  }

  const stats = await getPersonalStats(userId, { period: 'all' });

  if (stats.summary.settledBoletins === 0) {
    const emptyReview: AiReview = {
      strongPoints: ['Ainda não tens apostas registadas para analisar.'],
      weakPoints: [],
      patterns: [],
      recommendation: 'Regista as tuas apostas regularmente para obteres uma análise personalizada com base no teu histórico.',
      cachedAt: new Date().toISOString(),
    };
    redis.set(cacheKey, JSON.stringify(emptyReview), 'EX', AI_REVIEW_TTL).catch(() => {});
    return emptyReview;
  }

  const prompt = buildPrompt(stats);

  let rawText: string;
  try {
    const model = getGenAI().getGenerativeModel({ model: 'gemini-2.5-flash' });
    const result = await model.generateContent(prompt);
    rawText = result.response.text().trim();
  } catch (err) {
    logger.error('AI review Gemini API error', { userId, error: err instanceof Error ? err.message : String(err) });
    throw Object.assign(new Error('Não foi possível gerar a análise. Tenta novamente mais tarde.'), { statusCode: 503 });
  }

  let parsed: { strongPoints: string[]; weakPoints: string[]; patterns: string[]; recommendation: string };
  try {
    // Strip markdown code fences if the model adds them despite instructions
    const jsonText = rawText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
    parsed = JSON.parse(jsonText);
  } catch (err) {
    logger.error('AI review JSON parse error', { userId, rawText, error: err instanceof Error ? err.message : String(err) });
    throw Object.assign(new Error('A análise gerada não é válida. Tenta novamente.'), { statusCode: 502 });
  }

  const review: AiReview = {
    strongPoints: Array.isArray(parsed.strongPoints) ? parsed.strongPoints : [],
    weakPoints: Array.isArray(parsed.weakPoints) ? parsed.weakPoints : [],
    patterns: Array.isArray(parsed.patterns) ? parsed.patterns : [],
    recommendation: typeof parsed.recommendation === 'string' ? parsed.recommendation : '',
    cachedAt: new Date().toISOString(),
  };

  redis.set(cacheKey, JSON.stringify(review), 'EX', AI_REVIEW_TTL).catch(() => {});
  return review;
}
