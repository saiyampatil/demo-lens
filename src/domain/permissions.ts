// The single place that decides who may do what. Every page will ask here.
// In this browser-only version this is a demo of the rules, not security.
import type { BrandAction, BrandRole, CompanyAction, Membership, User, Workspace } from './types'

export const BRAND_ROLE_ACTIONS: Record<BrandRole, readonly BrandAction[]> = {
  brand_admin: ['view_storyboards', 'analyse', 'edit_storyboards', 'export', 'manage_groupings', 'upload_wave', 'manage_weights', 'create_study', 'manage_members'],
  researcher: ['view_storyboards', 'analyse', 'edit_storyboards', 'export', 'manage_groupings'],
  viewer: ['view_storyboards'],
}
// Company insights: read and analyse every brand, but never change its data or team.
const INSIGHTS_ACTIONS: readonly BrandAction[] = ['view_storyboards', 'analyse', 'edit_storyboards', 'export']
// Company admin: manages brands and people, but has no research-data access by default.
const COMPANY_ADMIN_BRAND_ACTIONS: readonly BrandAction[] = ['manage_members']

export const ROLE_LABEL: Record<BrandRole, string> = { brand_admin: 'Brand admin', researcher: 'Researcher', viewer: 'Viewer' }

export function roleIn(memberships: readonly Membership[], userId: string, workspaceId: string): BrandRole | null {
  return memberships.find((m) => m.userId === userId && m.workspaceId === workspaceId)?.role ?? null
}

export function canCompany(user: User | undefined, action: CompanyAction): boolean {
  if (!user || !user.active) return false
  if (action === 'see_all_brands') return user.companyRole === 'company_admin' || user.companyRole === 'company_insights'
  return user.companyRole === 'company_admin'
}

export function can(user: User | undefined, memberships: readonly Membership[], action: BrandAction, workspaceId: string): boolean {
  if (!user || !user.active) return false
  const own = roleIn(memberships, user.id, workspaceId)
  if (own && BRAND_ROLE_ACTIONS[own].includes(action)) return true
  if (user.companyRole === 'company_insights' && INSIGHTS_ACTIONS.includes(action)) return true
  if (user.companyRole === 'company_admin' && COMPANY_ADMIN_BRAND_ACTIONS.includes(action)) return true
  return false
}

/** Brands a user can see in lists. Brand users never see brands they are not a member of. */
export function visibleWorkspaces(user: User | undefined, memberships: readonly Membership[], workspaces: readonly Workspace[]): Workspace[] {
  if (!user || !user.active) return []
  const live = workspaces.filter((w) => !w.archived)
  if (canCompany(user, 'see_all_brands')) return live
  const mine = new Set(memberships.filter((m) => m.userId === user.id).map((m) => m.workspaceId))
  return live.filter((w) => mine.has(w.id))
}

export type Landing = { kind: 'enterprise' } | { kind: 'workspace'; workspaceId: string } | { kind: 'no_access' }

/** Where a user lands after signing in: company roles and multi-brand users see the brand list; single-brand users go straight in. */
export function landingFor(user: User | undefined, memberships: readonly Membership[], workspaces: readonly Workspace[]): Landing {
  const visible = visibleWorkspaces(user, memberships, workspaces)
  if (!user || visible.length === 0) return { kind: 'no_access' }
  if (user.companyRole || visible.length > 1) return { kind: 'enterprise' }
  return { kind: 'workspace', workspaceId: visible[0]!.id }
}

/** How to describe a user's access to one brand, for lists. */
export function accessLabel(user: User | undefined, memberships: readonly Membership[], workspaceId: string): string {
  if (!user) return 'No access'
  const own = roleIn(memberships, user.id, workspaceId)
  if (own) return ROLE_LABEL[own]
  if (user.companyRole === 'company_insights') return 'Company insights (read and analyse)'
  if (user.companyRole === 'company_admin') return 'Company admin (manage people only)'
  return 'No access'
}
