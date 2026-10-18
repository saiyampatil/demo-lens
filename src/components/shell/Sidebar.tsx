import { NavLink } from 'react-router-dom'
import {
  Home,
  Activity,
  Table2,
  Sparkles,
  Scale,
  LayoutDashboard,
  ChevronDown,
} from 'lucide-react'

const navItems = [
  { name: 'Home', path: '/home', icon: Home },
  { name: 'Waves', path: '/waves', icon: Activity },
  { name: 'Cross-tabs', path: '/cross-tabs', icon: Table2 },
  { name: 'Ask AI', path: '/ask', icon: Sparkles },
  { name: 'Weights', path: '/weights', icon: Scale },
  { name: 'Storyboards', path: '/storyboards', icon: LayoutDashboard },
]

export default function Sidebar() {
  return (
    <aside className="w-[240px] min-w-[240px] max-w-[240px] h-screen bg-card border-r border-border flex flex-col justify-between shrink-0">
      {/* Top Header & Navigation */}
      <div className="flex flex-col">
        {/* Brand / Logo */}
        <div className="h-14 px-4 flex items-center gap-2.5 border-b border-border">
          <div className="w-7 h-7 rounded-md bg-primary flex items-center justify-center text-primary-foreground font-semibold text-sm shadow-xs">
            L
          </div>
          <span className="font-semibold text-foreground text-sm tracking-tight">
            Pulse AI Lens
          </span>
        </div>

        {/* Project Switcher */}
        <div className="p-3">
          <button
            type="button"
            className="w-full text-left p-2.5 rounded-lg border border-border bg-background hover:bg-muted/60 transition-colors flex items-center justify-between group"
          >
            <div className="min-w-0 pr-1">
              <div className="text-xs font-semibold text-foreground truncate">
                Campa Beverage Tracker
              </div>
              <div className="text-[11px] text-muted-foreground truncate">
                India · 3 waves
              </div>
            </div>
            <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0 group-hover:text-foreground transition-colors" />
          </button>
        </div>

        {/* Navigation Items */}
        <nav className="px-2 space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon
            return (
              <NavLink
                key={item.path}
                to={item.path}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                    isActive
                      ? 'bg-secondary text-primary font-medium'
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted/70 font-normal'
                  }`
                }
              >
                <Icon className="w-4 h-4 shrink-0 stroke-[1.75]" />
                <span>{item.name}</span>
              </NavLink>
            )
          })}
        </nav>
      </div>

      {/* User Avatar & Role at Bottom */}
      <div className="p-3 border-t border-border">
        <div className="flex items-center gap-2.5 p-1.5">
          <div className="w-8 h-8 rounded-full bg-secondary text-primary font-semibold text-xs flex items-center justify-center shrink-0">
            R
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-xs font-medium text-foreground truncate">
              Researcher
            </div>
            <div className="text-[11px] text-muted-foreground truncate">
              Insights team
            </div>
          </div>
        </div>
      </div>
    </aside>
  )
}
