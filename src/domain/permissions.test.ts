import { describe, expect, it } from 'vitest'
import { SEED_MEMBERSHIPS as M, SEED_USERS, SEED_WORKSPACES as W } from './registry'
import { accessLabel, can, canCompany, landingFor, visibleWorkspaces } from './permissions'
import type { User } from './types'

const u = (id: string): User => SEED_USERS.find((x) => x.id === id)!
const names = (user: User | undefined) => visibleWorkspaces(user, M, W).map((w) => w.id)

describe('Permissions', () => {
  it('company admin manages brands and people but cannot see research data', () => {
    const a = u('u-company-admin')
    expect(canCompany(a, 'create_brand')).toBe(true)
    expect(canCompany(a, 'manage_users')).toBe(true)
    expect(names(a)).toEqual(['campa', 'independence'])
    expect(can(a, M, 'manage_members', 'campa')).toBe(true)
    expect(can(a, M, 'analyse', 'campa')).toBe(false)
    expect(can(a, M, 'view_storyboards', 'independence')).toBe(false)
    expect(accessLabel(a, M, 'campa')).toBe('Company admin (manage people only)')
  })

  it('company insights reads and analyses every brand but cannot change data or teams', () => {
    const i = u('u-insights-lead')
    expect(names(i)).toEqual(['campa', 'independence'])
    expect(can(i, M, 'analyse', 'campa')).toBe(true)
    expect(can(i, M, 'analyse', 'independence')).toBe(true)
    expect(can(i, M, 'upload_wave', 'campa')).toBe(false)
    expect(can(i, M, 'manage_members', 'campa')).toBe(false)
    expect(canCompany(i, 'create_brand')).toBe(false)
  })

  it('brand users only see their own brand', () => {
    const r = u('u-campa-researcher')
    expect(names(r)).toEqual(['campa'])
    expect(can(r, M, 'analyse', 'campa')).toBe(true)
    expect(can(r, M, 'manage_groupings', 'campa')).toBe(true)
    expect(can(r, M, 'upload_wave', 'campa')).toBe(false)
    expect(can(r, M, 'analyse', 'independence')).toBe(false)
    expect(names(u('u-independence-researcher'))).toEqual(['independence'])
  })

  it('brand admin runs their own brand only', () => {
    const b = u('u-campa-admin')
    for (const act of ['upload_wave', 'manage_weights', 'create_study', 'manage_members'] as const) expect(can(b, M, act, 'campa')).toBe(true)
    expect(can(b, M, 'manage_members', 'independence')).toBe(false)
    expect(canCompany(b, 'create_brand')).toBe(false)
  })

  it('viewer can only read storyboards', () => {
    const v = u('u-campa-viewer')
    expect(can(v, M, 'view_storyboards', 'campa')).toBe(true)
    expect(can(v, M, 'analyse', 'campa')).toBe(false)
    expect(can(v, M, 'export', 'campa')).toBe(false)
  })

  it('deactivated users lose all access at once', () => {
    const off = { ...u('u-campa-admin'), active: false }
    expect(names(off)).toEqual([])
    expect(can(off, M, 'analyse', 'campa')).toBe(false)
  })

  it('landing: single-brand users go straight in; company roles see the brand list; others get no access', () => {
    expect(landingFor(u('u-campa-researcher'), M, W)).toEqual({ kind: 'workspace', workspaceId: 'campa' })
    expect(landingFor(u('u-company-admin'), M, W)).toEqual({ kind: 'enterprise' })
    expect(landingFor({ id: 'x', name: 'x', email: 'x', companyRole: null, active: true }, M, W)).toEqual({ kind: 'no_access' })
  })
})
