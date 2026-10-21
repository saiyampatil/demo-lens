// SKELETON: becomes the remembered "current brand, study and demo user" in a later step.
import type { Scope } from './types'


export const DEFAULT_SCOPE: Scope = { workspaceId: 'campa', studyId: 'campa-beverage-tracker' }
export const CURRENT_SCOPE: Scope = DEFAULT_SCOPE
// Demo only ("Viewing as"), not a login.
export const DEFAULT_DEMO_USER_ID = 'u-campa-admin'
export const CURRENT_DEMO_USER_ID: string = DEFAULT_DEMO_USER_ID
export function currentDemoUserId(): string {
  return localStorage.getItem('demoUserId') ?? DEFAULT_DEMO_USER_ID
}
export function setDemoUserId(id: string): void {
  localStorage.setItem('demoUserId', id)
}
export function currentScope(): Scope {
  const raw = localStorage.getItem('scope')
  return raw ? (JSON.parse(raw) as Scope) : DEFAULT_SCOPE
}
export function setScope(scope: Scope): void {
  localStorage.setItem('scope', JSON.stringify(scope))
}
export function scopedKey(name: string): string {
  return name
}