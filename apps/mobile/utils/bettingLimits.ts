// Personal limits and loss-chasing detection (plan #34). Pure functions so they can be unit-tested.

/** Minimal boletin shape needed for the limit checks. */
export interface LimitBoletin {
  stake: number | string;
  status: string;
  actualReturn?: number | string | null;
  isFreebet?: boolean;
  betDate?: string | null;
  createdAt: string;
}

export interface LimitStatus {
  /** Net loss this week (positive number = money lost); 0 when the week is in profit. */
  weekLoss: number;
  weekLossRatio: number | null;
  /** Real money staked this calendar month (pending included). */
  monthStaked: number;
  monthStakeRatio: number | null;
  /** Bets in the last 7 days placed within 24 h of a loss with at least twice the usual stake. */
  chaseCount: number;
  /** Median real-money stake, the reference for "usual". */
  usualStake: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function dateOf(b: LimitBoletin): number {
  return new Date(b.betDate ?? b.createdAt).getTime();
}

function realStake(b: LimitBoletin): number {
  return b.isFreebet ? 0 : Number(b.stake) || 0;
}

/** Monday 00:00 (local time) of the week containing `now`. */
export function startOfWeek(now: Date): Date {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const offset = (d.getDay() + 6) % 7; // Monday = 0
  d.setDate(d.getDate() - offset);
  return d;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/**
 * Computes how close the user is to their limits and whether recent bets look like chasing losses.
 * Settled = anything not PENDING; VOID returns the stake so it nets to zero.
 */
export function computeLimitStatus(
  boletins: LimitBoletin[],
  limits: { weeklyLossLimit: number | null; monthlyStakeLimit: number | null },
  now: Date = new Date(),
): LimitStatus {
  const weekStart = startOfWeek(now).getTime();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();

  let weekPnl = 0;
  let monthStaked = 0;
  for (const b of boletins) {
    const t = dateOf(b);
    if (t >= monthStart) monthStaked += realStake(b);
    if (t >= weekStart && b.status !== 'PENDING' && b.status !== 'VOID') {
      weekPnl += (Number(b.actualReturn ?? 0) || 0) - realStake(b);
    }
  }
  const weekLoss = Math.max(0, -weekPnl);

  const usualStake = median(boletins.map(realStake).filter((s) => s > 0));
  const sorted = [...boletins].sort((a, b) => dateOf(a) - dateOf(b));
  let chaseCount = 0;
  if (usualStake > 0) {
    for (let i = 1; i < sorted.length; i++) {
      const b = sorted[i]!;
      const t = dateOf(b);
      if (now.getTime() - t > 7 * DAY_MS) continue;
      if (realStake(b) < usualStake * 2) continue;
      const followsLoss = sorted.slice(0, i).some((p) => p.status === 'LOST' && t - dateOf(p) <= DAY_MS && t >= dateOf(p));
      if (followsLoss) chaseCount += 1;
    }
  }

  return {
    weekLoss: Math.round(weekLoss * 100) / 100,
    weekLossRatio: limits.weeklyLossLimit ? weekLoss / limits.weeklyLossLimit : null,
    monthStaked: Math.round(monthStaked * 100) / 100,
    monthStakeRatio: limits.monthlyStakeLimit ? monthStaked / limits.monthlyStakeLimit : null,
    chaseCount,
    usualStake,
  };
}
