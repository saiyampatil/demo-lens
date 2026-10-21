export type StudyType = 'tracker' | 'one-off'
export interface Enterprise { id: string; name: string }
// A workspace is shown as "Brand" in the UI.
export interface Workspace { id: string; enterpriseId: string; name: string; category: string; code: string; createdAt: string; archived: boolean }
// Answer options on brand questions inside a study. These are NOT workspaces.
export interface StudyBrandOption { code: number; label: string }
export interface StudyConfig {
  focusBrandCode: number
  comparisonBrandCode: number
  brands: StudyBrandOption[]
  weightVariable: string
  weightTargets: Record<string, Record<number, number>>
  bundled: boolean
}
export interface Study { id: string; workspaceId: string; name: string; type: StudyType; createdAt: string; config: StudyConfig }
export interface Scope { workspaceId: string; studyId: string }

// ---- People and access ----
export type CompanyRole = 'company_admin' | 'company_insights'
export type BrandRole = 'brand_admin' | 'researcher' | 'viewer'
export interface User { id: string; name: string; email: string; companyRole: CompanyRole | null; active: boolean }
// One key to one brand. Access is per brand for now; per-study access can be added later.
export interface Membership { userId: string; workspaceId: string; role: BrandRole }
export type BrandAction =
  | 'view_storyboards'
  | 'analyse'
  | 'edit_storyboards'
  | 'export'
  | 'manage_groupings'
  | 'upload_wave'
  | 'manage_weights'
  | 'create_study'
  | 'manage_members'
export type CompanyAction = 'create_brand' | 'manage_users' | 'see_all_brands'
