import { useCallback, useRef } from 'react';
import { Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { useToast } from '../components/ui/Toast';
import { fetchOddsEvent } from '../services/oddsService';
import { useBoletinBuilderStore } from '../stores/boletinBuilderStore';
import { useOddsSlipStore } from '../stores/oddsSlipStore';
import { houseName } from '../components/odds/houseName';
import { needsReplaceConfirm, oddsChanged, toBuilderItems } from '../utils/odds/register';
import type { SlipLeg } from '../utils/odds/slip';
import type { HouseId, OddsEventView } from '../utils/odds/types';

function confirmReplace(count: number): Promise<boolean> {
  return new Promise((resolve) => {
    Alert.alert(
      'Boletim em curso',
      `Já tens um boletim em curso (${count} ${count === 1 ? 'seleção' : 'seleções'}). Substituir?`,
      [
        { text: 'Cancelar', style: 'cancel', onPress: () => resolve(false) },
        { text: 'Substituir', style: 'destructive', onPress: () => resolve(true) },
      ],
      { cancelable: true, onDismiss: () => resolve(false) },
    );
  });
}

/** Options of a registration. */
export interface RegisterOptions {
  /** Odds shown to the user, keyed by builder item id; a difference shows "Odds atualizadas". */
  shownOdds?: Partial<Record<string, number>>;
  /** Stake to carry into the builder (ignored when not positive). */
  stake?: number;
  /** True when called from a modal route: it is dismissed before opening the confirmation. */
  fromModal?: boolean;
}

/**
 * Fills the Novo boletim builder with the legs at `house` (that house's own text, odds and names)
 * and opens the confirmation. Resolves true only when it navigated; false when the user cancelled
 * the replace prompt or the odds could not be used.
 */
async function registerInHouse(
  router: ReturnType<typeof useRouter>,
  showToast: ReturnType<typeof useToast>['showToast'],
  legs: SlipLeg[],
  house: HouseId,
  opts: RegisterOptions,
): Promise<boolean> {
  const builder = useBoletinBuilderStore.getState();
  if (needsReplaceConfirm(builder) && !(await confirmReplace(builder.items.length))) return false;

  const keys = [...new Set(legs.map((l) => l.eventKey))];
  let views: Map<string, OddsEventView | null>;
  try {
    const fetched = await Promise.all(keys.map((k) => fetchOddsEvent(k)));
    views = new Map(keys.map((k, i) => [k, fetched[i] ?? null]));
  } catch {
    showToast('Não foi possível obter as odds. Tenta novamente.', 'error');
    return false;
  }

  const { items, missing } = toBuilderItems(legs, house, views);
  if (missing.length) {
    showToast(`A ${houseName(house)} já não tem odd para ${missing.length} ${missing.length === 1 ? 'seleção' : 'seleções'}`, 'error');
    return false;
  }

  const b = useBoletinBuilderStore.getState();
  b.reset();
  b.setSiteSlug(house);
  for (const it of items) b.addItem(it);
  if (opts.stake !== undefined && opts.stake > 0) b.setStake(opts.stake);
  useOddsSlipStore.getState().setPendingHouse(house);

  if (opts.shownOdds && oddsChanged(opts.shownOdds, items)) showToast('Odds atualizadas', 'info');
  if (opts.fromModal && router.canDismiss()) router.dismiss();
  router.push('/boletins/confirmar');
  return true;
}

/**
 * Returns a function that registers odds legs at a house through the Novo boletim builder.
 * It resolves true only when it navigated to the confirmation (false if cancelled, failed or busy).
 */
export function useRegisterInHouse() {
  const router = useRouter();
  const { showToast } = useToast();
  const inFlight = useRef(false);

  return useCallback(async (legs: SlipLeg[], house: HouseId, opts: RegisterOptions = {}): Promise<boolean> => {
    if (inFlight.current) return false;
    inFlight.current = true;
    try {
      return await registerInHouse(router, showToast, legs, house, opts);
    } finally {
      inFlight.current = false;
    }
  }, [router, showToast]);
}
