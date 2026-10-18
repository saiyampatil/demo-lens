import { useLocation } from 'react-router-dom'

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
        <div className="text-xs font-mono text-muted-foreground px-2.5 py-1 rounded-md bg-muted/70 border border-border">
          Market: India · Waves: All (3)
        </div>
      </div>
    </header>
  )
}
