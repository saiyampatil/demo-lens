import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { setDemoUserId, setScope } from '@/domain/scope'
import { visibleWorkspaces } from '@/domain/permissions'
import { SEED_USERS, SEED_MEMBERSHIPS, SEED_WORKSPACES, SEED_STUDIES } from '@/domain/registry'
import { Button } from '@/components/ui/button'
import { X } from 'lucide-react'


const DEMO_IDENTITIES = [
  { id: 'u-company-admin', name: 'Company Admin', role: 'company_admin' },
  { id: 'u-insights-lead', name: 'Insights Lead', role: 'company_insights' },
  { id: 'u-campa-admin', name: 'Campa Brand Admin', role: 'brand_admin' },
  { id: 'u-campa-researcher', name: 'Campa Researcher', role: 'researcher' },
  { id: 'u-campa-viewer', name: 'Campa Viewer', role: 'viewer' },
  { id: 'u-independence-researcher', name: 'Independence Researcher', role: 'researcher' },
]


interface LoginFormValues {
  email: string
  password: string
}


export default function LoginPage() {
  const [form, setForm] = useState<LoginFormValues>({ email: '', password: '' })
  const [selectedDemo, setSelectedDemo] = useState<{ id: string; name: string; role: string } | null>(null)
  const navigate = useNavigate()
  const storedDemoId = localStorage.getItem('demoUserId')


  // If already logged in as demo, redirect to enterprise
  if (storedDemoId) {
    setDemoUserId(storedDemoId)
    return null
  }


  // Compute visible workspaces for the selected demo identity
  const computeVisibleWorkspaces = (userId: string) => {
    const user = SEED_USERS.find((u) => u.id === userId)
    const memberships = SEED_MEMBERSHIPS.filter((m) => m.userId === userId)
    return visibleWorkspaces(user, memberships, SEED_WORKSPACES)
  }


  if (selectedDemo) {
    const visible = computeVisibleWorkspaces(selectedDemo.id)
    // Set the scope to the first visible workspace + study
    const firstStudy = SEED_STUDIES.find((s) => s.workspaceId === visible[0]?.id)
    if (firstStudy) {
      setScope({ workspaceId: visible[0]!.id, studyId: firstStudy.id })
      setDemoUserId(selectedDemo.id)
      localStorage.setItem('demoUserId', selectedDemo.id)
      navigate('/enterprise', { replace: true })
    }
    return null
  }


  return (
    <div className="min-h-screen bg-background p-6 sm:p-8">
      <div className="max-w-md mx-auto space-y-4">
        {/* Title */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1.5 text-primary">
            <X className="h-3.5 w-3.5 shrink-0" /> Demo Access
          </div>
          <h1 className="text-2xl font-bold text-foreground mb-2">Pulse AI Lens</h1>
          <p className="text-muted-foreground">Mock login for founder presentation</p>
        </div>


        {/* Form Section */}
        <div className="bg-card border border-border rounded-[14px] p-6" style={{ maxWidth: '400px' }}>
          <h2 className="text-xl font-semibold text-foreground mb-4">Sign in</h2>
          <form className="space-y-4">
            <div>
              <label className="text-sm text-foreground mb-1">Email address</label>
              <input
                type="email"
                placeholder="Email address"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                required
                className="w-full rounded-[10px] border border-border px-3 py-2 text-sm focus-outline-none focus:ring-2 focus:ring-primary/40"
              />
            </div>
            <div>
              <label className="text-sm text-foreground mb-1">Password</label>
              <input
                type="password"
                placeholder="Password"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                required
                className="w-full rounded-[10px] border border-border px-3 py-2 text-sm focus-outline-none focus:ring-2 focus:ring-primary/40"
              />
            </div>
            <Button type="submit" className="w-full">Sign in</Button>
          </form>
        </div>


        {/* Demo Access Section */}
        <div className="bg-card border border-border rounded-[14px] p-6" style={{ maxWidth: '400px' }}>
          <h2 className="text-xl font-semibold text-foreground mb-4">or continue as</h2>
          <p className="text-sm text-muted-foreground mb-4">Select a demo identity to explore the app:</p>
          <select
            value={selectedDemo?.id ?? ''}
            onChange={(e: React.ChangeEvent<HTMLSelectElement>) => {
              const id = e.target.value
              setSelectedDemo(DEMO_IDENTITIES.find((d) => d.id === id) ?? null)
            }}
            className="w-full rounded-[10px] border border-border px-3 py-2 text-sm focus-outline-none focus:ring-2 focus:ring-primary/40 bg-background appearance-none"
          >
            <option value="">Choose an identity</option>
            {DEMO_IDENTITIES.map((identity) => (
              <option key={identity.id} value={identity.id}>
                {identity.name} ({identity.role})
              </option>
            ))}
          </select>
          {selectedDemo && (() => {
              const role = selectedDemo.role
              return (
                <p className="mt-4 text-xs text-muted-foreground">
                  {role === 'company_admin' && ('Full access to all brands and people management')}
                  {role === 'company_insights' && ('Read and analyse access across all brands')}
                  {role === 'brand_admin' && ('Full access to Campa brand: storyboards, analytics, export, manage members')}
                  {role === 'researcher' && ('View access: storyboards, analyse, export')}
                  {role === 'viewer' && ('View access: storyboards only')}
                </p>
              )
            })()}
          <p className="mt-4 text-xs text-muted-foreground">
            This is a demo environment. No real credentials are validated.
            Identities preserved across sessions via localStorage.
          </p>
        </div>
      </div>
    </div>
  )
}