// SKELETON: becomes the full Enterprise Home (search, filters, add brand, people) in a later step.
import { Link } from 'react-router-dom'
import { ENTERPRISE, SEED_MEMBERSHIPS, SEED_STUDIES, SEED_USERS, SEED_WORKSPACES } from '@/domain/registry'
import { CURRENT_DEMO_USER_ID } from '@/domain/scope'
import { accessLabel, can, visibleWorkspaces } from '@/domain/permissions'

export default function EnterpriseHome() {
  const user = SEED_USERS.find((u) => u.id === CURRENT_DEMO_USER_ID)
  const brands = visibleWorkspaces(user, SEED_MEMBERSHIPS, SEED_WORKSPACES)
  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto w-full max-w-5xl p-6">
        <h1 className="text-xl font-semibold text-foreground">{ENTERPRISE.name}</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">Preview: brand workspaces and people are demo data stored in this browser. There are no logins yet.</p>
        <p className="mt-3 inline-block rounded-full border border-border bg-card px-2.5 py-1 text-xs text-foreground">Viewing as: {user?.name ?? 'Unknown user'} · demo, not a login</p>

        <div className="mt-5 overflow-hidden rounded-[14px] border border-border bg-card">
          {brands.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-muted-foreground">You don't have access to any brand yet.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40 text-left text-xs text-muted-foreground">
                  <th className="px-5 py-2.5 font-medium">Brand</th>
                  <th className="px-3 py-2.5 font-medium">Category</th>
                  <th className="px-3 py-2.5 text-right font-medium">Studies</th>
                  <th className="px-3 py-2.5 font-medium">Your access</th>
                  <th className="px-5 py-2.5 text-right font-medium" />
                </tr>
              </thead>
              <tbody>
                {brands.map((w) => {
                  const studies = SEED_STUDIES.filter((s) => s.workspaceId === w.id)
                  const canOpen = can(user, SEED_MEMBERSHIPS, 'analyse', w.id) && studies.some((s) => s.config.bundled)
                  return (
                    <tr key={w.id} className="border-b border-border last:border-b-0">
                      <td className="px-5 py-3 font-medium text-foreground">{w.name}</td>
                      <td className="px-3 py-3 text-muted-foreground">{w.category}</td>
                      <td className="px-3 py-3 text-right tabular-nums text-foreground">{studies.length}</td>
                      <td className="px-3 py-3 text-muted-foreground">{accessLabel(user, SEED_MEMBERSHIPS, w.id)}</td>
                      <td className="px-5 py-3 text-right">
                        {canOpen ? (
                          <Link to="/home" className="text-sm font-medium text-primary hover:underline">Open →</Link>
                        ) : (
                          <span className="text-xs text-muted-foreground">{studies.length === 0 ? 'No studies yet' : 'No data access'}</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}
