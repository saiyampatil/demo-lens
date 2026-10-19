import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bar, BarChart, CartesianGrid, Cell as BarCell, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useLensStore, type WaveScope } from '@/store/useLensStore'
import { crosstab, type Filter } from '@/engine/crosstab'
import PageHeader from '@/components/PageHeader'
import Select from '@/components/ui/Select'
import { QUESTIONS, WAVES, BRANDS, type QuestionDef } from '@/engine/questions'

type Result = ReturnType<typeof crosstab>
type ResultRow = Result['rows'][number]
type ResultCell = NonNullable<ResultRow['cells'][string]>
type ChartType = 'line' | 'column' | 'hbar' | 'stacked'
type ViewMode = 'table' | 'chart' | 'both'
type StoreState = ReturnType<typeof useLensStore.getState>
type LabelProps = { x?: number | string; y?: number | string; width?: number | string; height?: number | string; index?: number; value?: unknown }

const PURPLE = '#6B47D6'
const INK = '#1A1A1A'
const MUTED = '#717680'
const GREYS = ['#C9C6D3', '#A9A5B8', '#8E8A9E', '#B8B4C6', '#D9D6E3']
const RAMP = ['#4E2FB8', '#6B47D6', '#9E77ED', '#C4ADF6', '#E6DCFD']
const BRAND_FOCUS = 'Campa'

const COLUMN_CHOICES: { id: string; label: string }[] = [
  { id: 'WAVE', label: 'Wave' },
  { id: 'AGE', label: 'Age group' },
  { id: 'GENDER', label: 'Gender' },
  { id: 'CITY', label: 'City type' },
  { id: 'SEC', label: 'Socio-economic class' },
  { id: 'TOTAL', label: 'Total only' },
]

const FILTER_VARIABLES: { id: string; label: string; options: { code: number | string; label: string }[] }[] = [
  { id: 'wave', label: 'Wave', options: WAVES.map((w) => ({ code: w, label: w })) },
  { id: 'AGE', label: 'Age group', options: QUESTIONS.AGE.options!.map((o) => ({ code: o.code, label: o.label })) },
  { id: 'GENDER', label: 'Gender', options: QUESTIONS.GENDER.options!.map((o) => ({ code: o.code, label: o.label })) },
  { id: 'CITY', label: 'City type', options: QUESTIONS.CITY.options!.map((o) => ({ code: o.code, label: o.label })) },
  { id: 'SEC', label: 'Socio-economic class', options: QUESTIONS.SEC.options!.map((o) => ({ code: o.code, label: o.label })) },
  { id: 'Q3', label: 'Main brand', options: BRANDS.map((b) => ({ code: b.code, label: b.label })) },
]

const SECTION_ORDER = ['Profile', 'Brand funnel', 'Consumption', 'Attitudes', 'Advocacy'] as const
const TYPE_TAG: Record<string, string> = { single: 'SINGLE', multi: 'MULTI', numeric: 'NUMERIC', grid: 'GRID', scale: 'SCALE' }

const qDef = (id: string): QuestionDef | undefined => QUESTIONS[id as keyof typeof QUESTIONS]
const columnLabel = (id: string) => COLUMN_CHOICES.find((c) => c.id === id)?.label ?? qDef(id)?.label ?? id
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

  const navigate = useNavigate()

  useEffect(() => {
    if (!displayOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setDisplayOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [displayOpen])

  const q = qDef(crossTab.row)
  const isMean = isMeanQuestion(crossTab.row)
  const isBrand = isBrandQuestion(crossTab.row)
  const isSingle = q?.type === 'single'
  const decimals = Number(crossTab.decimals) === 1 ? 1 : 0
  const scoped = waveScope !== 'All' && crossTab.column !== 'WAVE'

  const filters = useMemo((): Filter[] => {
    const f: Filter[] = [...crossTab.filters]
    if (scoped) f.push({ variable: 'wave', codes: [waveScope] } as Filter)
    return f
  }, [crossTab.filters, scoped, waveScope])

  const result = useMemo(
    () => crosstab({ row: crossTab.row, column: crossTab.column, filters, weighted }),
    [crossTab.row, crossTab.column, filters, weighted],
  )

  const totalCol = result.columns.find((c) => c.id === 'TOTAL')
  const otherCols = result.columns.filter((c) => c.id !== 'TOTAL')
  const displayColumns = totalCol ? [totalCol, ...otherCols] : result.columns
  const baseRow = result.rows[0]

  const filterLabel = (f: Filter) => {
    const v = FILTER_VARIABLES.find((x) => x.id === f.variable)
    const labels = f.codes.map((c) => v?.options.find((o) => String(o.code) === String(c))?.label ?? String(c)).join(', ')
    return `${v?.label ?? f.variable}: ${labels}`
  }

  const scopeText = [
    ...(scoped ? [`${waveScope} only`] : []),
    ...crossTab.filters.map(filterLabel),
  ].join(', ') || 'all respondents'

  const sigText = isMean ? 'means · not significance-tested' : crossTab.column === 'WAVE' ? 'significance vs previous wave at 95%' : crossTab.column === 'TOTAL' ? 'no significance test' : 'significance vs Total at 95%'
  const statText = isMean ? 'means' : crossTab.stat === 'counts' ? (weighted ? 'weighted counts' : 'counts') : 'column %'
  const definition = `Showing ${q?.label ?? crossTab.row} by ${columnLabel(crossTab.column)} · ${scopeText} · ${weighted ? 'weighted' : 'unweighted'} · ${statText} · ${sigText}`
  const displaySummary = [
    ...(weighted ? [] : ['unweighted']),
    ...(crossTab.stat === 'counts' ? ['counts'] : []),
    ...(decimals === 1 ? ['1 decimal'] : []),
  ].join(' · ')
  const scopeOptions = [
    { value: 'All', label: 'All waves' },
    ...WAVES.map((w) => ({ value: w, label: w })),
  ]
  const isWaveCols = crossTab.column === 'WAVE'

  const chartValue = (cell: ResultCell): number => {
    if (isMean) return cell.rawValue
    if (crossTab.stat === 'counts') return (cell.rawValue / 100) * (weighted ? cell.weightedBase : cell.unweightedBase)
    return cell.rawValue
  }
  const fmtNumber = (v: number): string => {
    if (isMean) return v.toFixed(decimals === 1 ? 2 : 1)
    if (crossTab.stat === 'counts') return Math.round(v).toLocaleString()
    return decimals === 1 ? `${v.toFixed(1)}%` : `${Math.round(v)}%`
  }
  const fmtCell = (cell: ResultCell): string => (cell.hidden ? '–' : fmtNumber(chartValue(cell)))

  // ---------- chart ----------
  const chartCols = otherCols.length > 0 && crossTab.column !== 'TOTAL' ? otherCols : []
  const xIsColumns = chartCols.length > 1
  const allowed: Record<ChartType, boolean> = {
    line: xIsColumns,
    column: true,
    hbar: true,
    stacked: isSingle && !isMean && crossTab.stat === 'colpct' && xIsColumns,
  }
  const defaultType: ChartType = crossTab.column === 'WAVE' && xIsColumns ? 'line' : 'column'
  const chartType: ChartType = chartPick && allowed[chartPick] ? chartPick : defaultType
  const useRowsOnX = chartType === 'hbar' || !xIsColumns

  const series = result.rows.map((r, i) => ({
    key: `s${i}`,
    label: r.label,
    isFocus: isBrand && r.label === BRAND_FOCUS,
    color: isBrand ? (r.label === BRAND_FOCUS ? PURPLE : GREYS[i % GREYS.length]!) : RAMP[i % RAMP.length]!,
    row: r,
  }))

  const colData = chartCols.map((c) => {
    const d: Record<string, string | number | null> = { name: c.label }
    series.forEach((s) => {
      const cell = s.row.cells[c.id]
      d[s.key] = cell && !cell.hidden ? chartValue(cell) : null
    })
    return d
  })
  const rowData = result.rows.map((r) => {
    const cell = r.cells['TOTAL']
    return { name: r.label, v: cell && !cell.hidden ? chartValue(cell) : null }
  })

  const maxQ = q?.id === 'Q6' ? 10 : q?.id === 'Q4' ? 5 : null
  const isPct = !isMean && crossTab.stat === 'colpct'
  const zoomable = (chartType === 'line' || chartType === 'column') && isPct
  const effectiveZoom = zoomable && zoomAxis
  const zoomBounds = useMemo(() => {
    if (!effectiveZoom) return null
    const vals: number[] = []
    if (useRowsOnX) {
      rowData.forEach((d) => { if (typeof d.v === 'number') vals.push(d.v) })
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

  const sigsFor = (r: ResultRow) => chartCols.map((c) => (isMean ? 0 : r.cells[c.id]?.significance ?? 0))
  const labelFor = (s: (typeof series)[number], horizontal = false) =>
    makeLabel({
      sigs: horizontal ? [] : sigsFor(s.row),
      showValue: dataLabels && (series.length <= 2 || s.isFocus),
      showSig: showSig,
      fmt: fmtNumber,
      color: s.isFocus || !isBrand ? INK : MUTED,
      horizontal,
    })

  // ---------- actions ----------
  const save = () => {
    const item = {
      id: `${Date.now()}`,
      title: `${q?.label ?? crossTab.row} by ${columnLabel(crossTab.column)}${scopeText !== 'all respondents' ? ` (${scopeText})` : ''}`,
      crossTab: { ...crossTab },
      waveScope,
      weighted,
      view,
      chartType,
      savedAt: new Date().toISOString(),
    }
    useLensStore.setState((s: StoreState) => ({ savedResults: [...s.savedResults, item] as StoreState['savedResults'] }))
    setToast('show')
    window.setTimeout(() => setToast(''), 4000)
  }

  const exportCsv = () => {
    const esc = (s: string) => `"${s.replace(/"/g, '""')}"`
    const lines: string[] = [esc(definition), '']
    lines.push([esc(q?.label ?? crossTab.row), ...displayColumns.map((c) => esc(c.label))].join(','))
    result.rows.forEach((r) => {
      lines.push(
        [esc(r.label), ...displayColumns.map((c) => {
          const cell = r.cells[c.id]
          if (!cell) return esc('–')
          const arrow = !isMean && !cell.hidden && c.id !== 'TOTAL' ? (cell.significance === 1 ? ' ▲' : cell.significance === -1 ? ' ▼' : '') : ''
          return esc(fmtCell(cell) + arrow)
        })].join(','),
      )
    })
    lines.push([esc('Base (unweighted)'), ...displayColumns.map((c) => esc(String(baseRow?.cells[c.id]?.unweightedBase ?? '')))].join(','))
    lines.push([esc('Base (weighted)'), ...displayColumns.map((c) => esc(String(Math.round(baseRow?.cells[c.id]?.weightedBase ?? 0))))].join(','))
    lines.push('', esc('▲▼ significant at 95%. Cells with a base under 30 are hidden (–).'))
    const url = URL.createObjectURL(new Blob(['\ufeff' + lines.join('\n')], { type: 'text/csv;charset=utf-8' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `lens_${crossTab.row}_by_${crossTab.column}.csv`
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

  const questionsBySection = useMemo(() => {
    const term = search.trim().toLowerCase()
    const grouped: Record<string, QuestionDef[]> = {}
    SECTION_ORDER.forEach((s) => (grouped[s] = []))
    Object.values(QUESTIONS).forEach((qq) => {
      const hay = `${qq.id} ${qq.label} ${qq.wording ?? ''}`.toLowerCase()
      if (term && !hay.includes(term)) return
      grouped[qq.category]?.push(qq)
    })
    return grouped
  }, [search])

  const filterVar = FILTER_VARIABLES.find((v) => v.id === fVar)

  return (
    <div className="flex h-full w-full overflow-hidden">
      {/* Question list */}
      <aside className="flex w-[260px] shrink-0 flex-col overflow-y-auto border-r border-border bg-card p-4">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search questions…"
          className={`${ctrl} w-full`}
        />
        <nav className="mt-4 space-y-4">
          {SECTION_ORDER.map((section) => {
            const qs = questionsBySection[section] ?? []
            if (qs.length === 0) return null
            return (
              <div key={section}>
                <h3 className="mb-1.5 flex justify-between px-1 text-xs font-medium text-muted-foreground">
                  <span>{section}</span>
                  <span className="tabular-nums">{qs.length}</span>
                </h3>
                <div className="space-y-0.5">
                  {qs.map((qq) => {
                    const on = crossTab.row === qq.id
                    return (
                      <button
                        key={qq.id}
                        type="button"
                        onClick={() => setCrossTab({ row: qq.id })}
                        className={`flex w-full items-center gap-2 rounded-[8px] px-2 py-1.5 text-left text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-primary/40 ${
                          on ? 'bg-primary/10 font-medium text-primary' : 'text-foreground hover:bg-muted'
                        }`}
                      >
                        <span className="w-[64px] shrink-0 rounded border border-border bg-background py-0.5 text-center font-mono text-[11px] text-muted-foreground">
                          {TYPE_TAG[qq.type] ?? qq.type}
                        </span>
                        <span className="min-w-0 flex-1">{qq.label}</span>
                      </button>
                    )
                  })}
                </div>
              </div>
            )
          })}
          {SECTION_ORDER.every((s) => (questionsBySection[s] ?? []).length === 0) && (
            <p className="px-1 text-sm text-muted-foreground">No questions match "{search}".</p>
          )}
        </nav>
      </aside>

      <main className="flex min-w-0 flex-1 flex-col overflow-y-auto">
        <div className="p-6">
          <PageHeader
            title="Cross-tabs"
            description="Build tables from any question, compare waves and groups, and save findings."
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

          {/* Layout bar */}
          <div className={`${card} flex flex-nowrap items-center gap-x-3 gap-y-3 overflow-x-auto p-3`}>
            <label className="flex shrink-0 items-center gap-2 text-xs font-medium text-muted-foreground">
              Rows
              <Select
                label="Rows"
                value={crossTab.row}
                onChange={(v) => setCrossTab({ row: v })}
                options={Object.values(QUESTIONS).map((qq) => ({ value: qq.id, label: qq.label }))}
                className="w-[132px]"
              />
            </label>
            <label className="flex shrink-0 items-center gap-2 text-xs font-medium text-muted-foreground">
              Columns
              <Select
                label="Columns"
                value={crossTab.column}
                onChange={(v) => setCrossTab({ column: v })}
                options={COLUMN_CHOICES.map((c) => ({ value: c.id, label: c.id === 'TOTAL' ? c.label : `Total + ${c.label}` }))}
                className="w-[132px]"
              />
            </label>
            <label className="flex shrink-0 items-center gap-2 text-xs font-medium text-muted-foreground">
              Waves
              <Select
                label="Waves"
                value={waveScope}
                onChange={(v) => setWaveScope(v as WaveScope)}
                options={scopeOptions}
                disabled={isWaveCols}
                className="w-[104px]"
              />
            </label>
            {isWaveCols && (
              <span className="shrink-0 text-xs text-muted-foreground">Wave columns show all waves</span>
            )}
            <div className="relative flex min-w-0 flex-1 flex-nowrap items-center gap-1.5 overflow-x-auto">
              <span className="shrink-0 text-xs font-medium text-muted-foreground">Filters</span>
              {crossTab.filters.map((f, i) => (
                <span key={`${f.variable}-${i}`} className="inline-flex shrink-0 items-center gap-1 rounded-full border border-border bg-muted px-2 py-0.5 text-xs text-foreground">
                  {filterLabel(f)}
                  <button
                    type="button"
                    aria-label="Remove filter"
                    onClick={() => setCrossTab({ filters: crossTab.filters.filter((_, idx) => idx !== i) })}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    ✕
                  </button>
                </span>
              ))}
              {crossTab.filters.length === 0 && <span className="shrink-0 text-xs text-muted-foreground">All respondents</span>}
              <button type="button" onClick={() => setFilterOpen((o) => !o)} className="shrink-0 rounded-full border border-dashed border-border px-2 py-0.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground">
                + Add filter
              </button>

              {filterOpen && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setFilterOpen(false)} />
                  <div className={`${card} absolute left-0 top-8 z-20 w-72 p-4 shadow-lg`}>
                    <label className="block text-xs font-medium text-muted-foreground">
                      Filter by
                      <select
                        value={fVar}
                        onChange={(e) => { setFVar(e.target.value); setFCodes([]) }}
                        className={`${ctrl} mt-1 w-full`}
                      >
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

            <div className="relative ml-auto shrink-0">
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
                  <div className={`${card} absolute right-0 top-10 z-20 w-64 space-y-4 p-4 shadow-lg`}>
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
          {displaySummary && (
            <p className="text-xs text-muted-foreground">Display: {displaySummary}</p>
          )}

          <p className="text-sm text-muted-foreground">{definition}</p>

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
                    <tr className="bg-muted/40">
                      <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">{q?.label ?? crossTab.row}</th>
                      {displayColumns.map((col) => (
                        <th key={col.id} className="min-w-[88px] px-4 py-2.5 text-right text-xs font-medium text-muted-foreground">{col.label}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {result.rows.map((row) => {
                      const isFocus = isBrand && row.label === BRAND_FOCUS
                      return (
                        <tr key={String(row.id)} className={`border-t border-border ${isFocus ? 'bg-primary/5' : ''}`}>
                          <td className="px-4 py-2.5 text-foreground">
                            <span className={isFocus ? 'font-semibold' : ''}>{row.label}</span>
                            {isFocus && <span className="ml-2 rounded bg-primary/10 px-1.5 py-0.5 text-xs font-medium text-primary">Focus brand</span>}
                          </td>
                          {displayColumns.map((col) => {
                            const cell = row.cells[col.id]
                            if (!cell) return <td key={col.id} className="px-4 py-2.5 text-right text-muted-foreground">–</td>
                            const showArrow = !isMean && !cell.hidden && col.id !== 'TOTAL' && cell.significance !== 0
                            return (
                              <td key={col.id} className={`px-4 py-2.5 text-right tabular-nums ${cell.hidden ? 'text-muted-foreground' : 'text-foreground'} ${isFocus ? 'font-semibold' : ''}`}>
                                {fmtCell(cell)}
                                {showArrow && (
                                  <span className={`ml-1 ${cell.significance === 1 ? 'text-sig-high' : 'text-sig-low'}`}>{cell.significance === 1 ? '▲' : '▼'}</span>
                                )}
                              </td>
                            )
                          })}
                        </tr>
                      )
                    })}
                    <tr className="border-t-2 border-border">
                      <td className="px-4 py-2 font-mono text-xs text-muted-foreground">Base (unweighted)</td>
                      {displayColumns.map((col) => (
                        <td key={col.id} className="px-4 py-2 text-right font-mono text-xs text-muted-foreground">
                          {baseRow?.cells[col.id] ? baseRow.cells[col.id]!.unweightedBase.toLocaleString() : '–'}
                        </td>
                      ))}
                    </tr>
                    <tr className="border-t border-border">
                      <td className="px-4 py-2 font-mono text-xs text-muted-foreground">Base (weighted)</td>
                      {displayColumns.map((col) => (
                        <td key={col.id} className="px-4 py-2 text-right font-mono text-xs text-muted-foreground">
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
                <p className="text-sm font-semibold text-foreground">
                  {q?.label ?? crossTab.row} by {columnLabel(crossTab.column)}
                </p>
                <div className="flex flex-wrap items-center gap-3">
                  <div className="inline-flex overflow-hidden rounded-[10px] border border-border">
                    {([
                      ['line', 'Line'],
                      ['column', 'Column'],
                      ['hbar', 'Horizontal bar'],
                      ['stacked', 'Stacked bar'],
                    ] as const).map(([t, label]) => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => setChartPick(t)}
                        disabled={!allowed[t]}
                        title={!allowed[t] ? (t === 'stacked' ? 'Stacked bars need a single-choice question shown as column %' : 'Needs more than one column') : undefined}
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
                  <span>{chartType === 'hbar' || crossTab.column === 'TOTAL' ? 'Total column' : ''}</span>
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
                {zoomBounds && (
                  <p className="mb-1 text-xs text-muted-foreground">Axis starts at {zoomBounds.lo}%</p>
                )}
                <ResponsiveContainer width="100%" height="100%">
                  {useRowsOnX ? (
                    chartType === 'hbar' ? (
                      <BarChart data={rowData} layout="vertical" margin={{ top: 8, right: 56, left: 8, bottom: 8 }}>
                        <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#E8E6EE" />
                        <XAxis type="number" domain={yDomain} tick={{ fontSize: 12 }} tickFormatter={tickFmt} />
                        <YAxis type="category" dataKey="name" width={130} tick={{ fontSize: 12 }} />
                        <Tooltip formatter={tipFmt} />
                        <Bar dataKey="v" radius={[0, 4, 4, 0]} isAnimationActive={false}
                          label={makeLabel({ sigs: [], showValue: dataLabels, showSig: false, fmt: fmtNumber, color: INK, horizontal: true })}>
                          {rowData.map((d, i) => (
                            <BarCell key={i} fill={isBrand ? (d.name === BRAND_FOCUS ? PURPLE : GREYS[0]) : RAMP[i % RAMP.length]} />
                          ))}
                        </Bar>
                      </BarChart>
                    ) : (
                      <BarChart data={rowData} margin={{ top: 24, right: 8, left: 0, bottom: 8 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E8E6EE" />
                        <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                        <YAxis domain={yDomain} tick={{ fontSize: 12 }} tickFormatter={tickFmt} width={44} />
                        <Tooltip formatter={tipFmt} />
                        <Bar dataKey="v" radius={[4, 4, 0, 0]} isAnimationActive={false}
                          label={makeLabel({ sigs: [], showValue: dataLabels, showSig: false, fmt: fmtNumber, color: INK })}>
                          {rowData.map((d, i) => (
                            <BarCell key={i} fill={isBrand ? (d.name === BRAND_FOCUS ? PURPLE : GREYS[0]) : RAMP[i % RAMP.length]} />
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
                      <XAxis dataKey="name" tick={{ fontSize: 12 }} />
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
            {isMean ? 'Means are not significance-tested.' : '▲▼ significant at 95%.'} Cells with a base under 30 are hidden (–). All numbers are calculated from the survey data.
          </p>
          </div>
        </div>
      </main>

      {toast && (
        <div role="status" className="fixed bottom-6 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-[10px] bg-foreground px-4 py-2.5 text-sm text-background shadow-lg">
          <span>Saved to storyboard</span>
          <button
            type="button"
            onClick={() => { setToast(''); navigate('/storyboards') }}
            className="font-medium underline underline-offset-2 hover:opacity-80"
          >
            View storyboard
          </button>
        </div>
      )}
    </div>
  )
}