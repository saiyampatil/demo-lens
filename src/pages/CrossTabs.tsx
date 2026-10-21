import { useEffect, useMemo, useState, type DragEvent, type HTMLAttributes } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bar, BarChart, CartesianGrid, Cell as BarCell, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useLensStore, type WaveScope } from '@/store/useLensStore'
import { crosstab, type Filter } from '@/engine/crosstab'
import PageHeader from '@/components/PageHeader'
import Select from '@/components/ui/Select'
import { QUESTIONS, WAVES, BRANDS, type QuestionDef } from '@/engine/questions'
import { buildGroupedRows, describeDef, setApplied, useApplied, useGroupings } from '@/engine/groupings'

type Result = ReturnType<typeof crosstab>
type ResultRow = Result['rows'][number]
type ResultCell = NonNullable<ResultRow['cells'][string]>
type ChartType = 'line' | 'column' | 'hbar' | 'stacked'
type ViewMode = 'table' | 'chart' | 'both'
type Zone = 'rows' | 'columns' | 'filters'
type DragItem = { id: string; from: Zone | 'list' }
type MCol = { id: string; label: string; group: string | null }
type MRow = { id: string | number; label: string; cells: Record<string, ResultCell> }
type ListItem = { id: string; label: string; type: string; wording?: string }
type StoreState = ReturnType<typeof useLensStore.getState>
type LabelProps = { x?: number | string; y?: number | string; width?: number | string; height?: number | string; index?: number; value?: unknown }

const PURPLE = '#6B47D6'
const INK = '#1A1A1A'
const MUTED = '#717680'
const GREYS = ['#C9C6D3', '#A9A5B8', '#8E8A9E', '#B8B4C6', '#D9D6E3']
// Clearly different shades for non-brand rows (e.g. Male vs Female)
const SERIES = ['#6B47D6', '#A9A5B8', '#3F2A8C', '#C4ADF6', '#77728A']
const BRAND_FOCUS = 'Campa'

const PROFILE_IDS = ['AGE', 'GENDER', 'CITY', 'SEC']
const COLUMN_IDS = ['WAVE', ...PROFILE_IDS]
const FILTER_IDS = [...PROFILE_IDS, 'Q3']
const WEIGHTING_VARS = ['AGE', 'GENDER']
const COL_LABEL: Record<string, string> = {
  WAVE: 'Wave', AGE: 'Age group', GENDER: 'Gender', CITY: 'City type', SEC: 'Socio-economic class', TOTAL: 'Total',
}

const FILTER_VARIABLES: { id: string; label: string; options: { code: number | string; label: string }[] }[] = [
  { id: 'wave', label: 'Wave', options: WAVES.map((w) => ({ code: w, label: w })) },
  { id: 'AGE', label: 'Age group', options: QUESTIONS.AGE!.options!.map((o) => ({ code: o.code, label: o.label })) },
  { id: 'GENDER', label: 'Gender', options: QUESTIONS.GENDER!.options!.map((o) => ({ code: o.code, label: o.label })) },
  { id: 'CITY', label: 'City type', options: QUESTIONS.CITY!.options!.map((o) => ({ code: o.code, label: o.label })) },
  { id: 'SEC', label: 'Socio-economic class', options: QUESTIONS.SEC!.options!.map((o) => ({ code: o.code, label: o.label })) },
  { id: 'Q3', label: 'Main brand', options: BRANDS.map((b) => ({ code: b.code, label: b.label })) },
]

const SECTION_ORDER = ['Time', 'Profile', 'Brand funnel', 'Consumption', 'Attitudes', 'Advocacy'] as const
const TYPE_TAG: Record<string, string> = { single: 'SINGLE', multi: 'MULTI', numeric: 'NUMERIC', grid: 'GRID', scale: 'SCALE', time: 'TIME' }
const WAVE_ITEM: ListItem = { id: 'WAVE', label: 'Wave', type: 'time', wording: 'Survey wave' }

const qDef = (id: string): QuestionDef | undefined => QUESTIONS[id as keyof typeof QUESTIONS]
const columnLabel = (id: string) => COL_LABEL[id] ?? qDef(id)?.label ?? id
const isBrandQuestion = (id: string) => ['Q1', 'Q2', 'Q3'].includes(id)
const isMeanQuestion = (id: string) => {
  const t = qDef(id)?.type
  return t === 'numeric' || t === 'scale' || t === 'grid'
}
function baseText(id: string): string {
  if (id === 'Q3') return 'respondents who tried at least one brand'
  if (id === 'Q4' || id === 'Q6') return 'respondents with a main brand'
  if (id === 'Q5') return 'all respondents, excluding "don\'t know"'
  return 'all respondents'
}
const n = (v: number | string | undefined) => (typeof v === 'number' ? v : Number(v ?? 0))

function makeLabel(opts: { sigs: number[]; showValue: boolean; showSig: boolean; fmt: (v: number) => string; color: string; horizontal?: boolean }) {
  const ChartLabel = (p: LabelProps) => {
    const value = typeof p.value === 'number' ? p.value : null
    if (value === null) return <g />
    const sig = opts.showSig ? opts.sigs[p.index ?? -1] ?? 0 : 0
    if (!opts.showValue && sig === 0) return <g />
    const text = `${opts.showValue ? opts.fmt(value) : ''}${sig === 1 ? ' ▲' : sig === -1 ? ' ▼' : ''}`.trim()
    const fill = sig === 1 ? '#15803D' : sig === -1 ? '#C0362C' : opts.color
    const x = n(p.x)
    const y = n(p.y)
    const w = n(p.width)
    const h = n(p.height)
    if (opts.horizontal) {
      return <text x={x + w + 6} y={y + h / 2} dominantBaseline="middle" fontSize={12} fill={fill}>{text}</text>
    }
    return <text x={x + (w ? w / 2 : 0)} y={y - 8} textAnchor="middle" fontSize={12} fill={fill}>{text}</text>
  }
  return ChartLabel
}

function Chip({ label, onRemove, attrs, tone = 'default' }: { label: string; onRemove?: () => void; attrs?: HTMLAttributes<HTMLSpanElement>; tone?: 'default' | 'primary' }) {
  return (
    <span
      {...attrs}
      className={`inline-flex max-w-full items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium ${
        tone === 'primary' ? 'border-primary/30 bg-primary/10 text-primary' : 'border-border bg-card text-foreground'
      } ${attrs?.draggable ? 'cursor-grab active:cursor-grabbing' : ''}`}
    >
      {attrs?.draggable && <span className="text-muted-foreground" aria-hidden="true">⠿</span>}
      <span className="truncate">{label}</span>
      {onRemove && (
        <button type="button" aria-label={`Remove ${label}`} onClick={onRemove} className="ml-0.5 rounded text-muted-foreground hover:text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40">
          ✕
        </button>
      )}
    </span>
  )
}

const card = 'rounded-[14px] border border-border bg-card'
const ctrl = 'h-8 rounded-[10px] border border-border bg-background px-2.5 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40'
const seg = (on: boolean) =>
  `px-3 py-1.5 text-xs font-medium transition-colors ${on ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground'} disabled:opacity-40 disabled:hover:bg-transparent`

export default function CrossTabs() {
  const crossTab = useLensStore((s) => s.crossTab)
  const setCrossTab = useLensStore((s) => s.setCrossTab)
  const waveScope = useLensStore((s) => s.waveScope)
  const setWaveScope = useLensStore((s) => s.setWaveScope)
  const weighted = useLensStore((s) => s.weighted)
  const setWeighted = useLensStore((s) => s.setWeighted)
  const navigate = useNavigate()

  const [search, setSearch] = useState('')
  const [view, setView] = useState<ViewMode>('both')
  const [chartPick, setChartPick] = useState<ChartType | null>(null)
  const [dataLabels, setDataLabels] = useState(true)
  const [showSig, setShowSig] = useState(true)
  const [filterOpen, setFilterOpen] = useState(false)
  const [displayOpen, setDisplayOpen] = useState(false)
  const [zoomAxis, setZoomAxis] = useState(false)
  const [fVar, setFVar] = useState('AGE')
  const [fCodes, setFCodes] = useState<(number | string)[]>([])
  const [toast, setToast] = useState('')
  const [extra, setExtra] = useState<string[]>([]) // additional column groups beyond crossTab.column
  const [drag, setDrag] = useState<DragItem | null>(null)
  const [overZone, setOverZone] = useState<Zone | null>(null)
  const [hint, setHint] = useState('')
  const [menuFor, setMenuFor] = useState<string | null>(null)
  const [showBases, setShowBases] = useState(false)
  const [heat, setHeat] = useState(false)
  const [discoverOpen, setDiscoverOpen] = useState(false)
  const [groupOpen, setGroupOpen] = useState(false)

  useEffect(() => {
    if (!displayOpen && !menuFor && !groupOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setDisplayOpen(false)
        setMenuFor(null)
        setGroupOpen(false)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [displayOpen, menuFor, groupOpen])

  useEffect(() => {
    if (!hint) return
    const t = window.setTimeout(() => setHint(''), 4000)
    return () => window.clearTimeout(t)
  }, [hint])

  // ---------- layout: rows, column groups, filters ----------
  const cols = useMemo((): string[] => {
    if (crossTab.column === 'TOTAL') return []
    if (crossTab.column === 'WAVE') return ['WAVE']
    return [crossTab.column, ...extra.filter((c) => c !== crossTab.column && PROFILE_IDS.includes(c))]
  }, [crossTab.column, extra])

  const multi = cols.length > 1
  const isWaveCols = cols[0] === 'WAVE'
  const rowLabel = columnLabel(crossTab.row)

  const apply = (row: string, list: string[]) => {
    const clean = list.filter((c, i) => list.indexOf(c) === i && c !== row)
    setCrossTab({ row, column: clean[0] ?? 'TOTAL' })
    setExtra(clean.slice(1))
  }
  const canRows = (id: string) => id !== 'WAVE' && !!qDef(id)
  const canColumns = (id: string) => COLUMN_IDS.includes(id) && id !== crossTab.row
  const canFilters = (id: string) => FILTER_IDS.includes(id)
  const accepts = (zone: Zone, item: DragItem) =>
    zone === 'rows' ? canRows(item.id) && item.from !== 'rows' : zone === 'columns' ? canColumns(item.id) : canFilters(item.id) && item.from !== 'filters'

  const setRows = (id: string) => {
    if (!canRows(id)) {
      setHint(`${columnLabel(id)} can only be used in Columns.`)
      return
    }
    apply(id, cols.filter((c) => c !== id))
  }
  const addColumn = (id: string, before?: string) => {
    const label = columnLabel(id)
    if (!COLUMN_IDS.includes(id)) {
      setHint(`${label} can't be used as columns. Columns take profile groups (age, gender, city, class) or Wave.`)
      return
    }
    if (id === crossTab.row) {
      setHint(`${label} is already in Rows.`)
      return
    }
    if (id === 'WAVE') {
      if (cols.some((c) => c !== 'WAVE')) setHint("Wave replaced the other column groups: it can't be combined with them.")
      apply(crossTab.row, ['WAVE'])
      return
    }
    if (isWaveCols) setHint("Wave was replaced: it can't be combined with other column groups.")
    const list = cols.filter((c) => c !== id && c !== 'WAVE')
    const at = before ? list.indexOf(before) : -1
    if (at >= 0) list.splice(at, 0, id)
    else list.push(id)
    apply(crossTab.row, list)
  }
  const removeColumn = (id: string) => apply(crossTab.row, cols.filter((c) => c !== id))
  const openFilterFor = (id: string) => {
    setFVar(id)
    setFCodes(crossTab.filters.find((f) => f.variable === id)?.codes ?? [])
    setFilterOpen(true)
  }
  const canSwap = PROFILE_IDS.includes(crossTab.row) && cols.length === 1 && PROFILE_IDS.includes(cols[0] ?? '')
  const swap = () => {
    if (canSwap) apply(cols[0]!, [crossTab.row])
  }

  // ---------- drag and drop ----------
  const dragAttrs = (id: string, from: DragItem['from']): HTMLAttributes<HTMLElement> => ({
    draggable: true,
    onDragStart: (e: DragEvent<HTMLElement>) => {
      e.dataTransfer.setData('text/plain', id)
      e.dataTransfer.effectAllowed = 'move'
      setDrag({ id, from })
      setMenuFor(null)
    },
    onDragEnd: () => {
      setDrag(null)
      setOverZone(null)
    },
  })
  const handleDrop = (zone: Zone, e: DragEvent<HTMLElement>, before?: string) => {
    e.preventDefault()
    e.stopPropagation()
    const item = drag
    setDrag(null)
    setOverZone(null)
    if (!item) return
    if (zone === 'rows') setRows(item.id)
    else if (zone === 'columns') addColumn(item.id, before)
    else if (!canFilters(item.id)) setHint(`${columnLabel(item.id)} can't be used as a filter.`)
    else {
      if (item.from === 'columns') removeColumn(item.id)
      openFilterFor(item.id)
    }
  }
  const zoneAttrs = (zone: Zone): HTMLAttributes<HTMLDivElement> => ({
    onDragOver: (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault()
      e.dataTransfer.dropEffect = drag && accepts(zone, drag) ? 'move' : 'none'
      if (overZone !== zone) setOverZone(zone)
    },
    onDragLeave: (e: DragEvent<HTMLDivElement>) => {
      if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOverZone(null)
    },
    onDrop: (e: DragEvent<HTMLDivElement>) => handleDrop(zone, e),
  })
  const zoneClass = (zone: Zone) => {
    const base = 'flex min-h-[44px] flex-wrap items-center gap-1.5 rounded-[10px] border border-dashed p-1.5 transition-colors'
    if (!drag) return `${base} border-border`
    if (!accepts(zone, drag)) return `${base} border-border opacity-40`
    return `${base} ${overZone === zone ? 'border-primary bg-primary/10' : 'border-primary/60 bg-primary/5'}`
  }

  // ---------- data ----------
  const q = qDef(crossTab.row)
  const isMean = isMeanQuestion(crossTab.row)
  const isBrand = isBrandQuestion(crossTab.row)
  const isSingle = q?.type === 'single'
  const decimals = Number(crossTab.decimals) === 1 ? 1 : 0
  const scoped = waveScope !== 'All' && !isWaveCols

  const filters = useMemo((): Filter[] => {
    const f: Filter[] = [...crossTab.filters]
    if (scoped) f.push({ variable: 'wave', codes: [waveScope] } as Filter)
    return f
  }, [crossTab.filters, scoped, waveScope])

  const runs = useMemo(
    () => (cols.length ? cols : ['TOTAL']).map((c) => ({ col: c, res: crosstab({ row: crossTab.row, column: c, filters, weighted }) })),
    [cols, crossTab.row, filters, weighted],
  )

  // Merge one run per column group into a single table: Total, then each group's columns.
  const merged = useMemo(() => {
    const first = runs[0]!.res
    const columns: MCol[] = [{ id: 'TOTAL', label: 'Total', group: null }]
    runs.forEach(({ col, res }) => {
      res.columns.filter((c) => c.id !== 'TOTAL').forEach((c) => columns.push({ id: `${col}:${c.id}`, label: c.label, group: col }))
    })
    const rows: MRow[] = first.rows.map((r, i) => {
      const cells: Record<string, ResultCell> = {}
      const total = r.cells['TOTAL']
      if (total) cells.TOTAL = total
      runs.forEach(({ col, res }) => {
        const rr = res.rows[i]
        if (!rr) return
        Object.entries(rr.cells).forEach(([k, v]) => {
          if (k !== 'TOTAL') cells[`${col}:${k}`] = v
        })
      })
      return { id: r.id, label: r.label, cells }
    })
    return { columns, rows }
  }, [runs])

  // ---------- groupings (nets and classifications) ----------
  const defs = useGroupings()
  const applied = useApplied()
  const applicable = defs.filter((d) => d.variables.includes(crossTab.row))
  const grouped = useMemo(
    () => buildGroupedRows({ rowVar: crossTab.row, baseRows: merged.rows, defs, applied, cols, filters, weighted }),
    [crossTab.row, merged.rows, defs, applied, cols, filters, weighted],
  )
  const displayRows = grouped.rows
  const groupingsActive = grouped.active.length > 0
  const chartRows = displayRows.filter((r) => r.kind !== 'member' && (!isMean || !r.pct))
  const clsValue = applicable.some((d) => d.id === applied.classification && d.type === 'classification') ? (applied.classification as string) : 'none'

  const otherCols = merged.columns.filter((c) => c.id !== 'TOTAL')
  const displayColumns = merged.columns
  const baseRow = merged.rows[0]
  const groups = cols.map((c) => ({ id: c, label: columnLabel(c), count: otherCols.filter((x) => x.group === c).length }))
  const groupStarts = new Set(groups.map((g) => otherCols.find((c) => c.group === g.id)?.id).filter((x): x is string => !!x))

  const filterLabel = (f: Filter) => {
    const v = FILTER_VARIABLES.find((x) => x.id === f.variable)
    const labels = f.codes.map((c) => v?.options.find((o) => String(o.code) === String(c))?.label ?? String(c)).join(', ')
    return `${v?.label ?? f.variable}: ${labels}`
  }

  const colsLabel = cols.length ? cols.map(columnLabel).join(' + ') : 'Total'
  const scopeText = [...(scoped ? [`${waveScope} only`] : []), ...crossTab.filters.map(filterLabel)].join(', ') || 'all respondents'
  const sigText = isMean
    ? 'means · not significance-tested'
    : isWaveCols
      ? 'significance vs previous wave at 95%'
      : cols.length === 0
        ? 'no significance test'
        : 'significance vs Total at 95%'
  const statText = isMean ? 'means' : crossTab.stat === 'counts' ? (weighted ? 'weighted counts' : 'counts') : 'column %'
  const definition = `Showing ${q?.label ?? crossTab.row} by ${colsLabel} · ${scopeText} · ${weighted ? 'weighted' : 'unweighted'} · ${statText} · ${sigText}${groupingsActive ? ` · groupings: ${grouped.active.join(', ')}` : ''}`
  const displaySummary = [
    ...(weighted ? [] : ['unweighted']),
    ...(crossTab.stat === 'counts' ? ['counts'] : []),
    ...(decimals === 1 ? ['1 decimal'] : []),
    ...(showBases ? ['bases in cells'] : []),
    ...(heat ? ['heat shading'] : []),
  ].join(' · ')
  const scopeOptions = [{ value: 'All', label: 'All waves' }, ...WAVES.map((w) => ({ value: w, label: w }))]

  const chartValue = (cell: ResultCell, asMean: boolean = isMean): number => {
    if (asMean) return cell.rawValue
    if (crossTab.stat === 'counts') return (cell.rawValue / 100) * (weighted ? cell.weightedBase : cell.unweightedBase)
    return cell.rawValue
  }
  const fmtNumber = (v: number, asMean: boolean = isMean): string => {
    if (asMean) return v.toFixed(decimals === 1 ? 2 : 1)
    if (crossTab.stat === 'counts') return Math.round(v).toLocaleString()
    return decimals === 1 ? `${v.toFixed(1)}%` : `${Math.round(v)}%`
  }
  const fmtCell = (cell: ResultCell, asMean: boolean = isMean): string => (cell.hidden ? '–' : fmtNumber(chartValue(cell, asMean), asMean))

  // ---------- Discover: every profile group tested against Total ----------
  const discover = useMemo(() => {
    if (!discoverOpen || isMean) return []
    const f: Filter[] = [...crossTab.filters]
    if (waveScope !== 'All') f.push({ variable: 'wave', codes: [waveScope] } as Filter)
    const items: { key: string; row: string; group: string; groupId: string; col: string; value: number; total: number; sig: number; base: number }[] = []
    PROFILE_IDS.filter((v) => v !== crossTab.row).forEach((v) => {
      const res = crosstab({ row: crossTab.row, column: v, filters: f, weighted })
      res.rows.forEach((r) => {
        const tot = r.cells['TOTAL']
        if (!tot) return
        res.columns.forEach((c) => {
          if (c.id === 'TOTAL') return
          const cell = r.cells[c.id]
          if (!cell || cell.hidden || cell.significance === 0) return
          items.push({ key: `${v}-${c.id}-${r.id}`, row: r.label, group: columnLabel(v), groupId: v, col: c.label, value: cell.rawValue, total: tot.rawValue, sig: cell.significance, base: cell.unweightedBase })
        })
      })
    })
    return items.sort((a, b) => Math.abs(b.value - b.total) - Math.abs(a.value - a.total))
  }, [discoverOpen, isMean, crossTab.filters, crossTab.row, waveScope, weighted])

  // ---------- chart ----------
  const chartCols = cols.length ? otherCols : []
  const xIsColumns = chartCols.length > 1
  const allowed: Record<ChartType, boolean> = {
    line: xIsColumns && !multi,
    column: true,
    hbar: true,
    stacked: isSingle && !isMean && crossTab.stat === 'colpct' && xIsColumns,
  }
  const defaultType: ChartType = isWaveCols && xIsColumns ? 'line' : 'column'
  const chartType: ChartType = chartPick && allowed[chartPick] ? chartPick : defaultType
  const useRowsOnX = chartType === 'hbar' || !xIsColumns

  const series = chartRows.map((r, i) => ({
    key: `s${i}`,
    label: r.label,
    isFocus: isBrand && r.label === BRAND_FOCUS,
    color: isBrand ? (r.label === BRAND_FOCUS ? PURPLE : GREYS[i % GREYS.length]!) : SERIES[i % SERIES.length]!,
    row: r,
  }))
  const colData = chartCols.map((c) => {
    const d: Record<string, string | number | null> = { name: multi ? `${c.label}` : c.label }
    series.forEach((s) => {
      const cell = s.row.cells[c.id]
      d[s.key] = cell && !cell.hidden ? chartValue(cell) : null
    })
    return d
  })
  const rowData = chartRows.map((r) => {
    const cell = r.cells['TOTAL']
    return { name: r.label, v: cell && !cell.hidden ? chartValue(cell) : null }
  })

  const maxQ = crossTab.row === 'Q6' ? 10 : crossTab.row === 'Q4' ? 5 : null
  const isPct = !isMean && crossTab.stat === 'colpct'
  const zoomable = (chartType === 'line' || chartType === 'column') && isPct
  const effectiveZoom = zoomable && zoomAxis
  const zoomBounds = useMemo(() => {
    if (!effectiveZoom) return null
    const vals: number[] = []
    if (useRowsOnX) {
      rowData.forEach((d) => {
        if (typeof d.v === 'number') vals.push(d.v)
      })
    } else {
      colData.forEach((d) => {
        series.forEach((s) => {
          const v = d[s.key]
          if (typeof v === 'number') vals.push(v)
        })
      })
    }
    if (vals.length === 0) return null
    const lo = Math.max(0, Math.floor(Math.min(...vals) - 5))
    const hi = Math.min(100, Math.ceil(Math.max(...vals) + 5))
    return { lo, hi: Math.max(hi, lo + 1) }
  }, [effectiveZoom, useRowsOnX, rowData, colData, series])
  const yDomain: [number, number | 'auto'] = zoomBounds
    ? [zoomBounds.lo, zoomBounds.hi]
    : chartType === 'stacked' ? [0, 100] : isMean ? [0, maxQ ?? 'auto'] : crossTab.stat === 'counts' ? [0, 'auto'] : [0, 100]
  const tickFmt = (v: unknown) => (typeof v === 'number' ? (isMean || crossTab.stat === 'counts' ? String(v) : `${v}%`) : '')
  const tipFmt = (v: unknown) => (typeof v === 'number' ? fmtNumber(v) : '')
  const sigsFor = (r: MRow) => chartCols.map((c) => (isMean ? 0 : r.cells[c.id]?.significance ?? 0))
  const labelFor = (s: (typeof series)[number], horizontal = false) =>
    makeLabel({
      sigs: horizontal ? [] : sigsFor(s.row),
      showValue: dataLabels && (series.length <= 2 || s.isFocus),
      showSig,
      fmt: fmtNumber,
      color: s.isFocus || !isBrand ? INK : MUTED,
      horizontal,
    })

  // ---------- actions ----------
  const save = () => {
    const now = Date.now()
    const targets = multi ? cols : [crossTab.column]
    const suffix = scopeText !== 'all respondents' ? ` (${scopeText})` : ''
    const items = targets.map((c, i) => ({
      id: `${now + i}`,
      title: `${q?.label ?? crossTab.row} by ${columnLabel(c)}${suffix}`,
      crossTab: { ...crossTab, column: c },
      waveScope,
      weighted,
      view,
      chartType: multi ? 'column' : chartType,
      savedAt: new Date().toISOString(),
    }))
    useLensStore.setState((s: StoreState) => ({ savedResults: [...s.savedResults, ...items] as StoreState['savedResults'] }))
    setToast(groupingsActive ? 'Saved without groupings (slides do not support them yet)' : items.length > 1 ? `Saved ${items.length} slides, one per column group` : 'Saved to storyboard')
    window.setTimeout(() => setToast(''), 4000)
  }

  const exportCsv = () => {
    const esc = (s: string) => `"${s.replace(/"/g, '""')}"`
    const head = (c: MCol) => (multi && c.group ? `${columnLabel(c.group)}: ${c.label}` : c.label)
    const lines: string[] = [esc(definition), '']
    lines.push([esc(q?.label ?? crossTab.row), ...displayColumns.map((c) => esc(head(c)))].join(','))
    displayRows.forEach((r) => {
      const rowMean = isMean && !r.pct
      lines.push(
        [esc((r.kind === 'member' ? '   ' : '') + r.label), ...displayColumns.map((c) => {
          const cell = r.cells[c.id]
          if (!cell) return esc('–')
          const arrow = !rowMean && !cell.hidden && c.id !== 'TOTAL' ? (cell.significance === 1 ? ' ▲' : cell.significance === -1 ? ' ▼' : '') : ''
          return esc(fmtCell(cell, rowMean) + arrow)
        })].join(','),
      )
    })
    lines.push([esc('Base (unweighted)'), ...displayColumns.map((c) => esc(String(baseRow?.cells[c.id]?.unweightedBase ?? '')))].join(','))
    lines.push([esc('Base (weighted)'), ...displayColumns.map((c) => esc(String(Math.round(baseRow?.cells[c.id]?.weightedBase ?? 0))))].join(','))
    lines.push('', esc('▲▼ significant at 95%. Cells with a base under 30 are hidden (–).'))
    const url = URL.createObjectURL(new Blob(['\ufeff' + lines.join('\n')], { type: 'text/csv;charset=utf-8' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `lens_${crossTab.row}_by_${cols.join('_') || 'TOTAL'}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const applyFilter = () => {
    if (fCodes.length === 0) return
    const rest = crossTab.filters.filter((f) => f.variable !== fVar)
    setCrossTab({ filters: [...rest, { variable: fVar, codes: fCodes } as Filter] })
    setFilterOpen(false)
    setFCodes([])
  }

  const listBySection = useMemo(() => {
    const term = search.trim().toLowerCase()
    const grouped: Record<string, ListItem[]> = {}
    SECTION_ORDER.forEach((s) => (grouped[s] = []))
    const matches = (it: ListItem) => !term || `${it.id} ${it.label} ${it.wording ?? ''}`.toLowerCase().includes(term)
    if (matches(WAVE_ITEM)) grouped.Time!.push(WAVE_ITEM)
    Object.values(QUESTIONS).forEach((qq) => {
      const it: ListItem = { id: qq.id, label: qq.label, type: qq.type, wording: qq.wording }
      if (matches(it)) grouped[qq.category]?.push(it)
    })
    return grouped
  }, [search])

  const filterVar = FILTER_VARIABLES.find((v) => v.id === fVar)
  const filterIds = new Set(crossTab.filters.map((f) => f.variable))

  return (
    <div className="flex h-full w-full overflow-hidden">
      {/* Question list */}
      <aside className="flex w-[260px] shrink-0 flex-col overflow-y-auto border-r border-border bg-card p-4">
        <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search questions…" className={`${ctrl} w-full`} />
        <p className="mt-2 px-1 text-xs text-muted-foreground">Drag into Rows, Columns or Filters, or use ⋯</p>
        <nav className="mt-3 space-y-4">
          {SECTION_ORDER.map((section) => {
            const items = listBySection[section] ?? []
            if (items.length === 0) return null
            return (
              <div key={section}>
                <h3 className="mb-1.5 flex justify-between px-1 text-xs font-medium text-muted-foreground">
                  <span>{section}</span>
                  <span className="tabular-nums">{items.length}</span>
                </h3>
                <div className="space-y-0.5">
                  {items.map((it) => {
                    const onRows = crossTab.row === it.id
                    const inCols = cols.includes(it.id)
                    const inFilters = filterIds.has(it.id)
                    const isWave = it.id === 'WAVE'
                    return (
                      <div key={it.id} {...dragAttrs(it.id, 'list')} className={`group relative flex items-center gap-1 rounded-[8px] pr-1 transition-colors ${onRows ? 'bg-primary/10' : 'hover:bg-muted'} cursor-grab active:cursor-grabbing`}>
                        <button
                          type="button"
                          onClick={() => (isWave ? addColumn('WAVE') : setRows(it.id))}
                          title={isWave ? 'Add Wave to Columns' : 'Use as Rows'}
                          className={`flex min-w-0 flex-1 items-center gap-2 rounded-[8px] px-2 py-1.5 text-left text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 ${onRows ? 'font-medium text-primary' : 'text-foreground'}`}
                        >
                          <span className="w-[64px] shrink-0 rounded border border-border bg-background py-0.5 text-center font-mono text-[11px] text-muted-foreground">{TYPE_TAG[it.type] ?? it.type}</span>
                          <span className="min-w-0 flex-1">{it.label}</span>
                          {inCols && <span className="shrink-0 text-xs text-primary">Cols</span>}
                          {inFilters && <span className="shrink-0 text-xs text-muted-foreground">Filter</span>}
                        </button>
                        <button
                          type="button"
                          aria-label={`Actions for ${it.label}`}
                          aria-haspopup="menu"
                          aria-expanded={menuFor === it.id}
                          onClick={() => setMenuFor(menuFor === it.id ? null : it.id)}
                          className="h-7 w-7 shrink-0 rounded-[6px] text-muted-foreground opacity-60 hover:bg-background hover:text-foreground focus:opacity-100 focus:outline-none focus:ring-2 focus:ring-primary/40 group-hover:opacity-100"
                        >
                          ⋯
                        </button>
                        {menuFor === it.id && (
                          <>
                            <div className="fixed inset-0 z-10" onClick={() => setMenuFor(null)} />
                            <div role="menu" className={`${card} absolute right-0 top-8 z-20 w-48 p-1 shadow-lg`}>
                              {[
                                { label: 'Use as Rows', ok: canRows(it.id) && !onRows, run: () => setRows(it.id) },
                                { label: 'Add to Columns', ok: canColumns(it.id) && !inCols, run: () => addColumn(it.id) },
                                { label: 'Filter by…', ok: canFilters(it.id), run: () => openFilterFor(it.id) },
                              ].map((m) => (
                                <button
                                  key={m.label}
                                  type="button"
                                  role="menuitem"
                                  disabled={!m.ok}
                                  onClick={() => {
                                    setMenuFor(null)
                                    m.run()
                                  }}
                                  className="block w-full rounded-[6px] px-3 py-1.5 text-left text-sm text-foreground hover:bg-muted disabled:cursor-not-allowed disabled:text-muted-foreground disabled:opacity-60 disabled:hover:bg-transparent"
                                >
                                  {m.label}
                                </button>
                              ))}
                            </div>
                          </>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
          {SECTION_ORDER.every((s) => (listBySection[s] ?? []).length === 0) && (
            <p className="px-1 text-sm text-muted-foreground">No questions match "{search}".</p>
          )}
        </nav>
      </aside>

      <main className="flex min-w-0 flex-1 flex-col overflow-y-auto">
        <div className="p-6">
          <PageHeader
            title="Cross-tabs"
            description="Drag questions into Rows and Columns to build a table, compare groups and waves, and save findings."
          />
          <div className="mt-5 space-y-4">
            {/* Toolbar */}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="inline-flex overflow-hidden rounded-[10px] border border-border bg-card">
                {(['table', 'chart', 'both'] as const).map((v) => (
                  <button key={v} type="button" onClick={() => setView(v)} className={seg(view === v)}>
                    {v === 'table' ? 'Table' : v === 'chart' ? 'Chart' : 'Table + Chart'}
                  </button>
                ))}
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={exportCsv} className="h-9 rounded-[10px] border border-border bg-card px-3 text-sm font-medium text-foreground hover:bg-muted focus:outline-none focus:ring-2 focus:ring-primary/40">
                  Export CSV
                </button>
                <button type="button" onClick={save} className="h-9 rounded-[10px] bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-primary/40">
                  Save to storyboard
                </button>
              </div>
            </div>

            {/* Builder */}
            <div className={`${card} p-3`}>
              <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_auto_minmax(0,2fr)_minmax(0,1.4fr)] lg:items-start">
                <div>
                  <p className="mb-1 px-1 text-xs font-medium text-muted-foreground">Rows</p>
                  <div {...zoneAttrs('rows')} className={zoneClass('rows')}>
                    <Chip label={rowLabel} tone="primary" />
                    <span className="px-1 text-xs text-muted-foreground">drop to replace</span>
                  </div>
                </div>

                <div className="flex justify-center lg:pt-6">
                  <button
                    type="button"
                    onClick={swap}
                    disabled={!canSwap}
                    title={canSwap ? 'Swap Rows and Columns' : 'Swap works when Rows and Columns each hold one profile group'}
                    aria-label="Swap Rows and Columns"
                    className="h-9 w-9 rounded-[10px] border border-border bg-background text-sm text-foreground hover:bg-muted focus:outline-none focus:ring-2 focus:ring-primary/40 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    ⇄
                  </button>
                </div>

                <div>
                  <p className="mb-1 px-1 text-xs font-medium text-muted-foreground">Columns</p>
                  <div {...zoneAttrs('columns')} className={zoneClass('columns')}>
                    {cols.length === 0 && <span className="px-1 text-xs text-muted-foreground">Total only · drop a profile group or Wave</span>}
                    {cols.map((c) => (
                      <Chip
                        key={c}
                        label={columnLabel(c)}
                        onRemove={() => removeColumn(c)}
                        attrs={{
                          ...dragAttrs(c, 'columns'),
                          onDragOver: (e: DragEvent<HTMLElement>) => e.preventDefault(),
                          onDrop: (e: DragEvent<HTMLElement>) => handleDrop('columns', e, c),
                        }}
                      />
                    ))}
                  </div>
                </div>

                <div className="relative">
                  <p className="mb-1 px-1 text-xs font-medium text-muted-foreground">Filters</p>
                  <div {...zoneAttrs('filters')} className={zoneClass('filters')}>
                    {crossTab.filters.length === 0 && <span className="px-1 text-xs text-muted-foreground">All respondents</span>}
                    {crossTab.filters.map((f, i) => (
                      <Chip key={`${f.variable}-${i}`} label={filterLabel(f)} onRemove={() => setCrossTab({ filters: crossTab.filters.filter((_, idx) => idx !== i) })} />
                    ))}
                    <button type="button" onClick={() => setFilterOpen((o) => !o)} className="rounded-full border border-dashed border-border px-2.5 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground">
                      + Add
                    </button>
                  </div>
                  {filterOpen && (
                    <>
                      <div className="fixed inset-0 z-10" onClick={() => setFilterOpen(false)} />
                      <div className={`${card} absolute right-0 top-full z-20 mt-1 w-72 p-4 shadow-lg`}>
                        <label className="block text-xs font-medium text-muted-foreground">
                          Filter by
                          <select value={fVar} onChange={(e) => { setFVar(e.target.value); setFCodes([]) }} className={`${ctrl} mt-1 w-full`}>
                            {FILTER_VARIABLES.filter((v) => v.id !== 'wave').map((v) => (
                              <option key={v.id} value={v.id}>{v.label}</option>
                            ))}
                          </select>
                        </label>
                        <div className="mt-3 max-h-48 space-y-1 overflow-y-auto">
                          {filterVar?.options.map((o) => {
                            const checked = fCodes.some((c) => String(c) === String(o.code))
                            return (
                              <label key={String(o.code)} className="flex items-center gap-2 text-sm text-foreground">
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={() => setFCodes((cs) => (checked ? cs.filter((c) => String(c) !== String(o.code)) : [...cs, o.code]))}
                                  className="accent-primary"
                                />
                                {o.label}
                              </label>
                            )
                          })}
                        </div>
                        <div className="mt-4 flex justify-end gap-2">
                          <button type="button" onClick={() => setFilterOpen(false)} className="h-8 rounded-[10px] border border-border px-3 text-xs">Cancel</button>
                          <button type="button" onClick={applyFilter} disabled={fCodes.length === 0} className="h-8 rounded-[10px] bg-primary px-3 text-xs text-primary-foreground disabled:opacity-50">Apply</button>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </div>

              <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3">
                <label className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                  Waves
                  <span title={isWaveCols ? 'Wave columns already show every wave' : undefined}>
                    <Select label="Waves" value={waveScope} onChange={(v) => setWaveScope(v as WaveScope)} options={scopeOptions} disabled={isWaveCols} className="w-[120px]" />
                  </span>
                </label>
                <div className="flex items-center gap-2">
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setGroupOpen((o) => !o)}
                      aria-expanded={groupOpen}
                      className={`h-8 rounded-[10px] border px-3 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-primary/40 ${groupingsActive ? 'border-primary bg-primary/10 text-primary' : 'border-border bg-background text-foreground hover:bg-muted'}`}
                    >
                      Groupings{groupingsActive ? ` · ${grouped.active.length}` : ''}
                    </button>
                    {groupOpen && (
                      <>
                        <div className="fixed inset-0 z-10" onClick={() => setGroupOpen(false)} />
                        <div className={`${card} absolute right-0 top-10 z-20 w-80 space-y-4 p-4 shadow-lg`}>
                          <p className="text-xs font-medium text-muted-foreground">Groupings for {rowLabel}</p>
                          {applicable.length === 0 ? (
                            <p className="text-sm text-muted-foreground">No groupings for this question yet.</p>
                          ) : (
                            <>
                              {applicable.some((d) => d.type === 'net') && (
                                <div>
                                  <p className="mb-1.5 text-xs font-medium text-muted-foreground">Add net rows</p>
                                  <div className="space-y-2">
                                    {applicable.filter((d) => d.type === 'net').map((d) => (
                                      <label key={d.id} className="flex cursor-pointer items-start gap-2 text-sm text-foreground">
                                        <input
                                          type="checkbox"
                                          className="mt-0.5 accent-primary"
                                          checked={applied.nets.includes(d.id)}
                                          onChange={() => setApplied({ nets: applied.nets.includes(d.id) ? applied.nets.filter((x) => x !== d.id) : [...applied.nets, d.id] })}
                                        />
                                        <span>
                                          {d.name}
                                          <span className="block text-xs text-muted-foreground">{describeDef(d)}</span>
                                        </span>
                                      </label>
                                    ))}
                                  </div>
                                </div>
                              )}
                              {applicable.some((d) => d.type === 'classification') && !isMean && (
                                <div>
                                  <p className="mb-1.5 text-xs font-medium text-muted-foreground">Group rows by</p>
                                  <Select
                                    label="Group rows by"
                                    value={clsValue}
                                    onChange={(v) => setApplied({ classification: v === 'none' ? null : v })}
                                    options={[{ value: 'none', label: 'None' }, ...applicable.filter((d) => d.type === 'classification').map((d) => ({ value: d.id, label: d.name }))]}
                                    className="w-full"
                                  />
                                  {clsValue !== 'none' && (
                                    <label className="mt-2 flex cursor-pointer items-center gap-1.5 text-xs text-foreground">
                                      <input type="checkbox" className="accent-primary" checked={applied.showMembers} onChange={(e) => setApplied({ showMembers: e.target.checked })} />
                                      Show members under each group
                                    </label>
                                  )}
                                </div>
                              )}
                            </>
                          )}
                          <div className="flex items-center justify-between border-t border-border pt-3">
                            <button type="button" onClick={() => { setGroupOpen(false); navigate('/groupings') }} className="text-xs font-medium text-primary hover:underline">
                              Manage groupings →
                            </button>
                            {groupingsActive && (
                              <button type="button" onClick={() => setApplied({ nets: [], classification: null })} className="text-xs text-muted-foreground hover:text-foreground">
                                Clear
                              </button>
                            )}
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => setDiscoverOpen((o) => !o)}
                    aria-pressed={discoverOpen}
                    className={`h-8 rounded-[10px] border px-3 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-primary/40 ${discoverOpen ? 'border-primary bg-primary/10 text-primary' : 'border-border bg-background text-foreground hover:bg-muted'}`}
                  >
                    ✦ Discover
                  </button>
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setDisplayOpen((o) => !o)}
                      aria-expanded={displayOpen}
                      className="h-8 rounded-[10px] border border-border bg-background px-3 text-xs font-medium text-foreground hover:bg-muted focus:outline-none focus:ring-2 focus:ring-primary/40"
                    >
                      Display
                    </button>
                    {displayOpen && (
                      <>
                        <div className="fixed inset-0 z-10" onClick={() => setDisplayOpen(false)} />
                        <div className={`${card} absolute right-0 top-10 z-20 w-64 space-y-3 p-4 shadow-lg`}>
                          <div>
                            <p className="mb-1.5 text-xs font-medium text-muted-foreground">Show</p>
                            <div className="inline-flex overflow-hidden rounded-[10px] border border-border">
                              <button type="button" onClick={() => setCrossTab({ stat: 'colpct' })} className={seg(isMean || crossTab.stat === 'colpct')} disabled={isMean}>
                                {isMean ? 'Mean' : 'Column %'}
                              </button>
                              <button type="button" onClick={() => setCrossTab({ stat: 'counts' })} className={seg(!isMean && crossTab.stat === 'counts')} disabled={isMean}>
                                Counts
                              </button>
                            </div>
                          </div>
                          <label className="flex cursor-pointer items-center gap-1.5 text-xs text-foreground">
                            <input type="checkbox" checked={weighted} onChange={(e) => setWeighted(e.target.checked)} className="accent-primary" />
                            Weighted
                          </label>
                          <label className="flex cursor-pointer items-center gap-1.5 text-xs text-foreground">
                            <input type="checkbox" checked={showBases} onChange={(e) => setShowBases(e.target.checked)} className="accent-primary" />
                            Show bases in cells
                          </label>
                          <label className="flex cursor-pointer items-center gap-1.5 text-xs text-foreground">
                            <input type="checkbox" checked={heat} onChange={(e) => setHeat(e.target.checked)} className="accent-primary" />
                            Heat shading
                          </label>
                          <label className="flex items-center gap-2 text-xs text-muted-foreground">
                            Decimals
                            <Select
                              label="Decimals"
                              value={String(decimals)}
                              onChange={(v) => setCrossTab({ decimals: Number(v) === 1 ? 1 : 0 })}
                              options={[{ value: '0', label: '0' }, { value: '1', label: '1' }]}
                            />
                          </label>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {hint && <p role="status" className="rounded-[10px] bg-[#FEF4E6] px-3 py-2 text-xs text-[#B45309]">{hint}</p>}
            {displaySummary && <p className="text-xs text-muted-foreground">Display: {displaySummary}</p>}
            <p className="text-sm text-muted-foreground">{definition}</p>
            {groupingsActive && (
              <p className="text-xs text-muted-foreground">
                Groupings applied: {grouped.active.join(', ')}.{isMean && displayRows.some((r) => r.pct) ? ' Net rows show % of respondents; the other rows show means.' : ''} Saved slides do not include groupings yet.
              </p>
            )}
            {WEIGHTING_VARS.includes(crossTab.row) && weighted && (
              <p className="text-xs text-muted-foreground">{rowLabel} is a weighting variable, so its weighted shares match the study targets.</p>
            )}

            {/* Discover */}
            {discoverOpen && (
              <div className={`${card} p-5`}>
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h2 className="text-sm font-semibold text-foreground">Discover · {q?.label ?? crossTab.row}</h2>
                  <span className="text-xs text-muted-foreground">
                    Every profile group tested against Total at 95%{waveScope !== 'All' ? ` · ${waveScope}` : ''}
                  </span>
                </div>
                {isMean ? (
                  <p className="mt-3 text-sm text-muted-foreground">Means aren't significance-tested, so Discover works on percentage questions only.</p>
                ) : discover.length === 0 ? (
                  <p className="mt-3 text-sm text-muted-foreground">No group differs significantly from Total.</p>
                ) : (
                  <ul className="mt-3 divide-y divide-border">
                    {discover.slice(0, 8).map((d) => (
                      <li key={d.key} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                        <span className="text-foreground">
                          <span className={d.sig === 1 ? 'text-sig-high' : 'text-sig-low'}>{d.sig === 1 ? '▲ ' : '▼ '}</span>
                          <span className="font-medium">{d.row}</span> among <span className="font-medium">{d.col}</span>
                          <span className="text-muted-foreground"> ({d.group})</span>: {Math.round(d.value)}% vs {Math.round(d.total)}% overall
                          <span className="text-muted-foreground"> · n={d.base}</span>
                        </span>
                        <button type="button" onClick={() => apply(crossTab.row, [d.groupId])} className="shrink-0 text-xs font-medium text-primary hover:underline">
                          Show by {d.group}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                {discover.length > 8 && <p className="mt-2 text-xs text-muted-foreground">Showing the 8 largest of {discover.length} significant differences.</p>}
              </div>
            )}

            {/* Table */}
            {view !== 'chart' && (
              <div className={`${card} overflow-hidden`}>
                <div className="border-b border-border px-5 py-3">
                  <p className="text-sm font-semibold text-foreground">
                    <span className="mr-2 font-mono text-xs text-muted-foreground">{crossTab.row}</span>
                    {q?.wording ?? q?.label ?? crossTab.row}
                  </p>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-sm">
                    <thead>
                      {multi && (
                        <tr className="bg-muted/40">
                          <th rowSpan={2} className="px-4 py-2.5 text-left align-bottom text-xs font-medium text-muted-foreground">{q?.label ?? crossTab.row}</th>
                          <th rowSpan={2} className="min-w-[80px] px-4 py-2.5 text-right align-bottom text-xs font-medium text-muted-foreground">Total</th>
                          {groups.map((g) => (
                            <th key={g.id} colSpan={g.count} className="border-l border-border px-4 pt-2.5 text-center text-xs font-semibold text-foreground">{g.label}</th>
                          ))}
                        </tr>
                      )}
                      <tr className="bg-muted/40">
                        {!multi && <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">{q?.label ?? crossTab.row}</th>}
                        {displayColumns
                          .filter((c) => !multi || c.id !== 'TOTAL')
                          .map((col) => (
                            <th key={col.id} className={`min-w-[80px] px-4 py-2.5 text-right text-xs font-medium text-muted-foreground ${multi && groupStarts.has(col.id) ? 'border-l border-border' : ''}`}>
                              {col.label}
                            </th>
                          ))}
                      </tr>
                    </thead>
                    <tbody>
                      {displayRows.map((row) => {
                        const rowMean = isMean && !row.pct
                        const isFocus = isBrand && row.kind === 'base' && row.label === BRAND_FOCUS
                        const isGroupRow = row.kind === 'parent' || row.kind === 'unclassified'
                        const heatVals = otherCols.map((c) => row.cells[c.id]).filter((c): c is ResultCell => !!c && !c.hidden).map((c) => chartValue(c, rowMean))
                        const hMin = heatVals.length ? Math.min(...heatVals) : 0
                        const hMax = heatVals.length ? Math.max(...heatVals) : 0
                        return (
                          <tr key={row.id} className={`border-t border-border ${isFocus || row.kind === 'net' ? 'bg-primary/5' : isGroupRow ? 'bg-muted/40' : ''}`}>
                            <td className={`px-4 py-2.5 text-foreground ${row.kind === 'member' ? 'pl-9' : ''}`}>
                              <span className={isFocus || isGroupRow ? 'font-semibold' : row.kind === 'member' ? 'text-muted-foreground' : ''}>{row.label}</span>
                              {isFocus && <span className="ml-2 rounded bg-primary/10 px-1.5 py-0.5 text-xs font-medium text-primary">Focus brand</span>}
                              {row.kind === 'net' && <span title={row.note} className="ml-2 rounded bg-primary/10 px-1.5 py-0.5 text-xs font-medium text-primary">Net</span>}
                              {row.kind === 'unclassified' && <span title={row.note} className="ml-2 rounded bg-muted px-1.5 py-0.5 text-xs font-medium text-muted-foreground">Not grouped</span>}
                            </td>
                            {displayColumns.map((col) => {
                              const cell = row.cells[col.id]
                              const border = multi && groupStarts.has(col.id) ? 'border-l border-border' : ''
                              if (!cell) return <td key={col.id} className={`px-4 py-2.5 text-right text-muted-foreground ${border}`}>–</td>
                              const showArrow = !rowMean && !cell.hidden && col.id !== 'TOTAL' && cell.significance !== 0
                              const shade =
                                heat && col.id !== 'TOTAL' && !cell.hidden && hMax > hMin
                                  ? { backgroundColor: `rgba(107, 71, 214, ${(0.04 + ((chartValue(cell, rowMean) - hMin) / (hMax - hMin)) * 0.2).toFixed(3)})` }
                                  : undefined
                              return (
                                <td key={col.id} style={shade} className={`px-4 py-2.5 text-right tabular-nums ${cell.hidden ? 'text-muted-foreground' : 'text-foreground'} ${isFocus || isGroupRow ? 'font-semibold' : ''} ${border}`}>
                                  {fmtCell(cell, rowMean)}
                                  {showArrow && <span className={`ml-1 ${cell.significance === 1 ? 'text-sig-high' : 'text-sig-low'}`}>{cell.significance === 1 ? '▲' : '▼'}</span>}
                                  {showBases && <span className="block font-mono text-xs font-normal text-muted-foreground">n={cell.unweightedBase.toLocaleString()}</span>}
                                </td>
                              )
                            })}
                          </tr>
                        )
                      })}
                      <tr className="border-t-2 border-border">
                        <td className="px-4 py-2 font-mono text-xs text-muted-foreground">Base (unweighted)</td>
                        {displayColumns.map((col) => (
                          <td key={col.id} className={`px-4 py-2 text-right font-mono text-xs text-muted-foreground ${multi && groupStarts.has(col.id) ? 'border-l border-border' : ''}`}>
                            {baseRow?.cells[col.id] ? baseRow.cells[col.id]!.unweightedBase.toLocaleString() : '–'}
                          </td>
                        ))}
                      </tr>
                      <tr className="border-t border-border">
                        <td className="px-4 py-2 font-mono text-xs text-muted-foreground">Base (weighted)</td>
                        {displayColumns.map((col) => (
                          <td key={col.id} className={`px-4 py-2 text-right font-mono text-xs text-muted-foreground ${multi && groupStarts.has(col.id) ? 'border-l border-border' : ''}`}>
                            {baseRow?.cells[col.id] ? Math.round(baseRow.cells[col.id]!.weightedBase).toLocaleString() : '–'}
                          </td>
                        ))}
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Chart */}
            {view !== 'table' && (
              <div className={`${card} p-5`}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="text-sm font-semibold text-foreground">{q?.label ?? crossTab.row} by {colsLabel}</p>
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="inline-flex overflow-hidden rounded-[10px] border border-border">
                      {([['line', 'Line'], ['column', 'Column'], ['hbar', 'Horizontal bar'], ['stacked', 'Stacked bar']] as const).map(([t, label]) => (
                        <button
                          key={t}
                          type="button"
                          onClick={() => setChartPick(t)}
                          disabled={!allowed[t]}
                          title={
                            !allowed[t]
                              ? t === 'stacked'
                                ? 'Stacked bars need a single-choice question shown as column %'
                                : t === 'line' && multi
                                  ? 'Lines only make sense across one ordered group, such as waves'
                                  : 'Needs more than one column'
                              : undefined
                          }
                          className={seg(chartType === t)}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                    <label className="flex items-center gap-1.5 text-xs text-foreground">
                      <input type="checkbox" checked={dataLabels} onChange={(e) => setDataLabels(e.target.checked)} className="accent-primary" />
                      Data labels
                    </label>
                    {zoomable && (
                      <label className="flex items-center gap-1.5 text-xs text-foreground">
                        <input type="checkbox" checked={zoomAxis} onChange={(e) => setZoomAxis(e.target.checked)} className="accent-primary" />
                        Zoom to data
                      </label>
                    )}
                    {!isMean && (
                      <label className="flex items-center gap-1.5 text-xs text-foreground">
                        <input type="checkbox" checked={showSig} onChange={(e) => setShowSig(e.target.checked)} className="accent-primary" />
                        Significance
                      </label>
                    )}
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap gap-3 text-xs text-muted-foreground">
                  {useRowsOnX ? (
                    <span>Total column</span>
                  ) : (
                    series.map((s) => (
                      <span key={s.key} className="inline-flex items-center gap-1.5">
                        <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: s.color }} />
                        <span className={s.isFocus ? 'font-medium text-foreground' : ''}>{s.label}</span>
                      </span>
                    ))
                  )}
                </div>

                <div className="mt-2 w-full" style={{ height: chartType === 'hbar' ? Math.max(220, rowData.length * 44) : 300 }}>
                  {zoomBounds && <p className="mb-1 text-xs text-muted-foreground">Axis starts at {zoomBounds.lo}%</p>}
                  <ResponsiveContainer width="100%" height="100%">
                    {useRowsOnX ? (
                      chartType === 'hbar' ? (
                        <BarChart data={rowData} layout="vertical" margin={{ top: 8, right: 56, left: 8, bottom: 8 }}>
                          <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#E8E6EE" />
                          <XAxis type="number" domain={yDomain} tick={{ fontSize: 12 }} tickFormatter={tickFmt} />
                          <YAxis type="category" dataKey="name" width={130} tick={{ fontSize: 12 }} />
                          <Tooltip formatter={tipFmt} />
                          <Bar dataKey="v" radius={[0, 4, 4, 0]} isAnimationActive={false} label={makeLabel({ sigs: [], showValue: dataLabels, showSig: false, fmt: fmtNumber, color: INK, horizontal: true })}>
                            {rowData.map((d, i) => (
                              <BarCell key={i} fill={isBrand ? (d.name === BRAND_FOCUS ? PURPLE : GREYS[0]) : SERIES[i % SERIES.length]} />
                            ))}
                          </Bar>
                        </BarChart>
                      ) : (
                        <BarChart data={rowData} margin={{ top: 24, right: 8, left: 0, bottom: 8 }}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E8E6EE" />
                          <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                          <YAxis domain={yDomain} tick={{ fontSize: 12 }} tickFormatter={tickFmt} width={44} />
                          <Tooltip formatter={tipFmt} />
                          <Bar dataKey="v" radius={[4, 4, 0, 0]} isAnimationActive={false} label={makeLabel({ sigs: [], showValue: dataLabels, showSig: false, fmt: fmtNumber, color: INK })}>
                            {rowData.map((d, i) => (
                              <BarCell key={i} fill={isBrand ? (d.name === BRAND_FOCUS ? PURPLE : GREYS[0]) : SERIES[i % SERIES.length]} />
                            ))}
                          </Bar>
                        </BarChart>
                      )
                    ) : chartType === 'line' ? (
                      <LineChart data={colData} margin={{ top: 24, right: 24, left: 0, bottom: 8 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E8E6EE" />
                        <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                        <YAxis domain={yDomain} tick={{ fontSize: 12 }} tickFormatter={tickFmt} width={44} />
                        <Tooltip formatter={tipFmt} />
                        {[...series].sort((a, b) => Number(a.isFocus) - Number(b.isFocus)).map((s) => (
                          <Line
                            key={s.key}
                            type="linear"
                            dataKey={s.key}
                            name={s.label}
                            stroke={s.color}
                            strokeWidth={s.isFocus ? 3 : 1.5}
                            dot={{ r: s.isFocus ? 4 : 2.5 }}
                            connectNulls={false}
                            isAnimationActive={false}
                            label={labelFor(s)}
                          />
                        ))}
                      </LineChart>
                    ) : (
                      <BarChart data={colData} margin={{ top: 24, right: 8, left: 0, bottom: 8 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E8E6EE" />
                        <XAxis dataKey="name" tick={{ fontSize: 12 }} interval={0} />
                        <YAxis domain={yDomain} tick={{ fontSize: 12 }} tickFormatter={tickFmt} width={44} />
                        <Tooltip formatter={tipFmt} />
                        {series.map((s) => (
                          <Bar
                            key={s.key}
                            dataKey={s.key}
                            name={s.label}
                            fill={s.color}
                            stackId={chartType === 'stacked' ? 'stack' : undefined}
                            radius={chartType === 'stacked' ? 0 : [4, 4, 0, 0]}
                            isAnimationActive={false}
                            label={chartType === 'stacked' ? false : labelFor(s)}
                          />
                        ))}
                      </BarChart>
                    )}
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            <p className="text-xs leading-relaxed text-muted-foreground">
              {q?.wording ?? q?.label}. Base: {baseText(crossTab.row)}. {weighted ? 'Weighted by age × gender.' : 'Unweighted.'}{' '}
              {isMean ? 'Means are not significance-tested.' : multi ? '▲▼ each group significant vs Total at 95%.' : '▲▼ significant at 95%.'} Cells with a base under 30 are hidden (–). All numbers are calculated from the survey data.
            </p>
          </div>
        </div>
      </main>

      {toast && (
        <div role="status" className="fixed bottom-6 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-[10px] bg-foreground px-4 py-2.5 text-sm text-background shadow-lg">
          <span>{toast}</span>
          <button type="button" onClick={() => { setToast(''); navigate('/storyboards') }} className="font-medium underline underline-offset-2 hover:opacity-80">
            View storyboard
          </button>
        </div>
      )}
    </div>
  )
}
