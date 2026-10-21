// SKELETON: becomes a stored, editable registry in a later step. Demo data only.
import type { Enterprise, Membership, Study, User, Workspace } from './types'

const SEEDED_AT = '2026-01-01T00:00:00.000Z'

export const ENTERPRISE: Enterprise = { id: 'rcpl', name: 'Reliance Consumer Products Limited' }

export const SEED_WORKSPACES: Workspace[] = [
  { id: 'campa', enterpriseId: 'rcpl', name: 'Campa', category: 'Beverages', code: 'CAMPA', createdAt: SEEDED_AT, archived: false },
  { id: 'independence', enterpriseId: 'rcpl', name: 'Independence', category: 'Packaged foods', code: 'INDEP', createdAt: SEEDED_AT, archived: false },
]

export const SEED_STUDIES: Study[] = [
  {
    id: 'campa-beverage-tracker',
    workspaceId: 'campa',
    name: 'Campa Beverage Tracker',
    type: 'tracker',
    createdAt: SEEDED_AT,
    config: {
      focusBrandCode: 1,
      comparisonBrandCode: 3,
      brands: [
        { code: 1, label: 'Campa' },
        { code: 2, label: 'Thums Up' },
        { code: 3, label: 'Coca-Cola' },
        { code: 4, label: 'Pepsi' },
        { code: 5, label: 'Sprite' },
      ],
      weightVariable: 'wt',
      weightTargets: { AGE: { 1: 26, 2: 32, 3: 24, 4: 18 }, GENDER: { 1: 50, 2: 50 } },
      bundled: true,
    },
  },
]

// Demo people. These are NOT logins: the app has no accounts until a backend exists.
export const SEED_USERS: User[] = [
  { id: 'u-company-admin', name: 'Company admin (demo)', email: 'admin@demo.lens', companyRole: 'company_admin', active: true },
  { id: 'u-insights-lead', name: 'Insights lead (demo)', email: 'insights@demo.lens', companyRole: 'company_insights', active: true },
  { id: 'u-campa-admin', name: 'Campa brand admin (demo)', email: 'campa.admin@demo.lens', companyRole: null, active: true },
  { id: 'u-campa-researcher', name: 'Campa researcher (demo)', email: 'campa.research@demo.lens', companyRole: null, active: true },
  { id: 'u-campa-viewer', name: 'Campa viewer (demo)', email: 'campa.viewer@demo.lens', companyRole: null, active: true },
  { id: 'u-independence-researcher', name: 'Independence researcher (demo)', email: 'indep.research@demo.lens', companyRole: null, active: true },
]

export const SEED_MEMBERSHIPS: Membership[] = [
  { userId: 'u-campa-admin', workspaceId: 'campa', role: 'brand_admin' },
  { userId: 'u-campa-researcher', workspaceId: 'campa', role: 'researcher' },
  { userId: 'u-campa-viewer', workspaceId: 'campa', role: 'viewer' },
  { userId: 'u-independence-researcher', workspaceId: 'independence', role: 'researcher' },
]
