import { useCallback, useMemo } from 'react'
import { useLensStore } from '@/store/useLensStore'
import { crosstab, type Filter } from '@/engine/crosstab'
import { QUESTIONS, WAVES, BRANDS, type QuestionDef } from '@/engine/questions'

const COLUMN_CHOICES: { id: 'TOTAL' | 'WAVE' | string; label: string }[] = [
  { id: 'TOTAL', label: 'Total' },
  { id: 'WAVE', label: 'Wave' },
  { id: 'AGE', label: 'Age group' },
  { id: 'GENDER', label: 'Gender' },
  { id: 'CITY', label: 'City type' },
  { id: 'SEC', label: 'Socio-economic class' },
]

const FILTER_VARIABLES: { id: string; label: string; options: { code: number | string; label: string }[] }[] = [
  { id: 'wave', label: 'Wave', options: WAVES.map((w) => ({ code: w, label: w })) },
  {
    id: 'AGE',
    label: 'Age group',
    options: QUESTIONS.AGE.options!.map((o) => ({ code: o.code, label: o.label })),
  },
  {
    id: 'GENDER',
    label: 'Gender',
    options: QUESTIONS.GENDER.options!.map((o) => ({ code: o.code, label: o.label })),
  },
  {
    id: 'CITY',
    label: 'City type',
    options: QUESTIONS.CITY.options!.map((o) => ({ code: o.code, label: o.label })),
  },
  {
    id: 'SEC',
    label: 'Socio-economic class',
    options: QUESTIONS.SEC.options!.map((o) => ({ code: o.code, label: o.label })),
  },
  { id: 'Q3', label: 'Main brand', options: BRANDS.map((b) => ({ code: b.code, label: b.label })) },
]

const SECTION_ORDER: ('Profile' | 'Brand funnel' | 'Consumption' | 'Attitudes' | 'Advocacy')[] = [
  'Profile',
  'Brand funnel',
  'Consumption',
  'Attitudes',
  'Advocacy',
]

const TYPE_TAG: Record<string, string> = {
  single: 'SINGLE',
  multi: 'MULTI',
  numeric: 'NUMERIC',
  grid: 'GRID',
  scale: 'SCALE',
}

const TYPE_TAG_STYLE: Record<string, string> = {
  single: 'bg-blue-50 text-blue-700 border-blue-200',
  multi: 'bg-green-50 text-green-700 border-green-200',
  numeric: 'bg-amber-50 text-amber-700 border-amber-200',
  grid: 'bg-purple-50 text-purple-700 border-purple-200',
  scale: 'bg-indigo-50 text-indigo-700 border-indigo-200',
}

const BRAND_FOCUS = 'Campa'

function columnLabel(colId: string): string {
  const found = COLUMN_CHOICES.find((c) => c.id === colId)
  if (found) return found.label
  const q = QUESTIONS[colId as keyof typeof QUESTIONS]
  return q ? q.label : colId
}

function rowLabelFor(rowId: string): string {
  const q = QUESTIONS[rowId as keyof typeof QUESTIONS]
  return q ? (q.wording || q.label) : rowId
}

function isBrandQuestion(rowId: string): boolean {
  return ['Q1', 'Q2', 'Q3'].includes(rowId)
}

function isMeanQuestion(rowId: string): boolean {
  const q = QUESTIONS[rowId as keyof typeof QUESTIONS]
  return q ? q.type === 'numeric' || q.type === 'scale' : false
}

export default function CrossTabs() {
  const crossTab = useLensStore((s) => s.crossTab)
  const setCrossTab = useLensStore((s) => s.setCrossTab)
  const waveScope = useLensStore((s) => s.waveScope)
  const weighted = useLensStore((s) => s.weighted)
  const setWeighted = useLensStore((s) => s.setWeighted)

  const effectiveFilters = useCallback((): Filter[] => {
    const filters: Filter[] = [...crossTab.filters]
    if (waveScope !== 'All' && crossTab.column !== 'WAVE') {
      filters.push({ variable: 'wave', codes: [waveScope] })
    }
    return filters
  }, [crossTab.filters, waveScope, crossTab.column])

  const result = useMemo(() => {
    return crosstab({
      row: crossTab.row,
      column: crossTab.column,
      filters: effectiveFilters(),
      weighted,
    })
  }, [crossTab.row, crossTab.column, crossTab.filters, effectiveFilters, weighted])

  const totalCol = result.columns.find((c) => c.id === 'TOTAL')
  const otherCols = result.columns.filter((c) => c.id !== 'TOTAL')
  const displayColumns = totalCol ? [totalCol, ...otherCols] : result.columns

  const isMean = isMeanQuestion(crossTab.row)
  const isBrand = isBrandQuestion(crossTab.row)

  const scopeText = useMemo((): string => {
    const parts: string[] = []
    if (waveScope !== 'All' && crossTab.column !== 'WAVE') {
      parts.push(`${waveScope} only`)
    }
    const userFilters = crossTab.filters
      .filter((f) => f.variable !== 'wave')
      .map((f) => {
        const v = FILTER_VARIABLES.find((v) => v.id === f.variable)
        const labels = f.codes
          .map((c) => {
            const o = v?.options?.find((opt) => String(opt.code) === String(c))
            return o ? o.label : String(c)
          })
          .join(', ')
        return v ? `${v.label}: ${labels}` : `${f.variable}: ${f.codes.join(', ')}`
      })
    parts.push(...userFilters)
    return parts.length > 0 ? parts.join(', ') : 'all respondents'
  }, [waveScope, crossTab.column, crossTab.filters])

  const sigText = useMemo((): string => {
    if (isMean) return 'means · not significance-tested'
    return crossTab.column === 'WAVE'
      ? 'significance vs previous wave at 95%'
      : 'significance vs Total at 95%'
  }, [isMean, crossTab.column])

  const formatCell = useCallback(
    (cell: { value: number; rawValue: number; unweightedBase: number }): string => {
      if (crossTab.stat === 'colpct') {
        if (isMean) {
          return cell.rawValue.toFixed(1)
        }
        return crossTab.decimals === 1 ? cell.rawValue.toFixed(1) : String(Math.round(cell.value))
      }
      if (isMean) {
        return String(Math.round(cell.value))
      }
      return String(Math.round((cell.rawValue / 100) * cell.unweightedBase))
    },
    [crossTab.stat, isMean, crossTab.decimals]
  )

  const questionsBySection = useMemo(() => {
    const grouped: Record<string, QuestionDef[]> = {}
    SECTION_ORDER.forEach((s) => (grouped[s] = []))
    Object.values(QUESTIONS).forEach((q) => {
      if (grouped[q.category]) grouped[q.category].push(q)
    })
    return grouped
  }, [])

  return (
    <div className="flex h-full w-full overflow-hidden bg-background">
      <aside className="w-[260px] min-w-[260px] max-w-[260px] flex flex-col shrink-0 border-r border-border bg-card p-4 overflow-y-auto">
        <div className="mb-4">
          <input
            type="text"
            placeholder="Search questions…"
            className="w-full px-2.5 py-1.5 text-xs border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary/50"
          />
          <p className="text-[10px] text-muted-foreground mt-1">
            {Object.values(QUESTIONS).length} questions
          </p>
        </div>
        <nav className="space-y-2">
          {SECTION_ORDER.map((section) => {
            const qs = questionsBySection[section]
            if (qs.length === 0) return null
            return (
              <div key={section} className="mb-2">
                <h3 className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5 px-1">
                  {section} ({qs.length})
                </h3>
                <div className="space-y-0.5">
                  {qs.map((q) => {
                    const isSelected = crossTab.row === q.id
                    const tag = TYPE_TAG[q.type]
                    return (
                      <button
                        key={q.id}
                        onClick={() => setCrossTab({ row: q.id })}
                        className={`w-full flex items-center justify-between px-2 py-1.5 rounded-lg text-xs transition-colors ${
                          isSelected
                            ? 'bg-secondary text-primary-foreground'
                            : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'
                        }`}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="truncate">{q.label}</span>
                          <span
                            className={`inline-block w-[52px] text-[9px] font-mono text-center border rounded px-1 py-0.5 ${
                              TYPE_TAG_STYLE[q.type]
                            }`}
                          >
                            {tag}
                          </span>
                        </div>
                        {isSelected && <span className="w-3 h-3 shrink-0 text-primary">{'✓'}</span>}
                      </button>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </nav>
      </aside>
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <div className="overflow-y-auto p-6">
          <div className="flex flex-wrap items-center gap-3 mb-4">
            <div className="flex items-center gap-2 text-sm font-medium text-foreground">
              Rows:
              <select
                value={crossTab.row}
                onChange={(e) => setCrossTab({ row: e.target.value })}
                className="text-xs bg-muted/70 border border-border rounded-md px-2 py-1 text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 cursor-pointer"
              >
                {Object.values(QUESTIONS).map((q) => (
                  <option key={q.id} value={q.id}>
                    {q.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-2 text-sm font-medium text-foreground">
              Columns: Total +
              <select
                value={crossTab.column}
                onChange={(e) => setCrossTab({ column: e.target.value as 'TOTAL' | 'WAVE' | string })}
                className="text-xs bg-muted/70 border border-border rounded-md px-2 py-1 text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 cursor-pointer"
              >
                {COLUMN_CHOICES.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>
              {waveScope !== 'All' && crossTab.column === 'WAVE' && (
                <span className="text-[10px] text-amber-700 bg-amber-100/50 border border-amber-200/50 rounded px-1.5 py-0.5">
                  Wave columns show all waves
                </span>
              )}
            </div>
            <div className="flex items-center gap-1 flex-wrap">
              {effectiveFilters().length === 0 ? (
                <span className="text-xs text-muted-foreground">All respondents</span>
              ) : (
                effectiveFilters().map((f, i) => {
                  const v = FILTER_VARIABLES.find((v) => v.id === f.variable)
                  const labels = f.codes
                    .map((c) => {
                      const o = v?.options?.find((opt) => String(opt.code) === String(c))
                      return o ? o.label : String(c)
                    })
                    .join(', ')
                  return (
                    <span
                      key={i}
                      className="flex items-center gap-1.5 px-2 py-1 rounded-lg border border-border bg-muted text-xs text-muted-foreground"
                    >
                      {v ? `${v.label}: ${labels}` : `${f.variable}: ${labels}`}
                      <button
                        onClick={() =>
                          setCrossTab({
                            filters: crossTab.filters.filter((_, idx) => idx !== i),
                          })
                        }
                        className="ml-1 text-[10px] text-muted-foreground hover:text-foreground"
                      >
                        ✕
                      </button>
                    </span>
                  )
                })
              )}
              <button
                className="text-xs border border-border rounded-md px-2 py-1 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                disabled
                title="Add filter coming soon"
              >
                + Add filter
              </button>
            </div>
            <div className="flex items-center gap-2 text-sm font-medium text-foreground ml-auto">
              <span>Column % | Counts</span>
              <div className="flex items-center overflow-hidden rounded-lg border border-border bg-background">
                <button
                  onClick={() => setCrossTab({ stat: 'colpct' })}
                  className={`px-3 py-1 text-xs transition-colors ${
                    crossTab.stat === 'colpct'
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:bg-muted'
                  }`}
                >
                  Column %
                </button>
                <button
                  onClick={() => setCrossTab({ stat: 'counts' })}
                  className={`px-3 py-1 text-xs transition-colors ${
                    crossTab.stat === 'counts'
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:bg-muted'
                  }`}
                >
                  Counts
                </button>
              </div>
              <label className="flex items-center gap-1 cursor-pointer text-xs text-muted-foreground">
                <input
                  type="checkbox"
                  checked={weighted}
                  onChange={(e) => setWeighted(e.target.checked)}
                  className="w-3 h-3 shrink-0 rounded border-border text-primary accent-primary"
                />
                Weighted
              </label>
              <div className="flex items-center overflow-hidden rounded-lg border border-border bg-background">
                {(['0', '1'] as const).map((d) => (
                  <button
                    key={d}
                    onClick={() => setCrossTab({ decimals: d as unknown as 0 | 1 })}
                    className={`px-2.5 py-1 text-xs transition-colors ${
                      String(crossTab.decimals) === d
                        ? 'bg-primary text-primary-foreground'
                        : 'text-muted-foreground hover:bg-muted'
                    }`}
                  >
                    Decimals: {d}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="mb-4 text-xs text-muted-foreground">
            Showing {rowLabelFor(crossTab.row)} by {columnLabel(crossTab.column)} ·{' '}
            {scopeText} · {weighted ? 'weighted' : 'unweighted'} ·{' '}
            {crossTab.stat === 'colpct' ? 'column %' : 'counts'} · {sigText}
          </div>
          <div className="rounded-xl border border-border bg-card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground bg-muted/50 border-b border-border">
                      {rowLabelFor(crossTab.row)}
                    </th>
                    {displayColumns.map((col) => (
                      <th
                        key={col.id}
                        className="px-4 py-3 text-right text-xs font-medium text-muted-foreground bg-muted/50 border-b border-border w-[90px]"
                      >
                        {col.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {result.rows.map((row) => {
                    const isFocus = isBrand && row.label === BRAND_FOCUS
                    return (
                      <tr
                        key={String(row.id)}
                        className={`border-b border-border ${isFocus ? 'bg-secondary/50' : ''}`}
                      >
                        <td className="px-4 py-3 text-xs font-medium text-foreground truncate w-[200px]">
                          {row.label}
                          {isFocus && (
                            <span className="ml-1.5 inline-block px-1.5 py-0.5 rounded text-[9px] font-medium bg-primary text-primary-foreground">
                              Focus brand
                            </span>
                          )}
                        </td>
                        {displayColumns.map((col) => {
                          const cell = row.cells[col.id]
                          if (!cell) {
                            return (
                              <td key={col.id} className="px-4 py-3 text-right text-xs text-muted-foreground w-[90px]">
                                –
                              </td>
                            )
                          }
                          const hidden = cell.hidden
                          const showArrow = !isMean && !hidden && col.id !== 'TOTAL' && cell.significance !== 0
                          const arrow =
                            cell.significance === 1
                              ? '▲'
                              : cell.significance === -1
                                ? '▼'
                                : ''
                          const arrowClass =
                            cell.significance === 1
                              ? 'text-sig-high'
                              : cell.significance === -1
                                ? 'text-sig-low'
                                : 'text-transparent'
                          const value = hidden ? '–' : formatCell(cell)
                          return (
                            <td
                              key={col.id}
                              className={`px-4 py-3 text-right text-xs w-[90px] ${
                                hidden ? 'text-muted-foreground' : 'text-foreground'
                              } tabular-nums`}
                            >
                              {value}
                              {showArrow ? (
                                <span className={`ml-1 ${arrowClass} font-semibold`}>{arrow}</span>
                              ) : null}
                            </td>
                          )
                        })}
                      </tr>
                    )
                  })}
                  {!isMean && (
                    <>
                      <tr className="border-t border-border border-t">
                        <td className="px-4 py-3 text-xs text-muted-foreground font-mono">
                          Unweighted base
                        </td>
                        {displayColumns.map((col) => {
                          const firstRow = result.rows[0]
                          const cell = firstRow?.cells[col.id]
                          return (
                            <td
                              key={col.id}
                              className="px-4 py-3 text-right text-xs font-mono text-muted-foreground w-[90px]"
                            >
                              {cell ? String(cell.unweightedBase) : '–'}
                            </td>
                          )
                        })}
                      </tr>
                      <tr>
                        <td className="px-4 py-3 text-xs text-muted-foreground font-mono">
                          Weighted base
                        </td>
                        {displayColumns.map((col) => {
                          const firstRow = result.rows[0]
                          const cell = firstRow?.cells[col.id]
                          return (
                            <td
                              key={col.id}
                              className="px-4 py-3 text-right text-xs font-mono text-muted-foreground w-[90px]"
                            >
                              {cell ? String(Math.round(cell.weightedBase)) : '–'}
                            </td>
                          )
                        })}
                      </tr>
                    </>
                  )}
                </tbody>
              </table>
            </div>
          </div>
          <div className="mt-4 text-[10px] text-muted-foreground leading-relaxed max-w-xl">
            <p>
              {rowLabelFor(crossTab.row)}. Base: all respondents.{' '}
              {weighted ? 'Weighted by wt.' : 'Unweighted.'} {sigText}. Cells with a base under 30 are hidden (“–”). All
              numbers computed from the survey data.
            </p>
          </div>
        </div>
      </main>
    </div>
  )
}