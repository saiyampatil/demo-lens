import type { Scope } from './types'
import { useLensStore } from '@/store/useLensStore'




export const DEFAULT_SCOPE: Scope = { workspaceId: 'campa', studyId: 'campa-beverage-tracker' }
export const CURRENT_SCOPE: Scope = DEFAULT_SCOPE
// Demo only ("Viewing as"), not a login.
export const DEFAULT_DEMO_USER_ID = 'u-campa-admin'
export const CURRENT_DEMO_USER_ID: string = DEFAULT_DEMO_USER_ID
// Backed by the persisted lens store so the TopBar re-renders on change.
export const useScope = (): Scope => useLensStore((s) => s.scope)
export const currentScope = (): Scope => useLensStore.getState().scope
export const setScope = (scope: Scope): void => useLensStore.getState().setScope(scope)
export const currentDemoUserId = (): string => useLensStore.getState().demoUserId
export const setDemoUserId = (id: string): void => useLensStore.getState().setDemoUserId(id)
export function scopedKey(name: string): string {
  return name
}