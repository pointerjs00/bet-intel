import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { BoletinDetail, CreateBoletinInput, Sport } from '@betintel/shared';
import { createBoletinRequest } from '../services/boletinService';
import { parseDDMMYYYYToISO } from '../utils/formatters';

function todayDDMMYYYY(): string {
  const d = new Date();
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}/${d.getFullYear()}`;
}

export interface BoletinBuilderItem {
  id: string;
  homeTeam: string;
  homeTeamImageUrl?: string | null;
  awayTeam: string;
  awayTeamImageUrl?: string | null;
  competition: string;
  sport: Sport;
  market: string;
  selection: string;
  oddValue: number;
}

interface BuilderStateValues {
  items: BoletinBuilderItem[];
  stake: number;
  name: string;
  notes: string;
  siteSlug: string;
  betDate: string; // DD/MM/YYYY display string, or '' for today
  isPublic: boolean;
  isFreebet: boolean;
  totalOdds: number;
  potentialReturn: number;
}

interface BoletinBuilderStore extends BuilderStateValues {
  addItem: (item: BoletinBuilderItem) => void;
  removeItem: (id: string) => void;
  setStake: (stake: number) => void;
  setName: (name: string) => void;
  setNotes: (notes: string) => void;
  setSiteSlug: (siteSlug: string) => void;
  setBetDate: (betDate: string) => void;
  setPublic: (value: boolean) => void;
  setFreebet: (value: boolean) => void;
  reset: () => void;
  save: () => Promise<BoletinDetail>;
}

const DEFAULT_STATE: BuilderStateValues = {
  items: [],
  stake: 0,
  name: '',
  notes: '',
  siteSlug: '',
  betDate: todayDDMMYYYY(),
  isPublic: false,
  isFreebet: false,
  totalOdds: 1,
  potentialReturn: 0,
};

function withComputed(state: BuilderStateValues): BuilderStateValues {
  const totalOdds = state.items.reduce((acc, item) => acc * item.oddValue, 1);
  const potentialReturn = state.items.length > 0 ? state.stake * totalOdds : 0;

  return {
    ...state,
    totalOdds: Number(totalOdds.toFixed(4)),
    potentialReturn: Number(potentialReturn.toFixed(2)),
  };
}

function buildCreatePayload(state: BuilderStateValues): CreateBoletinInput {
  const betDateISO = state.betDate.length === 10 ? parseDDMMYYYYToISO(state.betDate) : null;
  // Smart default name from selections
  let name = state.name.trim();
  if (!name && state.items.length > 0) {
    const first = state.items[0]!;
    name = state.items.length === 1
      ? `${first.homeTeam} vs ${first.awayTeam}`
      : `${first.homeTeam} vs ${first.awayTeam} + ${state.items.length - 1}`;
  }
  return {
    name: name || undefined,
    notes: state.notes.trim() || undefined,
    siteSlug: state.siteSlug.trim() || undefined,
    betDate: betDateISO ?? undefined,
    isPublic: state.isPublic,
    isFreebet: state.isFreebet,
    stake: state.stake,
    items: state.items.map((item) => ({
      homeTeam: item.homeTeam,
      awayTeam: item.awayTeam,
      competition: item.competition,
      sport: item.sport,
      market: item.market,
      selection: item.selection,
      oddValue: item.oddValue,
    })),
  };
}

/** Persistent builder store for in-progress boletins across screens. */
export const useBoletinBuilderStore = create<BoletinBuilderStore>()(
  persist(
    (set, get) => ({
      ...DEFAULT_STATE,
      addItem: (item) =>
        set((state) => {
          const withoutDuplicate = state.items.filter((existing) => existing.id !== item.id);
          return withComputed({
            ...state,
            items: [...withoutDuplicate, item],
          });
        }),
      removeItem: (id) =>
        set((state) =>
          withComputed({
            ...state,
            items: state.items.filter((item) => item.id !== id),
          }),
        ),
      setStake: (stake) =>
        set((state) =>
          withComputed({
            ...state,
            stake,
          }),
        ),
      setName: (name) => set((state) => ({ ...state, name })),
      setNotes: (notes) => set((state) => ({ ...state, notes })),
      setSiteSlug: (siteSlug) => set((state) => ({ ...state, siteSlug })),
      setBetDate: (betDate) => set((state) => ({ ...state, betDate })),
      setPublic: (isPublic) => set((state) => ({ ...state, isPublic })),
      setFreebet: (isFreebet) => set((state) => ({ ...state, isFreebet })),
      reset: () => set(withComputed({ ...DEFAULT_STATE, betDate: todayDDMMYYYY() })),
      save: async () => {
        const state = get();

        if (state.items.length === 0) {
          throw new Error('Adiciona pelo menos uma seleção ao boletim.');
        }

        if (state.stake <= 0) {
          throw new Error('Define um valor de aposta superior a zero.');
        }

        const created = await createBoletinRequest(buildCreatePayload(state));
        set(withComputed(DEFAULT_STATE));
        return created;
      },
    }),
    {
      name: 'betintel-boletim-builder',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        items: state.items,
        stake: state.stake,
        name: state.name,
        notes: state.notes,
        betDate: state.betDate,
        isPublic: state.isPublic,
        isFreebet: state.isFreebet,
      }),
      merge: (persistedState, currentState) => ({
        ...currentState,
        ...withComputed({
          ...DEFAULT_STATE,
          ...(persistedState as Partial<BuilderStateValues>),
        }),
      }),
    },
  ),
);