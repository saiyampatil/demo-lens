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
        <span className="text-xs font-sans text-muted-foreground">Market: India</span>
      </div>
    </header>
  )
}
