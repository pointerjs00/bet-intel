import { useMemo, useState, useCallback } from 'react';
import type { StatsBreakdownRow } from '@betintel/shared';
import type { SortKey } from '../components/stats/TableSortButton';

/**
 * Reusable hook for sorting and filtering any BreakdownTable data.
 * Returns sorted/filtered rows, current sort/minBets state, and an onApply handler.
 */
export function useTableSort<T extends StatsBreakdownRow>(rows: T[]) {
  const [sortBy, setSortBy] = useState<SortKey>('roi');
  const [minBets, setMinBets] = useState(0);

  const onApply = useCallback((newSort: SortKey, newMin: number) => {
    setSortBy(newSort);
    setMinBets(newMin);
  }, []);

  const sortedRows = useMemo(() => {
    let filtered = minBets > 0 ? rows.filter((r) => r.totalBets >= minBets) : rows;
    return [...filtered].sort((a, b) => {
      switch (sortBy) {
        case 'roi': return b.roi - a.roi;
        case 'winRate': return b.winRate - a.winRate;
        case 'totalBets': return b.totalBets - a.totalBets;
        case 'profitLoss': return b.profitLoss - a.profitLoss;
        default: return 0;
      }
    });
  }, [rows, sortBy, minBets]);

  return { sortedRows, sortBy, minBets, onApply };
}
