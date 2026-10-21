import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { type Filter } from '@/engine/crosstab'
import type { Scope } from '@/domain/types'

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
  askHistory: { id: number; question: string }[]
  scope: Scope
  demoUserId: string
  setWaveScope: (scope: WaveScope) => void
  setWeighted: (weighted: boolean) => void
  addSavedResult: (result: unknown) => void
  setCrossTab: (partial: Partial<CrossTabConfig>) => void
  openCrossTab: (view: { row: string; column: string; filters: Filter[] }, navigate: (to: string) => void) => void
  addAskQuestion: (question: string) => void
  clearAskHistory: () => void
  setScope: (scope: Scope) => void
  setDemoUserId: (id: string) => void
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
      askHistory: [],
      scope: { workspaceId: 'campa', studyId: 'campa-beverage-tracker' },
      demoUserId: 'u-campa-admin',
      setWaveScope: (scope: WaveScope) => set({ waveScope: scope }),
      setWeighted: (weighted: boolean) => set({ weighted }),
      addSavedResult: (result: unknown) => set((state) => ({ savedResults: [...state.savedResults, result] })),
      addAskQuestion: (question: string) =>
        set((state) => ({ askHistory: [...state.askHistory, { id: Date.now(), question }].slice(-30) })),
      clearAskHistory: () => set({ askHistory: [] }),
      setCrossTab: (partial: Partial<CrossTabConfig>) =>
        set((state) => ({ crossTab: { ...state.crossTab, ...partial } })),
      setScope: (scope: Scope) => set({ scope }),
      setDemoUserId: (id: string) => set({ demoUserId: id }),
      openCrossTab: (view: { row: string; column: string; filters: Filter[] }, navigate: (to: string) => void) => {
        set((state) => ({ crossTab: { ...state.crossTab, row: view.row, column: view.column, filters: view.filters } }))
        navigate('/cross-tabs')
      },
    }),
    {
      name: 'lens-storage',
      storage: createJSONStorage(() => localStorage),
    }
  )
)