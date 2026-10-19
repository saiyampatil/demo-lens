import { useEffect, useMemo, useRef, useState, type ReactElement } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bar, BarChart, CartesianGrid, Cell as BarCell, Line, LineChart, ResponsiveContainer, XAxis, YAxis } from 'recharts'
import { useLensStore } from '@/store/useLensStore'
import { crosstab, type Filter } from '@/engine/crosstab'
import { QUESTIONS, type QuestionDef } from '@/engine/questions'

// ---------- types ----------
type Kind = 'line' | 'column' | 'hbar'
type Unit = 'pct' | 'mean' | 'count'
type ViewMode = 'slides' | 'outline' | 'dashboard'
type StoreState = ReturnType<typeof useLensStore.getState>
type Result = ReturnType<typeof crosstab>
type ResCell = NonNullable<Result['rows'][number]['cells'][string]>
type SavedView = {
  id: string
  title: string
  crossTab: { row: string; column: string; filters: Filter[]; stat: 'colpct' | 'counts'; decimals: 0 | 1 }
  waveScope: string
  weighted: boolean
  chartType?: string
  savedAt: string
}
type SlideMeta = { headline: string; takeaway: string; notes: string; kind?: Kind; focusOnly: boolean }
type Board = { title: string; order: string[]; meta: Record<string, SlideMeta> }
type Series = { label: string; color: string; isFocus: boolean; values: (number | null)[]; sigs: number[] }
type Model = {
  kind: Kind
  orientation: 'cols' | 'rows' // what the categories are: table columns, or table rows
  lineAllowed: boolean
  categories: string[]
  series: Series[]
  unit: Unit
  yMax: number | null
  highlight: string | null
  isBrand: boolean
  questionLabel: string
  definition: string
  footnote: string
  minBase: number
  hidden: number
  suggested: string
}
type LabelProps = { x?: number | string; y?: number | string; width?: number | string; height?: number | string; index?: number; value?: unknown }

// ---------- constants ----------
const PURPLE = '#6B47D6'
const INK = '#1A1A1A'
const MUTED = '#717680'
const GREYS = ['#C9C6D3', '#A9A5B8', '#8E8A9E', '#B8B4C6', '#D9D6E3']
const RAMP = ['#4E2FB8', '#6B47D6', '#9E77ED', '#C4ADF6', '#E6DCFD']
const FOCUS = 'Campa'
const BOARD_KEY = 'lens-storyboard-v1'
const PROFILE = ['AGE', 'GENDER', 'CITY', 'SEC']
const METRIC: Record<string, string> = { Q1: 'awareness', Q2: 'trial', Q3: 'main-brand share' }
const COL_LABEL: Record<string, string> = { WAVE: 'Wave', AGE: 'Age group', GENDER: 'Gender', CITY: 'City type', SEC: 'Socio-economic class', TOTAL: 'Total' }
const EMPTY_META: SlideMeta = { headline: '', takeaway: '', notes: '', focusOnly: false }

// ---------- helpers ----------
const qDef = (id: string): QuestionDef | undefined => QUESTIONS[id as keyof typeof QUESTIONS]
const n = (v: number | string | undefined) => (typeof v === 'number' ? v : Number(v ?? 0))
const fmt = (unit: Unit, v: number) => (unit === 'pct' ? `${Math.round(v)}%` : unit === 'mean' ? v.toFixed(1) : Math.round(v).toLocaleString())
const pts = (d: number) => {
  const r = Math.abs(Math.round(d))
  return `${r} ${r === 1 ? 'pt' : 'pts'}`
}
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const safeName = (s: string) => s.replace(/[^a-z0-9-_ ]/gi, '').trim().replace(/\s+/g, '_') || 'storyboard'

function parseSaved(r: unknown): SavedView | null {
  if (typeof r !== 'object' || r === null) return null
  const o = r as Record<string, unknown>
  const ct = o.crossTab as Record<string, unknown> | undefined
  if (typeof o.id !== 'string' || !ct || typeof ct.row !== 'string' || typeof ct.column !== 'string') return null
  return {
    id: o.id,
    title: typeof o.title === 'string' ? o.title : 'Saved view',
    crossTab: {
      row: ct.row,
      column: ct.column,
      filters: Array.isArray(ct.filters) ? (ct.filters as Filter[]) : [],
      stat: ct.stat === 'counts' ? 'counts' : 'colpct',
      decimals: Number(ct.decimals) === 1 ? 1 : 0,
    },
    waveScope: typeof o.waveScope === 'string' ? o.waveScope : 'All',
    weighted: o.weighted !== false,
    chartType: typeof o.chartType === 'string' ? o.chartType : undefined,
    savedAt: typeof o.savedAt === 'string' ? o.savedAt : new Date().toISOString(),
  }
}

function loadBoard(): Board {
  try {
    const s = localStorage.getItem(BOARD_KEY)
    if (s) {
      const b = JSON.parse(s) as Board
      if (Array.isArray(b.order) && typeof b.meta === 'object') return b
    }
  } catch {
    /* ignore */
  }
  return { title: 'Campa brand health', order: [], meta: {} }
}

function filterText(f: Filter): string {
  const variable = String(f.variable)
  if (variable === 'wave') return `Wave: ${f.codes.join(', ')}`
  const q = qDef(variable)
  const labels = f.codes.map((c) => q?.options?.find((o) => String(o.code) === String(c))?.label ?? String(c))
  return `${q?.label ?? variable}: ${labels.join(', ')}`
}

function baseText(id: string): string {
  if (id === 'Q3') return 'respondents who tried at least one brand'
  if (id === 'Q4' || id === 'Q6') return 'respondents with a main brand'
  if (id === 'Q5') return 'all respondents excluding "don\'t know"'
  return 'all respondents'
}

function buildModel(v: SavedView, meta: SlideMeta | undefined): Model {
  const ct = v.crossTab
  const q = qDef(ct.row)
  const isMean = q ? ['numeric', 'scale', 'grid'].includes(q.type) : false
  const isBrand = ['Q1', 'Q2', 'Q3'].includes(ct.row)
  const unit: Unit = isMean ? 'mean' : ct.stat === 'counts' ? 'count' : 'pct'
  const scoped = v.waveScope !== 'All' && ct.column !== 'WAVE'
  const filters: Filter[] = [...ct.filters]
  if (scoped) filters.push({ variable: 'wave', codes: [v.waveScope] } as Filter)

  const res = crosstab({ row: ct.row, column: ct.column, filters, weighted: v.weighted })
  const others = res.columns.filter((c) => c.id !== 'TOTAL')
  const multi = others.length > 1 && ct.column !== 'TOTAL'
  const savedKind = meta?.kind ?? (v.chartType === 'line' || v.chartType === 'column' || v.chartType === 'hbar' ? v.chartType : undefined)
  let kind: Kind = savedKind ?? (ct.column === 'WAVE' && multi ? 'line' : 'column')
  if (kind === 'line' && !multi) kind = 'column'

  let hidden = 0
  const val = (cell: ResCell | undefined): number | null => {
    if (!cell) return null
    if (cell.hidden) {
      hidden++
      return null
    }
    if (unit === 'mean') return cell.rawValue
    if (unit === 'count') return (cell.rawValue / 100) * (v.weighted ? cell.weightedBase : cell.unweightedBase)
    return cell.rawValue
  }

  let orientation: 'cols' | 'rows'
  let categories: string[]
  let series: Series[]

  if (multi && kind !== 'hbar') {
    // categories = table columns (e.g. waves), one series per row (e.g. brand)
    orientation = 'cols'
    categories = others.map((c) => c.label)
    series = res.rows.map((r, i) => ({
      label: r.label,
      isFocus: isBrand && r.label === FOCUS,
      color: isBrand ? (r.label === FOCUS ? PURPLE : GREYS[i % GREYS.length]!) : RAMP[i % RAMP.length]!,
      values: others.map((c) => val(r.cells[c.id])),
      sigs: others.map((c) => (isMean ? 0 : r.cells[c.id]?.significance ?? 0)),
    }))
    if (meta?.focusOnly && isBrand) {
      const f = series.filter((s) => s.isFocus)
      if (f.length) series = f
    }
  } else if (multi) {
    // horizontal bars: categories = table rows, one series per column (latest wave highlighted)
    orientation = 'rows'
    categories = res.rows.map((r) => r.label)
    const last = others.length - 1
    series = others.map((c, i) => ({
      label: c.label,
      isFocus: ct.column === 'WAVE' ? i === last : false,
      color: ct.column === 'WAVE' ? (i === last ? PURPLE : GREYS[(last - 1 - i) % GREYS.length]!) : RAMP[i % RAMP.length]!,
      values: res.rows.map((r) => val(r.cells[c.id])),
      sigs: res.rows.map((r) => (isMean ? 0 : r.cells[c.id]?.significance ?? 0)),
    }))
  } else {
    // a single Total column
    orientation = 'rows'
    categories = res.rows.map((r) => r.label)
    series = [{
      label: 'Total',
      isFocus: false,
      color: PURPLE,
      values: res.rows.map((r) => val(r.cells['TOTAL'])),
      sigs: res.rows.map(() => 0),
    }]
  }

  const baseRow = res.rows[0]
  const used = multi ? others : res.columns.filter((c) => c.id === 'TOTAL')
  const bases = used.map((c) => baseRow?.cells[c.id]?.unweightedBase ?? 0).filter((b) => b > 0)
  const minBase = bases.length ? Math.min(...bases) : 0
  const scopeParts = [...(scoped ? [`${v.waveScope} only`] : []), ...ct.filters.map(filterText)]
  const scopeTxt = scopeParts.length ? scopeParts.join(', ') : 'all respondents'
  const sig = isMean ? 'Means are not significance-tested.' : ct.column === 'WAVE' ? '▲▼ significant vs previous wave at 95%.' : ct.column === 'TOTAL' ? '' : '▲▼ significant vs Total at 95%.'
  const questionLabel = q?.label ?? ct.row
  const definition = `${questionLabel} by ${COL_LABEL[ct.column] ?? ct.column} · ${scopeTxt} · ${v.weighted ? 'weighted' : 'unweighted'} · ${unit === 'pct' ? 'column %' : unit === 'mean' ? 'means' : 'counts'}`
  const footnote = `${ct.row}. ${q?.wording ?? questionLabel}. Base: ${baseText(ct.row)}${scopeParts.length ? ` (${scopeTxt})` : ''}; smallest base n=${minBase.toLocaleString()}. ${v.weighted ? 'Weighted by age × gender.' : 'Unweighted.'} ${sig} Source: Campa Beverage Tracker, India · Pulse AI Lens.`.replace(/\s+/g, ' ').trim()

  const model: Model = {
    kind, orientation, lineAllowed: multi, categories, series, unit,
    yMax: unit === 'pct' ? 100 : ct.row === 'Q6' ? 10 : ct.row === 'Q4' ? 5 : null,
    highlight: isBrand && series.length === 1 ? FOCUS : null,
    isBrand, questionLabel, definition, footnote, minBase, hidden, suggested: '',
  }
  model.suggested = suggestHeadline(model, ct.row, ct.column)
  return model
}

function suggestHeadline(m: Model, row: string, column: string): string {
  const isProfile = PROFILE.includes(row)
  const metric = METRIC[row] ?? m.questionLabel.toLowerCase()
  const f = (x: number) => fmt(m.unit, x)
  const points = (s: Series | undefined) =>
    (s?.values ?? [])
      .map((x, i) => ({ x, c: m.categories[i] ?? '' }))
      .filter((p): p is { x: number; c: string } => p.x !== null)

  if (m.orientation === 'cols') {
    const s = m.series.find((x) => x.isFocus) ?? m.series[0]
    const p = points(s)
    if (!s || p.length === 0) return m.questionLabel
    if (column === 'WAVE' && p.length > 1) {
      const a = p[0]!
      const b = p[p.length - 1]!
      const d = b.x - a.x
      const dTxt = m.unit === 'pct' ? pts(d) : Math.abs(d).toFixed(1)
      const subject = isProfile ? `The ${s.label} share of the sample` : `${s.label} ${metric}`
      return `${subject} ${d >= 0 ? 'reaches' : 'falls to'} ${f(b.x)} in ${b.c}, ${d >= 0 ? 'up' : 'down'} ${dTxt} since ${a.c}`
    }
    const top = p.reduce((acc, c) => (c.x > acc.x ? c : acc), p[0]!)
    const low = p.reduce((acc, c) => (c.x < acc.x ? c : acc), p[0]!)
    return `${s.label} ${metric} is highest among ${top.c} (${f(top.x)}) and lowest among ${low.c} (${f(low.x)})`
  }

  // categories are table rows: describe the latest column (or Total)
  const s = m.series[m.series.length - 1]
  const p = points(s)
  if (!s || p.length === 0) return m.questionLabel
  const where = m.series.length > 1 ? ` in ${s.label}` : ''
  const top = p.reduce((acc, c) => (c.x > acc.x ? c : acc), p[0]!)
  if (isProfile) return `${top.c} is the largest ${m.questionLabel.toLowerCase()} at ${f(top.x)}${where}`
  const focus = m.isBrand ? p.find((x) => x.c === FOCUS) : undefined
  if (focus && focus.c !== top.c) return `${top.c} leads ${metric} at ${f(top.x)}${where}; ${FOCUS} is at ${f(focus.x)}`
  return `${top.c} leads ${metric} at ${f(top.x)}${where}`
}

function makeLabel(opts: { sigs: number[]; showValue: boolean; unit: Unit; color: string; horizontal?: boolean }) {
  const SlideLabel = (p: LabelProps) => {
    if (typeof p.value !== 'number') return <g />
    const sig = opts.sigs[p.index ?? -1] ?? 0
    if (!opts.showValue && sig === 0) return <g />
    const text = `${opts.showValue ? fmt(opts.unit, p.value) : ''}${sig === 1 ? ' ▲' : sig === -1 ? ' ▼' : ''}`.trim()
    const fill = sig === 1 ? '#15803D' : sig === -1 ? '#C0362C' : opts.color
    const x = n(p.x)
    const y = n(p.y)
    const w = n(p.width)
    const h = n(p.height)
    if (opts.horizontal) return <text x={x + w + 6} y={y + h / 2} dominantBaseline="middle" fontSize={12} fill={fill}>{text}</text>
    return <text x={x + (w ? w / 2 : 0)} y={y - 8} textAnchor="middle" fontSize={12} fill={fill}>{text}</text>
  }
  return SlideLabel
}

function SlideChart({ m, width, height }: { m: Model; width?: number; height: number | 'fill' }) {
  const domain: [number, number | 'auto'] = [0, m.yMax ?? 'auto']
  const tick = (v: unknown) => (typeof v === 'number' ? (m.unit === 'pct' ? `${v}%` : String(v)) : '')
  const single = m.series.length === 1
  const showValFor = (s: Series) => m.series.length <= 2 || s.isFocus
  const colorFor = (s: Series) => (s.isFocus || !m.isBrand ? INK : MUTED)
  const cellFill = (name: string, i: number) => (m.highlight ? (name === m.highlight ? PURPLE : GREYS[0]!) : RAMP[i % RAMP.length]!)
  const h = typeof height === 'number' ? height : undefined
  const data = m.categories.map((c, i) => {
    const d: Record<string, string | number | null> = { name: c }
    m.series.forEach((s, si) => (d[`s${si}`] = s.values[i] ?? null))
    return d
  })

  let chart: ReactElement
  if (m.kind === 'hbar') {
    chart = (
      <BarChart width={width} height={h} data={data} layout="vertical" margin={{ top: 4, right: 64, left: 8, bottom: 4 }} barCategoryGap="20%">
        <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#E8E6EE" />
        <XAxis type="number" domain={domain} tick={{ fontSize: 12 }} tickFormatter={tick} />
        <YAxis type="category" dataKey="name" width={110} tick={{ fontSize: 12 }} />
        {m.series.map((s, si) => (
          <Bar key={si} dataKey={`s${si}`} fill={s.color} radius={[0, 4, 4, 0]} isAnimationActive={false}
            label={makeLabel({ sigs: s.sigs, showValue: showValFor(s), unit: m.unit, color: colorFor(s), horizontal: true })}>
            {single ? data.map((d, i) => <BarCell key={i} fill={cellFill(String(d.name), i)} />) : null}
          </Bar>
        ))}
      </BarChart>
    )
  } else if (m.kind === 'line') {
    const order = m.series.map((s, si) => ({ s, si })).sort((a, b) => Number(a.s.isFocus) - Number(b.s.isFocus))
    chart = (
      <LineChart width={width} height={h} data={data} margin={{ top: 24, right: 24, left: 0, bottom: 4 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E8E6EE" />
        <XAxis dataKey="name" tick={{ fontSize: 12 }} />
        <YAxis domain={domain} tick={{ fontSize: 12 }} tickFormatter={tick} width={44} />
        {order.map(({ s, si }) => (
          <Line key={si} type="linear" dataKey={`s${si}`} stroke={s.color} strokeWidth={s.isFocus ? 3 : 1.5} dot={{ r: s.isFocus ? 4 : 2.5 }}
            isAnimationActive={false} label={makeLabel({ sigs: s.sigs, showValue: showValFor(s), unit: m.unit, color: colorFor(s) })} />
        ))}
      </LineChart>
    )
  } else {
    chart = (
      <BarChart width={width} height={h} data={data} margin={{ top: 24, right: 8, left: 0, bottom: 4 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E8E6EE" />
        <XAxis dataKey="name" tick={{ fontSize: 12 }} />
        <YAxis domain={domain} tick={{ fontSize: 12 }} tickFormatter={tick} width={44} />
        {m.series.map((s, si) => (
          <Bar key={si} dataKey={`s${si}`} fill={s.color} radius={[4, 4, 0, 0]} isAnimationActive={false}
            label={makeLabel({ sigs: s.sigs, showValue: showValFor(s), unit: m.unit, color: colorFor(s) })}>
            {single ? data.map((d, i) => <BarCell key={i} fill={cellFill(String(d.name), i)} />) : null}
          </Bar>
        ))}
      </BarChart>
    )
  }
  if (width) return chart
  return <ResponsiveContainer width="100%" height={height === 'fill' ? '100%' : height}>{chart}</ResponsiveContainer>
}

function Legend({ m }: { m: Model }) {
  if (m.series.length < 2) return null
  return (
    <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
      {m.series.map((s) => (
        <span key={s.label} className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: s.color }} />
          <span className={s.isFocus ? 'font-medium text-foreground' : ''}>{s.label}</span>
        </span>
      ))}
    </div>
  )
}

// ---------- exports ----------
type SlideData = { v: SavedView; m: Model; meta: SlideMeta }

async function exportPptx(title: string, slides: SlideData[]) {
  const { default: PptxGenJS } = await import('pptxgenjs')
  const pptx = new PptxGenJS()
  pptx.layout = 'LAYOUT_WIDE'
  pptx.title = title
  const font = 'Calibri'
  const cover = pptx.addSlide()
  cover.background = { color: 'F7F7F5' }
  cover.addText(title, { x: 0.6, y: 2.5, w: 12, h: 1, fontSize: 36, bold: true, color: '1A1A1A', fontFace: font })
  cover.addText(`Campa Beverage Tracker · India · ${new Date().toLocaleDateString()}`, { x: 0.6, y: 3.5, w: 12, h: 0.5, fontSize: 16, color: '717680', fontFace: font })
  slides.forEach(({ m, meta }, i) => {
    const s = pptx.addSlide()
    s.addText(meta.headline || m.suggested, { x: 0.5, y: 0.3, w: 12.3, h: 0.8, fontSize: 26, bold: true, color: '1A1A1A', fontFace: font, valign: 'top' })
    if (meta.takeaway) s.addText(meta.takeaway, { x: 0.5, y: 1.05, w: 12.3, h: 0.5, fontSize: 14, color: '717680', fontFace: font })
    const code = m.unit === 'pct' ? '0"%"' : m.unit === 'mean' ? '0.0' : '#,##0'
    const data = m.series.map((se) => ({ name: se.label, labels: m.categories, values: se.values.map((x) => x ?? 0) }))
    s.addChart(m.kind === 'line' ? pptx.ChartType.line : pptx.ChartType.bar, data, {
      x: 0.5, y: 1.65, w: 12.3, h: 4.9,
      barDir: m.kind === 'hbar' ? 'bar' : 'col',
      chartColors: m.series.map((se) => (m.series.length > 1 ? se.color : PURPLE).replace('#', '')),
      showValue: true,
      dataLabelFormatCode: code,
      dataLabelFontSize: 11,
      valAxisMinVal: 0,
      ...(m.yMax ? { valAxisMaxVal: m.yMax } : {}),
      valAxisLabelFormatCode: code,
      catAxisLabelFontSize: 12,
      valAxisLabelFontSize: 11,
      showLegend: m.series.length > 1,
      legendPos: 'b',
      legendFontSize: 11,
      lineSize: 2,
      lineDataSymbol: 'circle',
      lineDataSymbolSize: 7,
    })
    s.addText(m.footnote, { x: 0.5, y: 6.7, w: 11.6, h: 0.6, fontSize: 9, color: '9A9AA5', fontFace: font, valign: 'top' })
    s.addText(String(i + 1), { x: 12.3, y: 6.95, w: 0.5, h: 0.3, fontSize: 9, color: '9A9AA5', align: 'right' })
    if (meta.notes) s.addNotes(meta.notes)
  })
  await pptx.writeFile({ fileName: `${safeName(title)}.pptx` })
}

function downloadHtml(title: string, slides: SlideData[], svgs: Record<string, string>) {
  const date = new Date().toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })
  const cards = slides
    .map(({ v, m, meta }, i) => `
      <article class="card">
        <p class="num">${i + 1}</p>
        <h2>${esc(meta.headline || m.suggested)}</h2>
        ${meta.takeaway ? `<p class="take">${esc(meta.takeaway)}</p>` : ''}
        ${m.series.length > 1 ? `<p class="legend">${m.series.map((s) => `<span><i style="background:${s.color}"></i>${esc(s.label)}</span>`).join('')}</p>` : ''}
        <div class="chart">${svgs[v.id] ?? ''}</div>
        <p class="foot">${esc(m.footnote)}</p>
      </article>`)
    .join('')
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<style>
*{box-sizing:border-box}body{margin:0;background:#F7F7F5;color:#1A1A1A;font-family:Inter,-apple-system,Segoe UI,Roboto,sans-serif}
header{max-width:1200px;margin:0 auto;padding:40px 24px 8px}h1{margin:0;font-size:28px}header p{margin:6px 0 0;color:#717680;font-size:14px}
main{max-width:1200px;margin:0 auto;padding:24px;display:grid;grid-template-columns:repeat(auto-fit,minmax(480px,1fr));gap:20px}
.card{background:#fff;border:1px solid #E8E6EE;border-radius:14px;padding:20px}.num{margin:0;color:#9A9AA5;font-size:12px}
h2{margin:4px 0 0;font-size:18px;line-height:1.35}.take{margin:6px 0 0;color:#717680;font-size:14px}
.legend{margin:10px 0 0;font-size:12px;color:#717680;display:flex;gap:12px;flex-wrap:wrap}.legend i{display:inline-block;width:10px;height:10px;border-radius:2px;margin-right:6px;vertical-align:-1px}
.chart{margin-top:8px;overflow-x:auto}.chart svg{max-width:100%;height:auto}.foot{margin:10px 0 0;color:#9A9AA5;font-size:11px;line-height:1.5}
footer{max-width:1200px;margin:0 auto;padding:8px 24px 40px;color:#9A9AA5;font-size:12px}
</style></head><body>
<header><h1>${esc(title)}</h1><p>Campa Beverage Tracker · India · Snapshot of ${esc(date)} · ${slides.length} findings</p></header>
<main>${cards}</main>
<footer>Exported from Pulse AI Lens. This file is a dated snapshot; every number was calculated from the survey data at export time.</footer>
</body></html>`
  const url = URL.createObjectURL(new Blob([html], { type: 'text/html;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = `${safeName(title)}_dashboard.html`
  a.click()
  URL.revokeObjectURL(url)
}

// ---------- page ----------
const card = 'rounded-[14px] border border-border bg-card'
const btn = 'h-9 rounded-[10px] border border-border bg-card px-3 text-sm font-medium text-foreground hover:bg-muted focus:outline-none focus:ring-2 focus:ring-primary/40 disabled:opacity-50'
const btnPrimary = 'h-9 rounded-[10px] bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-primary/40 disabled:opacity-50'
const seg = (on: boolean) => `px-3 py-1.5 text-xs font-medium transition-colors focus:outline-none ${on ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground'} disabled:opacity-40`
const iconBtn = 'rounded-[6px] px-1.5 py-0.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30'

function SlideFace({ s, big = false }: { s: SlideData; big?: boolean }) {
  return (
    <div className={`flex h-full flex-col bg-white ${big ? 'p-10' : 'p-6'}`}>
      <h2 className={`${big ? 'text-3xl' : 'text-xl'} shrink-0 font-semibold leading-snug text-[#1A1A1A]`}>{s.meta.headline || s.m.suggested}</h2>
      {s.meta.takeaway && <p className={`${big ? 'mt-2 text-lg' : 'mt-1 text-sm'} shrink-0 text-[#717680]`}>{s.meta.takeaway}</p>}
      <div className="mt-2 shrink-0"><Legend m={s.m} /></div>
      <div className="relative mt-2 min-h-0 flex-1">
        <div className="absolute inset-0">
          <SlideChart m={s.m} height="fill" />
        </div>
      </div>
      <p className="mt-3 line-clamp-2 shrink-0 text-xs leading-relaxed text-[#9A9AA5]">{s.m.footnote}</p>
    </div>
  )
}

export default function Storyboards() {
  const navigate = useNavigate()
  const savedRaw = useLensStore((s) => s.savedResults)
  const setCrossTab = useLensStore((s) => s.setCrossTab)

  const [board, setBoard] = useState<Board>(() => loadBoard())
  const [mode, setMode] = useState<ViewMode>('slides')
  const [selected, setSelected] = useState<string | null>(null)
  const [presenting, setPresenting] = useState<number | null>(null)
  const [exportOpen, setExportOpen] = useState(false)
  const [busy, setBusy] = useState('')
  const [snapshot, setSnapshot] = useState(false)
  const [dragId, setDragId] = useState<string | null>(null)
  const [undo, setUndo] = useState<{ item: unknown; meta: SlideMeta; index: number } | null>(null)
  const snapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    try {
      localStorage.setItem(BOARD_KEY, JSON.stringify(board))
    } catch {
      /* ignore */
    }
  }, [board])

  const saved = useMemo(() => savedRaw.map(parseSaved).filter((x): x is SavedView => x !== null), [savedRaw])
  const ids = useMemo(() => {
    const exist = new Set(saved.map((s) => s.id))
    const ordered = board.order.filter((id) => exist.has(id))
    return [...ordered, ...saved.map((s) => s.id).filter((id) => !ordered.includes(id))]
  }, [saved, board.order])

  const slides: SlideData[] = useMemo(() => {
    const byId = new Map(saved.map((s) => [s.id, s]))
    return ids.flatMap((id) => {
      const v = byId.get(id)
      if (!v) return []
      const meta = board.meta[id] ?? EMPTY_META
      return [{ v, m: buildModel(v, meta), meta }]
    })
  }, [ids, saved, board.meta])

  const current = slides.find((s) => s.v.id === selected) ?? slides[0]
  const currentIndex = current ? slides.indexOf(current) : -1

  const setMeta = (id: string, patch: Partial<SlideMeta>) =>
    setBoard((b) => ({ ...b, meta: { ...b.meta, [id]: { ...(b.meta[id] ?? EMPTY_META), ...patch } } }))
  const setOrder = (order: string[]) => setBoard((b) => ({ ...b, order }))
  const move = (id: string, delta: number) => {
    const o = [...ids]
    const i = o.indexOf(id)
    const j = i + delta
    if (i < 0 || j < 0 || j >= o.length) return
    ;[o[i], o[j]] = [o[j]!, o[i]!]
    setOrder(o)
  }
  const dropOn = (targetId: string) => {
    if (!dragId || dragId === targetId) return
    const o = ids.filter((x) => x !== dragId)
    o.splice(o.indexOf(targetId), 0, dragId)
    setOrder(o)
    setDragId(null)
  }
  const remove = (id: string) => {
    const index = ids.indexOf(id)
    const item = savedRaw.find((r) => parseSaved(r)?.id === id)
    setUndo({ item, meta: board.meta[id] ?? EMPTY_META, index })
    useLensStore.setState((s: StoreState) => ({ savedResults: s.savedResults.filter((r) => parseSaved(r)?.id !== id) as StoreState['savedResults'] }))
    if (selected === id) setSelected(null)
    window.setTimeout(() => setUndo((u) => (u && u.index === index ? null : u)), 6000)
  }
  const restore = () => {
    if (!undo?.item) return
    const id = parseSaved(undo.item)?.id
    useLensStore.setState((s: StoreState) => ({ savedResults: [...s.savedResults, undo.item] as StoreState['savedResults'] }))
    if (id) {
      const o = ids.filter((x) => x !== id)
      o.splice(Math.min(undo.index, o.length), 0, id)
      setBoard((b) => ({ ...b, order: o, meta: { ...b.meta, [id]: undo.meta } }))
    }
    setUndo(null)
  }
  const duplicate = (id: string) => {
    const src = savedRaw.find((r) => parseSaved(r)?.id === id)
    if (!src || typeof src !== 'object') return
    const newId = `${Date.now()}`
    const copy = { ...(src as Record<string, unknown>), id: newId, savedAt: new Date().toISOString() }
    useLensStore.setState((s: StoreState) => ({ savedResults: [...s.savedResults, copy] as StoreState['savedResults'] }))
    const o = [...ids]
    o.splice(o.indexOf(id) + 1, 0, newId)
    setBoard((b) => ({ ...b, order: o, meta: { ...b.meta, [newId]: { ...(b.meta[id] ?? EMPTY_META) } } }))
    setSelected(newId)
  }
  const openInCrossTabs = (v: SavedView) => {
    setCrossTab({ ...v.crossTab })
    useLensStore.setState({ waveScope: v.waveScope, weighted: v.weighted } as Partial<StoreState>)
    navigate('/cross-tabs')
  }

  const doPptx = async () => {
    setExportOpen(false)
    setBusy('Building PowerPoint…')
    try {
      await exportPptx(board.title, slides)
    } finally {
      setBusy('')
    }
  }
  const doHtml = () => {
    setExportOpen(false)
    setBusy('Building dashboard…')
    setSnapshot(true)
  }
  useEffect(() => {
    if (!snapshot) return
    let r2 = 0
    const r1 = requestAnimationFrame(() => {
      r2 = requestAnimationFrame(() => {
        const svgs: Record<string, string> = {}
        snapRef.current?.querySelectorAll<HTMLElement>('[data-slide]').forEach((el) => {
          svgs[el.dataset.slide ?? ''] = el.querySelector('svg')?.outerHTML ?? ''
        })
        downloadHtml(board.title, slides, svgs)
        setSnapshot(false)
        setBusy('')
      })
    })
    return () => {
      cancelAnimationFrame(r1)
      cancelAnimationFrame(r2)
    }
  }, [snapshot, board.title, slides])

  useEffect(() => {
    if (presenting === null) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPresenting(null)
      if (e.key === 'ArrowRight' || e.key === ' ') setPresenting((p) => (p === null ? p : Math.min(slides.length - 1, p + 1)))
      if (e.key === 'ArrowLeft') setPresenting((p) => (p === null ? p : Math.max(0, p - 1)))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [presenting, slides.length])

  // ---------- empty state ----------
  if (slides.length === 0) {
    return (
      <div className="h-full w-full overflow-y-auto">
        <div className="mx-auto flex max-w-xl flex-col items-center p-12 text-center">
          <h1 className="text-2xl font-semibold text-foreground">Storyboards</h1>
          <p className="mt-3 text-sm text-muted-foreground">
            A storyboard turns your findings into a deck. Build a table in Cross-tabs, click <span className="font-medium text-foreground">Save to storyboard</span>, and it appears here as a slide, ready to export to PowerPoint or share as a dashboard.
          </p>
          <button type="button" className={`${btnPrimary} mt-6`} onClick={() => navigate('/cross-tabs')}>Go to Cross-tabs</button>
          {undo && <button type="button" className="mt-4 text-sm text-primary hover:underline" onClick={restore}>Undo remove</button>}
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full w-full flex-col overflow-hidden">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-card px-6 py-3">
        <div className="min-w-0">
          <input
            value={board.title}
            onChange={(e) => setBoard((b) => ({ ...b, title: e.target.value }))}
            aria-label="Storyboard title"
            className="w-full min-w-[240px] rounded-[8px] bg-transparent px-1 text-xl font-semibold text-foreground hover:bg-muted/60 focus:bg-background focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
          <p className="px-1 text-xs text-muted-foreground">{slides.length} slide{slides.length === 1 ? '' : 's'} · live from the survey data · saved automatically</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex overflow-hidden rounded-[10px] border border-border">
            {(['slides', 'outline', 'dashboard'] as const).map((v) => (
              <button key={v} type="button" onClick={() => setMode(v)} className={seg(mode === v)}>{v[0]!.toUpperCase() + v.slice(1)}</button>
            ))}
          </div>
          <button type="button" className={btn} onClick={() => setPresenting(Math.max(0, currentIndex))}>Present</button>
          <div className="relative">
            <button type="button" className={btnPrimary} onClick={() => setExportOpen((o) => !o)} disabled={!!busy}>{busy || 'Export ▾'}</button>
            {exportOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setExportOpen(false)} />
                <div className={`${card} absolute right-0 top-11 z-20 w-80 p-2 shadow-lg`}>
                  <button type="button" className="w-full rounded-[8px] p-3 text-left hover:bg-muted" onClick={() => void doPptx()}>
                    <p className="text-sm font-medium text-foreground">PowerPoint (.pptx)</p>
                    <p className="text-xs text-muted-foreground">Editable native charts, headlines, sources and speaker notes.</p>
                  </button>
                  <button type="button" className="w-full rounded-[8px] p-3 text-left hover:bg-muted" onClick={doHtml}>
                    <p className="text-sm font-medium text-foreground">Dashboard (.html)</p>
                    <p className="text-xs text-muted-foreground">One file anyone can open in a browser. No login needed; a dated snapshot.</p>
                  </button>
                  <p className="px-3 pb-2 pt-1 text-xs text-muted-foreground">Live hosted dashboards with links will come in a later release.</p>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Body */}
      {mode === 'slides' && current && (
        <div className="flex min-h-0 flex-1">
          {/* Rail */}
          <aside className="w-[220px] shrink-0 overflow-y-auto border-r border-border bg-card p-3">
            <div className="mb-2 flex items-center justify-between px-1">
              <span className="text-xs font-medium text-muted-foreground">Slides</span>
              <button type="button" className="text-xs text-primary hover:underline" onClick={() => navigate('/cross-tabs')}>+ Add</button>
            </div>
            <ol className="space-y-2">
              {slides.map((s, i) => {
                const on = s.v.id === current.v.id
                return (
                  <li
                    key={s.v.id}
                    draggable
                    onDragStart={() => setDragId(s.v.id)}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={() => dropOn(s.v.id)}
                    className={`group cursor-pointer rounded-[10px] border p-2.5 ${on ? 'border-primary ring-1 ring-primary' : 'border-border hover:bg-muted/40'} ${dragId === s.v.id ? 'opacity-50' : ''}`}
                    onClick={() => setSelected(s.v.id)}
                  >
                    <div className="flex items-start gap-2">
                      <span className="mt-0.5 text-xs tabular-nums text-muted-foreground">{i + 1}</span>
                      <p className="min-w-0 flex-1 text-xs leading-snug text-foreground">{s.meta.headline || s.m.suggested}</p>
                    </div>
                    <div className="mt-1.5 flex justify-end gap-0.5 opacity-60 group-hover:opacity-100">
                      <button type="button" className={iconBtn} aria-label="Move up" disabled={i === 0} onClick={(e) => { e.stopPropagation(); move(s.v.id, -1) }}>↑</button>
                      <button type="button" className={iconBtn} aria-label="Move down" disabled={i === slides.length - 1} onClick={(e) => { e.stopPropagation(); move(s.v.id, 1) }}>↓</button>
                      <button type="button" className={iconBtn} aria-label="Duplicate" onClick={(e) => { e.stopPropagation(); duplicate(s.v.id) }}>⧉</button>
                      <button type="button" className={iconBtn} aria-label="Remove" onClick={(e) => { e.stopPropagation(); remove(s.v.id) }}>✕</button>
                    </div>
                  </li>
                )
              })}
            </ol>
          </aside>

          {/* Canvas */}
          <main className="min-w-0 flex-1 overflow-y-auto p-6">
            <div className="mx-auto max-w-4xl space-y-4">
              <div className={`${card} space-y-3 p-4`}>
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    value={current.meta.headline}
                    onChange={(e) => setMeta(current.v.id, { headline: e.target.value })}
                    placeholder={`Suggested: ${current.m.suggested}`}
                    aria-label="Headline"
                    className="h-10 min-w-0 flex-1 rounded-[10px] border border-border bg-background px-3 text-sm font-medium text-foreground placeholder:font-normal placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
                  />
                  <button type="button" className={btn} onClick={() => setMeta(current.v.id, { headline: current.m.suggested })} title="Write a headline from the numbers on this slide">
                    Suggest from data
                  </button>
                </div>
                <input
                  value={current.meta.takeaway}
                  onChange={(e) => setMeta(current.v.id, { takeaway: e.target.value })}
                  placeholder="Key takeaway (optional), e.g. Growth is broad-based across ages"
                  aria-label="Key takeaway"
                  className="h-9 w-full rounded-[10px] border border-border bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
                />
                <div className="flex flex-wrap items-center gap-3">
                  <div className="inline-flex overflow-hidden rounded-[10px] border border-border">
                    {([['line', 'Line'], ['column', 'Column'], ['hbar', 'Horizontal bar']] as const).map(([k, label]) => (
                      <button key={k} type="button" className={seg(current.m.kind === k)} disabled={k === 'line' && !current.m.lineAllowed} onClick={() => setMeta(current.v.id, { kind: k })}>
                        {label}
                      </button>
                    ))}
                  </div>
                  {current.m.isBrand && current.m.orientation === 'cols' && (
                    <label className="flex items-center gap-1.5 text-xs text-foreground">
                      <input type="checkbox" className="accent-primary" checked={current.meta.focusOnly} onChange={(e) => setMeta(current.v.id, { focusOnly: e.target.checked })} />
                      Focus brand only
                    </label>
                  )}
                </div>
              </div>

              <div className="aspect-video overflow-hidden rounded-[14px] border border-border shadow-sm">
                <SlideFace s={current} />
              </div>
              <p className="text-center text-xs text-muted-foreground">Slide {currentIndex + 1} of {slides.length}</p>
            </div>
          </main>

          {/* Inspector */}
          <aside className="hidden w-[300px] shrink-0 overflow-y-auto border-l border-border bg-card p-4 xl:block">
            <h3 className="text-xs font-medium text-muted-foreground">Source</h3>
            <p className="mt-1 text-sm text-foreground">{current.m.definition}</p>
            <button type="button" className="mt-2 text-sm text-primary hover:underline" onClick={() => openInCrossTabs(current.v)}>Open in Cross-tabs →</button>

            <h3 className="mt-5 text-xs font-medium text-muted-foreground">Checks</h3>
            <ul className="mt-2 space-y-1.5 text-sm">
              <li className={current.m.minBase >= 30 ? 'text-foreground' : 'text-[#B45309]'}>
                {current.m.minBase >= 30 ? '✓' : '!'} Smallest base n={current.m.minBase.toLocaleString()}{current.m.minBase < 100 && current.m.minBase >= 30 ? ' (read with care)' : ''}
              </li>
              <li className={current.m.hidden ? 'text-[#B45309]' : 'text-foreground'}>
                {current.m.hidden ? `! ${current.m.hidden} cell(s) hidden (base under 30); shown as 0 in PowerPoint` : '✓ No hidden cells'}
              </li>
              <li className="text-foreground">✓ {current.v.weighted ? 'Weighted by age × gender' : 'Unweighted (as saved)'}</li>
              <li className="text-foreground">✓ Live: recalculates from the survey data</li>
            </ul>

            <h3 className="mt-5 text-xs font-medium text-muted-foreground">Speaker notes</h3>
            <textarea
              value={current.meta.notes}
              onChange={(e) => setMeta(current.v.id, { notes: e.target.value })}
              placeholder="Notes for the presenter. Exported to PowerPoint's notes."
              rows={6}
              className="mt-2 w-full rounded-[10px] border border-border bg-background p-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
          </aside>
        </div>
      )}

      {mode === 'outline' && (
        <div className="min-h-0 flex-1 overflow-y-auto p-6">
          <div className="mx-auto max-w-3xl">
            <p className="text-sm text-muted-foreground">Read the headlines top to bottom: together they should tell one story. Drag to reorder.</p>
            <ol className="mt-4 space-y-2">
              {slides.map((s, i) => (
                <li
                  key={s.v.id}
                  draggable
                  onDragStart={() => setDragId(s.v.id)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => dropOn(s.v.id)}
                  className={`${card} flex cursor-grab items-start gap-4 p-4 ${dragId === s.v.id ? 'opacity-50' : ''}`}
                >
                  <span className="text-lg font-semibold tabular-nums text-muted-foreground">{i + 1}</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-base font-medium text-foreground">{s.meta.headline || s.m.suggested}</p>
                    {s.meta.takeaway && <p className="mt-0.5 text-sm text-muted-foreground">{s.meta.takeaway}</p>}
                    <p className="mt-1 text-xs text-muted-foreground">{s.m.definition}</p>
                  </div>
                  <button type="button" className={btn} onClick={() => { setSelected(s.v.id); setMode('slides') }}>Edit</button>
                </li>
              ))}
            </ol>
          </div>
        </div>
      )}

      {mode === 'dashboard' && (
        <div className="min-h-0 flex-1 overflow-y-auto p-6">
          <div className="mx-auto max-w-6xl">
            <p className="text-sm text-muted-foreground">Every slide as a live dashboard card. Use Export → Dashboard (.html) to share it as a single file.</p>
            <div className="mt-4 grid grid-cols-1 gap-5 lg:grid-cols-2">
              {slides.map((s, i) => (
                <article key={s.v.id} className={`${card} p-5`}>
                  <p className="text-xs text-muted-foreground">{i + 1}</p>
                  <h3 className="mt-1 text-base font-semibold leading-snug text-foreground">{s.meta.headline || s.m.suggested}</h3>
                  {s.meta.takeaway && <p className="mt-1 text-sm text-muted-foreground">{s.meta.takeaway}</p>}
                  <div className="mt-3"><Legend m={s.m} /></div>
                  <div className="mt-2"><SlideChart m={s.m} height={s.m.kind === 'hbar' ? Math.max(240, s.m.categories.length * 22 * Math.max(1, s.m.series.length)) : 260} /></div>
                  <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{s.m.footnote}</p>
                </article>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Present mode */}
      {presenting !== null && slides[presenting] && (
        <div className="fixed inset-0 z-50 flex flex-col bg-[#111] p-6" role="dialog" aria-label="Presentation">
          <div className="mx-auto flex w-full max-w-6xl flex-1 items-center">
            <div className="aspect-video w-full overflow-hidden rounded-[10px]">
              <SlideFace s={slides[presenting]!} big />
            </div>
          </div>
          <div className="mx-auto mt-4 flex w-full max-w-6xl items-center justify-between text-sm text-white/70">
            <span>{presenting + 1} / {slides.length} · ← → to navigate</span>
            <button type="button" className="rounded-[8px] border border-white/30 px-3 py-1 text-white hover:bg-white/10" onClick={() => setPresenting(null)}>Exit (Esc)</button>
          </div>
        </div>
      )}

      {/* Offscreen charts for the HTML export */}
      {snapshot && (
        <div ref={snapRef} aria-hidden="true" style={{ position: 'fixed', left: -10000, top: 0, width: 680 }}>
          {slides.map((s) => (
            <div key={s.v.id} data-slide={s.v.id}>
              <SlideChart m={s.m} width={640} height={s.m.kind === 'hbar' ? Math.max(280, s.m.categories.length * 22 * Math.max(1, s.m.series.length)) : 300} />
            </div>
          ))}
        </div>
      )}

      {undo && (
        <div role="status" className="fixed bottom-6 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-[10px] bg-foreground px-4 py-2.5 text-sm text-background shadow-lg">
          Slide removed
          <button type="button" className="font-medium underline" onClick={restore}>Undo</button>
        </div>
      )}
    </div>
  )
}