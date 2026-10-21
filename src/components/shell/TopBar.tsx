import { useState } from 'react'
import { useLocation } from 'react-router-dom'
import { useScope } from '@/domain/scope'
import { ENTERPRISE, SEED_WORKSPACES, SEED_STUDIES } from '@/domain/registry'
import Select from '@/components/ui/Select'

const pageTitles: Record<string, string> = {
  '/home': 'Home',
  '/waves': 'Waves',
  '/cross-tabs': 'Cross-tabs',
  '/ask': 'Ask AI',
  '/weights': 'Weights',
  '/storyboards': 'Storyboards',
  '/groupings': 'Groupings',
  '/enterprise': 'Enterprise Home',
}

export default function TopBar() {
  const location = useLocation()
  const { workspaceId, studyId } = useScope()

  // ---- Brand filter state ----
  const [categoryFilter, setCategoryFilter] = useState('all')

  const pageName = pageTitles[location.pathname] || 'Home'

  // Resolve brand + study names for breadcrumb context
  const workspace = ENTERPRISE && SEED_WORKSPACES.find((w) => w.id === workspaceId)
  const study = SEED_STUDIES.find((s) => s.id === studyId)

  // Build breadcrumb segments: Enterprise > Brand > Study > Page
  const segments: string[] = [ENTERPRISE.name]
  if (workspace) segments.push(workspace.name)
  if (study) segments.push(study.name)
  if (pageName !== 'Home') segments.push(pageName)

  return (
    <header className="h-[56px] min-h-[56px] border-b border-border bg-card px-6 flex items-center justify-between shrink-0">
      {/* Left Breadcrumb */}
      <div className="flex items-center gap-1 text-sm">
        {segments.map((seg, i) => (
          <span key={i} className="flex items-center">
            {i > 0 && (
              <span className="text-muted-foreground/40 mx-1">/</span>
            )}
            <span
              className={`text-muted-foreground font-medium ${
                i === segments.length - 1 ? 'text-foreground font-semibold' : ''
              }`}
            >
              {seg}
            </span>
          </span>
        ))}
      </div>

      {/* Right Scope Display */}
      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        <span>Market: India</span>
        {workspaceId && (
          <Select
            value={categoryFilter ?? 'all'}
            onChange={(v) => setCategoryFilter(v as string)}
            options={[
              { value: 'all', label: 'All brands' },
              ...[...SEED_WORKSPACES.map((w) => w.category)].sort().map((cat) => ({
                value: cat,
                label: cat,
              })),
            ]}
            label="Category"
            className="w-24"
          />
        )}
      </div>
    </header>
  )
}
