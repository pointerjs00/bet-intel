import { useCallback } from 'react';
import { Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { useToast } from '../components/ui/Toast';
import { fetchOddsEvent } from '../services/oddsService';
import { useBoletinBuilderStore } from '../stores/boletinBuilderStore';
import { useOddsSlipStore } from '../stores/oddsSlipStore';
import { BETTING_SITES } from '../utils/sportAssets';
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

/** Returns a function that registers the odds multiple at a house through the Novo boletim builder. */
export function useRegisterInHouse() {
  const router = useRouter();
  const { showToast } = useToast();

  return useCallback(async (legs: SlipLeg[], house: HouseId, shownOdds?: Partial<Record<string, number>>) => {
    const builder = useBoletinBuilderStore.getState();
    if (needsReplaceConfirm(builder) && !(await confirmReplace(builder.items.length))) return;

    const keys = [...new Set(legs.map((l) => l.eventKey))];
    let views: Map<string, OddsEventView | null>;
    try {
      const fetched = await Promise.all(keys.map((k) => fetchOddsEvent(k)));
      views = new Map(keys.map((k, i) => [k, fetched[i] ?? null]));
    } catch {
      showToast('Não foi possível obter as odds. Tenta novamente.', 'error');
      return;
    }

    const { items, missing } = toBuilderItems(legs, house, views);
    const houseName = BETTING_SITES.find((s) => s.slug === house)?.name ?? house.charAt(0).toUpperCase() + house.slice(1);
    if (missing.length) {
      showToast(`A ${houseName} já não tem odd para ${missing.length} ${missing.length === 1 ? 'seleção' : 'seleções'}`, 'error');
      return;
    }

    const b = useBoletinBuilderStore.getState();
    b.reset();
    b.setSiteSlug(house);
    for (const it of items) b.addItem(it);
    useOddsSlipStore.getState().setPendingHouse(house);

    if (shownOdds && oddsChanged(shownOdds, items)) showToast('Odds atualizadas', 'info');
    router.push('/boletins/confirmar');
  }, [router, showToast]);
}
