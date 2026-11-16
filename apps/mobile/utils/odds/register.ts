import type { Sport } from '@betintel/shared';
import type { BoletinBuilderItem } from '../../stores/boletinBuilderStore';
import type { SlipLeg } from './slip';
import type { HouseId, OddsEventView } from './types';

/** Builder item id for a leg registered at a house. */
const itemId = (l: { eventKey: string; selectionKey: string }, house: HouseId) => `${l.eventKey}|${l.selectionKey}|${house}`;

/**
 * Converts slip legs to boletim builder items using the chosen house's own market/selection text
 * and participant names (the settlement engine parses that text). Legs without a live price/labels at the house are returned in `missing`.
 */
export function toBuilderItems(
  legs: SlipLeg[],
  house: HouseId,
  views: Map<string, OddsEventView | null>,
): { items: BoletinBuilderItem[]; missing: SlipLeg[] } {
  const items: BoletinBuilderItem[] = [];
  const missing: SlipLeg[] = [];
  for (const leg of legs) {
    const view = views.get(leg.eventKey);
    const row = view?.rows.find((r) => r.key === leg.selectionKey);
    const price = row?.prices[house];
    const label = row?.labels[house];
    if (!view || !row || !price || price.suspended || !label) {
      missing.push(leg);
      continue;
    }
    // The house's own names: its market/selection text was written against them.
    const names = view.names?.[house] ?? view.event;
    items.push({
      id: itemId(leg, house),
      homeTeam: names.home,
      awayTeam: names.away,
      competition: view.event.competition,
      sport: view.sport as Sport,
      market: label.market,
      selection: label.selection,
      oddValue: price.odds,
      eventDate: view.event.startsAt,
    });
  }
  return { items, missing };
}

/** True when any item's odd differs from the one shown before (keyed by item id). */
export function oddsChanged(before: Partial<Record<string, number>>, items: BoletinBuilderItem[]): boolean {
  return items.some((it) => before[it.id] !== undefined && before[it.id] !== it.oddValue);
}

/** True when an in-progress boletim would be overwritten. */
export function needsReplaceConfirm(builder: { items: unknown[] }): boolean {
  return builder.items.length > 0;
}

/**
 * The house the builder is locked to: set when every item was registered from that house's odds
 * (ids end with `|house`) and the site is that house. Changing the site would save one house's
 * text and odds under another, so the confirmation screen hides the site selector.
 */
export function lockedHouse(
  pendingHouse: HouseId | null,
  builder: { siteSlug: string; items: Array<{ id: string }> },
): HouseId | null {
  if (!pendingHouse || builder.siteSlug !== pendingHouse || builder.items.length === 0) return null;
  return builder.items.every((i) => i.id.endsWith(`|${pendingHouse}`)) ? pendingHouse : null;
}

/** True when the saved boletim is exactly this slip registered at this house. */
export function slipMatchesSaved(
  legs: SlipLeg[],
  pendingHouse: HouseId | null,
  saved: { siteSlug: string; items: Array<{ id: string }> },
): boolean {
  if (!pendingHouse || saved.siteSlug !== pendingHouse || legs.length === 0) return false;
  const want = new Set(legs.map((l) => itemId(l, pendingHouse)));
  const have = new Set(saved.items.map((i) => i.id));
  return want.size === have.size && [...want].every((id) => have.has(id));
}
