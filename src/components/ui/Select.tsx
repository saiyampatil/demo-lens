import { ChevronDown } from 'lucide-react'

interface SelectOption {
  value: string
  label: string
}

interface SelectProps {
  value: string
  onChange: (value: string) => void
  options: SelectOption[]
  label: string
  disabled?: boolean
  className?: string
}

export default function Select({ value, onChange, options, label, disabled, className }: SelectProps) {
  return (
    <span className="relative inline-flex items-center">
      <select
        value={value}
        aria-label={label}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className={`h-8 appearance-none rounded-[10px] border border-border bg-background px-2.5 pr-8 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 disabled:cursor-not-allowed disabled:opacity-50 ${className ?? ''}`}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2 h-3.5 w-3.5 text-muted-foreground" aria-hidden />
    </span>
  )
}
