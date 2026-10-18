import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'

export type WaveScope = 'All' | 'Oct-25' | 'Jan-26' | 'Apr-26'

export interface LensState {
  waveScope: WaveScope
  weighted: boolean
  savedResults: unknown[]
  setWaveScope: (scope: WaveScope) => void
  setWeighted: (weighted: boolean) => void
  addSavedResult: (result: unknown) => void
}

export const useLensStore = create<LensState>()(
  persist(
    (set) => ({
      waveScope: 'All',
      weighted: true,
      savedResults: [],
      setWaveScope: (scope: WaveScope) => set({ waveScope: scope }),
      setWeighted: (weighted: boolean) => set({ weighted }),
      addSavedResult: (result: unknown) => set((state) => ({ savedResults: [...state.savedResults, result] })),
    }),
    {
      name: 'lens-storage',
      storage: createJSONStorage(() => localStorage),
    }
  )
)