import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { type Filter } from '@/engine/crosstab'

export type WaveScope = 'All' | 'Oct-25' | 'Jan-26' | 'Apr-26'

export interface CrossTabConfig {
  row: string
  column: 'TOTAL' | 'WAVE' | string
  filters: Filter[]
  stat: 'colpct' | 'counts'
  decimals: 0 | 1
}

export interface LensState {
  waveScope: WaveScope
  weighted: boolean
  savedResults: unknown[]
  crossTab: CrossTabConfig
  setWaveScope: (scope: WaveScope) => void
  setWeighted: (weighted: boolean) => void
  addSavedResult: (result: unknown) => void
  setCrossTab: (partial: Partial<CrossTabConfig>) => void
}

export const useLensStore = create<LensState>()(
  persist(
    (set) => ({
      waveScope: 'All',
      weighted: true,
      savedResults: [],
      crossTab: {
        row: 'Q1',
        column: 'WAVE',
        filters: [],
        stat: 'colpct',
        decimals: 0,
      },
      setWaveScope: (scope: WaveScope) => set({ waveScope: scope }),
      setWeighted: (weighted: boolean) => set({ weighted }),
      addSavedResult: (result: unknown) => set((state) => ({ savedResults: [...state.savedResults, result] })),
      setCrossTab: (partial: Partial<CrossTabConfig>) =>
        set((state) => ({ crossTab: { ...state.crossTab, ...partial } })),
    }),
    {
      name: 'lens-storage',
      storage: createJSONStorage(() => localStorage),
    }
  )
)