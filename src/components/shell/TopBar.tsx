import { useLocation } from 'react-router-dom'
import { useLensStore } from '@/store/useLensStore'

const pageTitles: Record<string, string> = {
  '/home': 'Home',
  '/waves': 'Waves',
  '/cross-tabs': 'Cross-tabs',
  '/ask': 'Ask AI',
  '/weights': 'Weights',
  '/storyboards': 'Storyboards',
}

export default function TopBar() {
  const location = useLocation()
  const pageName = pageTitles[location.pathname] || 'Home'
  const waveScope = useLensStore((state) => state.waveScope)
  const setWaveScope = useLensStore((state) => state.setWaveScope)

  return (
    <header className="h-[56px] min-h-[56px] border-b border-border bg-card px-6 flex items-center justify-between shrink-0">
      {/* Left Breadcrumb */}
      <div className="flex items-center gap-2 text-sm">
        <span className="text-muted-foreground font-medium">Campa Beverage Tracker</span>
        <span className="text-muted-foreground/60">/</span>
        <span className="text-foreground font-semibold">{pageName}</span>
      </div>

      {/* Right Scope Display */}
      <div className="flex items-center gap-2">
        <span className="text-xs font-sans text-muted-foreground">Market: India</span>
        <span className="text-xs font-sans text-muted-foreground/60">·</span>
        <select
          value={waveScope}
          onChange={(e) => setWaveScope(e.target.value as 'All' | 'Oct-25' | 'Jan-26' | 'Apr-26')}
          className="text-xs font-sans text-muted-foreground bg-muted/70 border border-border rounded-md px-2.5 py-1 focus:outline-none focus:ring-2 focus:ring-primary/50 cursor-pointer"
        >
          <option value="All">Waves: All (3)</option>
          <option value="Oct-25">Oct-25</option>
          <option value="Jan-26">Jan-26</option>
          <option value="Apr-26">Apr-26</option>
        </select>
      </div>
    </header>
  )
}
