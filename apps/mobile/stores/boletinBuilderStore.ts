import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { BoletinDetail, CreateBoletinInput } from '@betintel/shared';
import { createBoletinRequest } from '../services/boletinService';

export interface BoletinBuilderItem {
  id: string;
  eventId: string;
  siteId: string;
  market: string;
  selection: string;
  oddValue: number;
  event: {
    league: string;
    homeTeam: string;
    awayTeam: string;
    eventDate: string;
  };
  site: {
    id: string;
    slug: string;
    name: string;
    logoUrl: string | null;
  };
}

interface BuilderStateValues {
  items: BoletinBuilderItem[];
  stake: number;
  name: string;
  notes: string;
  isPublic: boolean;
  totalOdds: number;
  potentialReturn: number;
}

interface BoletinBuilderStore extends BuilderStateValues {
  addItem: (item: BoletinBuilderItem) => void;
  removeItem: (id: string) => void;
  setStake: (stake: number) => void;
  setName: (name: string) => void;
  setNotes: (notes: string) => void;
  setPublic: (value: boolean) => void;
  reset: () => void;
  save: () => Promise<BoletinDetail>;
}

const DEFAULT_STATE: BuilderStateValues = {
  items: [],
  stake: 0,
  name: '',
  notes: '',
  isPublic: false,
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
  return {
    name: state.name.trim() || undefined,
    notes: state.notes.trim() || undefined,
    isPublic: state.isPublic,
    stake: state.stake,
    items: state.items.map((item) => ({
      eventId: item.eventId,
      siteId: item.siteId,
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
      setPublic: (isPublic) => set((state) => ({ ...state, isPublic })),
      reset: () => set(withComputed(DEFAULT_STATE)),
      save: async () => {
        const state = get();

        if (state.items.length === 0) {
          throw new Error('Adiciona pelo menos uma seleção ao boletin.');
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
      name: 'betintel-boletin-builder',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        items: state.items,
        stake: state.stake,
        name: state.name,
        notes: state.notes,
        isPublic: state.isPublic,
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