import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Plus, User, Search, Filter, Shield, Trash2, X } from 'lucide-react'
import { ENTERPRISE, SEED_MEMBERSHIPS, SEED_STUDIES, SEED_USERS, SEED_WORKSPACES } from '@/domain/registry'
import { currentDemoUserId, setDemoUserId } from '@/domain/scope'
import { accessLabel, can, canCompany, visibleWorkspaces, roleIn, ROLE_LABEL } from '@/domain/permissions'
import { Button } from '@/components/ui/button'
import Select from '@/components/ui/Select'
import PageHeader from '@/components/PageHeader'
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '@/components/ui/card'

type BrandRole = 'brand_admin' | 'researcher' | 'viewer'

interface RoleOption {
  value: BrandRole
  label: string
}

const ROLE_OPTIONS: RoleOption[] = [
  { value: 'brand_admin', label: 'Brand admin' },
  { value: 'researcher', label: 'Researcher' },
  { value: 'viewer', label: 'Viewer' },
]

export default function EnterpriseHome() {
  // ---- UI state ----
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [openAddBrand, setOpenAddBrand] = useState(false)
  const [openManagePeople, setOpenManagePeople] = useState(false)
  const [managingWorkspace, setManagingWorkspace] = useState<{ id: string; name: string } | null>(null)

  // ---- Form state ----
  const [newBrandName, setNewBrandName] = useState('')
  const [newBrandCategory, setNewBrandCategory] = useState('')
  const [newBrandCode, setNewBrandCode] = useState('')
  const [newMemberUserId, setNewMemberUserId] = useState('')
  const [newMemberRole, setNewMemberRole] = useState('researcher')

  // ---- Demo data (seeded from registry, editable in this demo session) ----
  const [workspaces, setWorkspaces] = useState(() => [...SEED_WORKSPACES])
  const [memberships, setMemberships] = useState(() => [...SEED_MEMBERSHIPS])
  const [users] = useState(() => [...SEED_USERS])
  const [studies] = useState(() => [...SEED_STUDIES])

  // ---- Demo user ----
  const [demoUserId, setDemoUserIdLocal] = useState(currentDemoUserId())

  // Persist demo user choice to the store whenever it changes
  useEffect(() => {
    setDemoUserId(demoUserId)
  }, [demoUserId])

  const user = users.find((u) => u.id === demoUserId)
  const canCreateBrand = canCompany(user, 'create_brand')

  // ---- Derived data ----
  const categories = [...new Set(workspaces.map((w) => w.category))].sort()

  let filtered = visibleWorkspaces(user, memberships, workspaces)
  if (search.trim()) {
    const q = search.trim().toLowerCase()
    filtered = filtered.filter((w) => w.name.toLowerCase().includes(q) || w.code.toLowerCase().includes(q))
  }
  if (categoryFilter !== 'all') {
    filtered = filtered.filter((w) => w.category === categoryFilter)
  }

  // Track the currently selected brand for navigation
  const [selectedBrand, setSelectedBrand] = useState<{ id: string; name: string } | null>(null)
  // ---- Handlers ----
  const handleAddBrand = (e: React.FormEvent) => {
    e.preventDefault()
    if (!newBrandName.trim() || !newBrandCode.trim()) return
    const id = `brand-${Date.now()}`
    const newWorkspace = {
      id,
      enterpriseId: ENTERPRISE.id,
      name: newBrandName.trim(),
      category: newBrandCategory.trim() || 'General',
      code: newBrandCode.trim().toUpperCase(),
      createdAt: new Date().toISOString(),
      archived: false,
    }
    setWorkspaces((prev) => [...prev, newWorkspace])
    setNewBrandName('')
    setNewBrandCategory('')
    setNewBrandCode('')
    setOpenAddBrand(false)
  }

  const handleAddMember = (e: React.FormEvent) => {
    e.preventDefault()
    if (!managingWorkspace || !newMemberUserId) return
    const alreadyMember = memberships.some(
      (m) => m.userId === newMemberUserId && m.workspaceId === managingWorkspace.id
    )
    if (alreadyMember) {
      setNewMemberUserId('')
      return
    }
    setMemberships((prev) => [
      ...prev,
      { userId: newMemberUserId, workspaceId: managingWorkspace.id, role: newMemberRole as BrandRole },
    ])
    setNewMemberUserId('')
    setNewMemberRole('researcher')
  }

  const handleChangeMemberRole = (userId: string, role: BrandRole) => {
    if (!managingWorkspace) return
    setMemberships((prev) =>
      prev.map((m) =>
        m.userId === userId && m.workspaceId === managingWorkspace.id ? { ...m, role } : m
      )
    )
  }

  const handleRemoveMember = (userId: string) => {
    if (!managingWorkspace) return
    setMemberships((prev) =>
      prev.filter((m) => !(m.userId === userId && m.workspaceId === managingWorkspace.id))
    )
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto w-full max-w-5xl p-6">
        <PageHeader
          title={ENTERPRISE.name}
          description="Manage brands (workspaces), people, and access across the enterprise."
        />

        {/* Company header with summary stats */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 mb-6">
          {/* Total Brands Card */}
          <Card>
            <CardHeader>
              <CardTitle>Total Brands</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-foreground">
                {workspaces.length}
              </div>
              <p className="text-sm text-muted-foreground">across the enterprise</p>
            </CardContent>
          </Card>

          {/* Accessible Brands Card */}
          <Card>
            <CardHeader>
              <CardTitle>Accessible Brands</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-foreground">
                {visibleWorkspaces(user, memberships, workspaces).length}
              </div>
              <p className="text-sm text-muted-foreground">visible to you</p>
            </CardContent>
          </Card>

          {/* Total Studies Card */}
          <Card>
            <CardHeader>
              <CardTitle>Total Studies</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-foreground">
                {studies.length}
              </div>
              <p className="text-sm text-muted-foreground">across all brands</p>
            </CardContent>
        <div className="mb-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-2 w-full sm:w-auto max-w-md">
            <Search className="h-4 w-4 text-muted-foreground shrink-0" />
            <input
              type="text"
              placeholder="Search brands by name or code…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="flex-1 h-8 pl-2 pr-8 text-sm text-foreground bg-background border border-transparent focus:border-primary/40 focus:ring-1 focus:ring-primary rounded-[10px] outline-none"
            />
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <Filter className="h-4 w-4 text-muted-foreground shrink-0" />
            <Select
              value={categoryFilter}
              onChange={setCategoryFilter}
              options={[
                { value: 'all', label: 'All categories' },
                ...categories.map((c) => ({ value: c, label: c })),
              ]}
              label="Category"
            />
          </div>

          {canCreateBrand && (
            <Button onClick={() => setOpenAddBrand(true)} size="sm">
              <Plus className="h-3.5 w-3.5 shrink-0" /> Add brand
            </Button>
          )}
        </div>

        {/* Brands table */}
        <div className="overflow-hidden rounded-[14px] border border-border bg-card">
          {filtered.length === 0 ? (
            <div className="px-5 py-8 text-center">
              <Shield className="h-6 w-6 mx-auto mb-2 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                {search.trim() || categoryFilter !== 'all'
                  ? 'No brands match your filters.'
                  : user
                  ? "You don't have access to any brand yet."
                  : 'No brands available.'}
              </p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40 text-left text-xs text-muted-foreground">
                  <th className="px-5 py-3 font-medium">Brand</th>
                  <th className="px-3 py-3 font-medium">Category</th>
                  <th className="px-3 py-3 text-right font-medium">Studies</th>
                  <th className="px-3 py-3 font-medium">Your access</th>
                  <th className="px-5 py-3 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((w) => {
                  const brandStudies = studies.filter((s) => s.workspaceId === w.id)
                  const ownRole = roleIn(memberships, user?.id ?? '', w.id)
                  const canOpen = can(user, memberships, 'analyse', w.id) && brandStudies.some((s) => s.config.bundled)
                  const canManage = can(user, memberships, 'manage_members', w.id)

                  return (
                    <tr key={w.id} className="border-b border-border last:border-b-0 hover:bg-muted/30 transition-colors">
                      <td className="px-5 py-3">
                        <div className="font-medium text-foreground">{w.name}</div>
                        <div className="text-[11px] text-muted-foreground">{w.code}</div>
                      </td>
                      <td className="px-3 py-3">
                        <span className="inline-block px-2 py-0.5 rounded-md border border-border bg-muted text-[10px] text-muted-foreground font-medium">
                          {w.category}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-right tabular-nums text-foreground">
                        {brandStudies.length}
                      </td>
                      <td className="px-3 py-3">
                        {ownRole ? (
                          <span className="text-xs font-medium text-foreground">{ROLE_LABEL[ownRole]}</span>
                        ) : (
                          <span className="text-xs text-muted-foreground">{accessLabel(user, memberships, w.id)}</span>
                        )}
                      </td>
                      <td className="px-5 py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          {canOpen ? (
                            <>
                              <Link
                                to="/home"
                                onClick={(e) => {
                                  e.preventDefault()
                                  setScope({ workspaceId: w.id, studyId: brandStudies[0]?.id ?? 'campa-beverage-tracker' })
                                  setSelectedBrand({ id: w.id, name: w.name })
                                }}
                                className="text-sm font-medium text-primary hover:underline"
                              >
                                Open →
                              </Link>
                            </>
                          ) : brandStudies.length === 0 ? (
                            <span className="text-xs text-muted-foreground">
                              {w.id === 'independence' ? 'No studies for Independence brand' : 'No studies'}
                            </span>
                          ) : (
                            <span className="text-xs text-muted-foreground">No data access</span>
                          )}
                          {canManage && (
                            <Button
                              onClick={() => {
                                setManagingWorkspace({ id: w.id, name: w.name })
                                setOpenManagePeople(true)
                              }}
                              variant="outline"
                              size="xs"
                              className="h-6 px-2"
                            >
                              <User className="h-3 w-3 shrink-0" /> People
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* ---- Dialogs ---- */}
        {/* Add brand dialog */}
        {openAddBrand && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div
              className="fixed inset-0 bg-black/40 backdrop-blur-sm"
              onClick={() => setOpenAddBrand(false)}
            />
            <div className="relative bg-card border border-border rounded-[14px] p-6 w-full max-w-md shadow-xl z-10">
              <h2 className="text-lg font-semibold text-foreground mb-4">Add brand</h2>
              <form onSubmit={handleAddBrand} className="space-y-3">
                <div className="space-y-2">
                  <label className="text-xs text-muted-foreground block">Brand name</label>
                  <input
                    type="text"
                    value={newBrandName}
                    onChange={(e) => setNewBrandName(e.target.value)}
                    placeholder="e.g. Campa"
                    className="w-full h-8 rounded-[10px] border border-border bg-background px-2.5 text-sm text-foreground focus:border-primary/40 focus:ring-1 focus:ring-primary outline-none"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs text-muted-foreground block">Category</label>
                  <input
                    type="text"
                    value={newBrandCategory}
                    onChange={(e) => setNewBrandCategory(e.target.value)}
                    placeholder="e.g. Beverages"
                    className="w-full h-8 rounded-[10px] border border-border bg-background px-2.5 text-sm text-foreground focus:border-primary/40 focus:ring-1 focus:ring-primary outline-none"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs text-muted-foreground block">Code</label>
                  <input
                    type="text"
                    value={newBrandCode}
                    onChange={(e) => setNewBrandCode(e.target.value)}
                    placeholder="e.g. CAMPA"
                    className="w-full h-8 rounded-[10px] border border-border bg-background px-2.5 text-sm text-foreground focus:border-primary/40 focus:ring-1 focus:ring-primary outline-none uppercase"
                  />
                </div>
                <div className="mt-6 flex items-center justify-end gap-2">
                  <Button variant="outline" size="sm" onClick={() => setOpenAddBrand(false)}>
                    Cancel
                  </Button>
                  <Button type="submit" size="sm" disabled={!newBrandName.trim() || !newBrandCode.trim()}>
                    Create brand
                  </Button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Manage people dialog */}
        {openManagePeople && managingWorkspace && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div
              className="fixed inset-0 bg-black/40 backdrop-blur-sm"
              onClick={() => setOpenManagePeople(false)}
            />
            <div className="relative bg-card border border-border rounded-[14px] p-6 w-full max-w-lg shadow-xl z-10">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-foreground">Manage people — {managingWorkspace.name}</h2>
                <Button variant="ghost" size="icon-xs" onClick={() => setOpenManagePeople(false)}>
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>

              {/* Current members */}
              <div className="mb-5">
                <p className="text-xs text-muted-foreground mb-2">Members</p>
                <div className="overflow-hidden rounded-lg border border-border bg-background">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border text-left text-[10px] text-muted-foreground uppercase">
                        <th className="px-4 py-2.5 font-medium">User</th>
                        <th className="px-4 py-2.5 font-medium">Email</th>
                        <th className="px-4 py-2.5 font-medium text-right">Role</th>
                        <th className="px-4 py-2.5 font-medium text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {memberships
                        .filter((m) => m.workspaceId === managingWorkspace.id)
                        .map((m) => {
                          const u = users.find((x) => x.id === m.userId)
                          return (
                            <tr key={m.userId} className="border-b border-border last:border-b-0">
                              <td className="px-4 py-3">
                                <div className="font-medium text-foreground">{u?.name ?? m.userId}</div>
                              </td>
                              <td className="px-4 py-3 text-muted-foreground">
                                {u?.email ?? ''}
                              </td>
                              <td className="px-4 py-3 text-right">
                                <Select
                                  value={m.role}
                                  onChange={(role) => handleChangeMemberRole(m.userId, role as BrandRole)}
                                  options={ROLE_OPTIONS}
                                  label="Role"
                                  className="w-32"
                                />
                              </td>
                              <td className="px-4 py-3 text-right">
                                <Button
                                  variant="destructive"
                                  size="xs"
                                  onClick={() => handleRemoveMember(m.userId)}
                                  className="h-6 px-2"
                                >
                                  <Trash2 className="h-3 w-3 shrink-0" />
                                </Button>
                              </td>
                            </tr>
                          )
                        })}
                    </tbody>
                  </table>
                </div>
                {memberships.every((m) => m.workspaceId !== managingWorkspace.id) && (
                  <p className="mt-2 px-4 py-2 text-xs text-muted-foreground">No members yet.</p>
                )}
              </div>

              {/* Add member form */}
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground mb-2">Add member</p>
                <form onSubmit={handleAddMember} className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
                  <div className="col-span-1 sm:col-span-2">
                    <label className="text-xs text-muted-foreground block mb-1">Select user</label>
                    <Select
                      value={newMemberUserId}
                      onChange={setNewMemberUserId}
                      options={users
                        .filter((u) => !memberships.some((mm) => mm.userId === u.id && mm.workspaceId === managingWorkspace.id))
                        .map((u) => ({ value: u.id, label: `${u.name} (${u.email})` }))}
                      label="User"
                    />
                  </div>
                  <div className="col-span-1 sm:col-span-1">
                    <label className="text-xs text-muted-foreground block mb-1">Role</label>
                    <Select
                      value={newMemberRole}
                      onChange={(v) => setNewMemberRole(v as BrandRole)}
                      options={ROLE_OPTIONS}
                      label="Role"
                    />
                  </div>
                  <Button type="submit" size="sm" disabled={!newMemberUserId}>
                    Add
                  </Button>
                </form>
              </div>

              <div className="mt-6 flex items-center justify-end gap-2">
                <Button variant="outline" size="sm" onClick={() => setOpenManagePeople(false)}>
                  Done
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
