import { BETTING_SITES } from '../../utils/sportAssets';

/** Display name of a betting house (falls back to the slug). */
export function houseName(slug: string): string {
  return BETTING_SITES.find((s) => s.slug === slug)?.name ?? slug;
}
