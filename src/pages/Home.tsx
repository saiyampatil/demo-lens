import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLensStore } from '@/store/useLensStore'
import { crosstab } from '@/engine/crosstab'
import { significantChanges, funnel, latestWave, previousWave, type SignificantChange } from '@/engine/insights'
import { BRANDS, WAVES } from '@/engine/questions'
import PageHeader from '@/components/PageHeader'
import rawCsv from '../../data/campa_tracker_data.csv?raw'

type Row = ReturnType<typeof crosstab>['rows'][number]
type Step = { title: string; detail: string; cta: string; go: () => void; tone?: 'warn' }

const FOCUS = 'Campa'
const COMPARE = 'Coca-Cola'
const FOCUS_COLOR = '#6B47D6'
const COMPARE_COLOR = '#C9C6D3'
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const METRIC: Record<string, string> = { Q1: 'awareness', Q2: 'trial', Q3: 'main-brand share' }
const ROW_LABEL: Record<string, string> = {
  Q1: 'Brand awareness', Q2: 'Brand trial', Q3: 'Main brand', Q4: 'Brand attitudes',
  Q5: 'Servings per week', Q6: 'Likelihood to recommend',
  AGE: 'Age group', GENDER: 'Gender', CITY: 'City type', SEC: 'Socio-economic class',
}
const COL_LABEL: Record<string, string> = {
  WAVE: 'Wave', TOTAL: 'Total', AGE: 'Age group', GENDER: 'Gender', CITY: 'City type', SEC: 'Socio-economic class',
}

const pct = (v: number) => `${Math.round(v)}%`
const ratioPct = (r: number) => Math.round(r <= 1 ? r * 100 : r)
const signed = (v: number, digits = 0) => {
  const x = Number(v.toFixed(digits))
  return `${x > 0 ? '+' : x < 0 ? '−' : ''}${Math.abs(x).toFixed(digits)}`
}
const ptsTxt = (d: number) => {
  const r = Math.round(d)
  return `${signed(r)} ${Math.abs(r) === 1 ? 'pt' : 'pts'}`
}

function nextWaveLabel(label: string): string {
  const m = /^([A-Za-z]{3})-(\d{2})$/.exec(label)
  if (!m) return ''
  const mi = MONTHS.indexOf(m[1] ?? '')
  if (mi < 0) return ''
  const total = mi + 3
  return `${MONTHS[total % 12]}-${String((Number(m[2]) + Math.floor(total / 12)) % 100).padStart(2, '0')}`
}

function weightingEfficiency(wave: string): number {
  const lines = rawCsv.split(/\r?\n/).filter((l) => l.trim().length > 0)
  const header = (lines[0] ?? '').split(',').map((h) => h.trim())
  const wi = header.indexOf('wave')
  const ti = header.indexOf('wt')
  const ws = lines
    .slice(1)
    .map((l) => l.split(','))
    .filter((c) => (c[wi] ?? '').trim() === wave)
    .map((c) => Number(c[ti]))
    .filter((w) => Number.isFinite(w) && w > 0)
  const sum = ws.reduce((a, b) => a + b, 0)
  const sumSq = ws.reduce((a, b) => a + b * b, 0)
  return ws.length && sumSq ? (sum * sum) / sumSq / ws.length : 0
}

function storyboardTitle(): string {
  try {
    const s = localStorage.getItem('lens-storyboard-v1')
    const t = s ? (JSON.parse(s) as { title?: unknown }).title : undefined
    return typeof t === 'string' && t.trim() ? t : 'Campa brand health'
  } catch {
    return 'Campa brand health'
  }
}

function readSaved(r: unknown): { title: string; date: string } | null {
  if (typeof r !== 'object' || r === null) return null
  const o = r as Record<string, unknown>
  const title = typeof o.title === 'string' ? o.title : 'Saved view'
  const raw = o.savedAt
  const date = typeof raw === 'string' || typeof raw === 'number' ? new Date(raw).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) : ''
  return { title, date }
}

// ---------- Research Nudges ----------

type NudgePriority = 'high' | 'medium' | 'low'

interface ResearchNudge {
  id: string
  title: string
  brand: string
  metric: string
  waveFrom: string
  waveTo: string
  current: number
  previous: number
  change: number
  significance: -1 | 0 | 1
  priority: NudgePriority
  type: 'significant-change' | 'data-quality' | 'unusual-movement'
  caveat: string
  unweightedBase: number
  questionId: string
  score: number
}

function buildNudges(
  changes: SignificantChange[],
  efficiency: number,
  _ff: ReturnType<typeof funnel>,
  _cf: ReturnType<typeof funnel>,
): ResearchNudge[] {
  const nudges: ResearchNudge[] = []
  const seen = new Set<string>()

  // 1. Significant changes from existing wave-comparison analysis
  for (const c of changes) {
    const key = `${c.questionId}-${c.brandCode}`
    if (seen.has(key)) continue
    seen.add(key)

    const metric = METRIC[c.questionId] ?? c.questionLabel.toLowerCase()
    const up = c.direction === 1

    let score = 3 // all items in changes are significant
    if (Math.abs(c.change) >= 5) score += 2
    else if (Math.abs(c.change) >= 3) score += 1
    if (c.brand === FOCUS) score += 2
    if (c.unweightedBase < 30) score -= 2
    else if (c.unweightedBase < 60) score -= 1

    const caveat = c.unweightedBase < 60
      ? `Small base (n=${c.unweightedBase}) — treat as directional only.`
      : `Change tested at 95% vs ${previousWave}.`

    nudges.push({
      id: `sig-${key}`,
      title: `${c.brand} ${metric} ${up ? 'rose' : 'fell'} ${Math.abs(c.change)} pts`,
      brand: c.brand,
      metric,
      waveFrom: previousWave,
      waveTo: latestWave,
      current: c.current,
      previous: c.previous,
      change: c.change,
      significance: c.direction,
      priority: score >= 6 ? 'high' : score >= 3 ? 'medium' : 'low',
      type: 'significant-change',
      caveat,
      unweightedBase: c.unweightedBase,
      questionId: c.questionId,
      score,
    })
  }

  // 2. Data-quality warning: low weighting efficiency
  if (efficiency > 0 && efficiency < 0.9) {
    nudges.push({
      id: 'dq-efficiency',
      title: 'Weighting efficiency below target',
      brand: FOCUS,
      metric: 'Weighting',
      waveFrom: previousWave,
      waveTo: latestWave,
      current: Math.round(efficiency * 100),
      previous: 100,
      change: Math.round(efficiency * 100) - 100,
      significance: 0,
      priority: 'medium',
      type: 'data-quality',
      caveat: 'Low weighting efficiency means fewer differences will reach significance. Review weights in Weights.',
      unweightedBase: 0,
      questionId: 'Q1',
      score: 4,
    })
  }

  // 3. Unusual movement: funnel leak — awareness rose but trial did not
  const campaAwareness = changes.find((c) => c.brand === FOCUS && c.questionId === 'Q1')
  const campaTrial = changes.find((c) => c.brand === FOCUS && c.questionId === 'Q2')

  if (campaAwareness && campaAwareness.direction === 1 && campaTrial && campaTrial.direction !== 1) {
    const key = `funnel-leak-${FOCUS}`
    if (!seen.has(key)) {
      seen.add(key)
      nudges.push({
        id: key,
        title: `${FOCUS} awareness up but trial not keeping pace`,
        brand: FOCUS,
        metric: 'Funnel conversion',
        waveFrom: previousWave,
        waveTo: latestWave,
        current: campaTrial.current,
        previous: campaTrial.previous,
        change: campaTrial.change,
        significance: campaTrial.direction,
        priority: 'high',
        type: 'unusual-movement',
        caveat: 'Awareness grew but trial did not — possible funnel leak. Check which age groups converted.',
        unweightedBase: campaTrial.unweightedBase,
        questionId: 'Q2',
        score: 7,
      })
    }
  }

  // 4. Competitive threat: competitor main-brand share rose more than Campa
  const campaMain = changes.find((c) => c.brand === FOCUS && c.questionId === 'Q3')
  const compMain = changes.find((c) => c.brand === COMPARE && c.questionId === 'Q3')

  if (compMain && compMain.direction === 1 && (!campaMain || campaMain.change < compMain.change)) {
    const key = `comp-threat-${COMPARE}`
    if (!seen.has(key)) {
      seen.add(key)
      nudges.push({
        id: key,
        title: `${COMPARE} gaining on main-brand share`,
        brand: COMPARE,
        metric: 'Main-brand share',
        waveFrom: previousWave,
        waveTo: latestWave,
        current: compMain.current,
        previous: compMain.previous,
        change: compMain.change,
        significance: compMain.direction,
        priority: campaMain ? 'high' : 'medium',
        type: 'unusual-movement',
        caveat: `${COMPARE} main-brand share rose ${compMain.change} pts — competitive pressure on ${FOCUS}.`,
        unweightedBase: compMain.unweightedBase,
        questionId: 'Q3',
        score: 6,
      })
    }
  }

  nudges.sort((a, b) => b.score - a.score)
  return nudges
}

function saveNudgeToStoryboard(nudge: ResearchNudge, addSavedResult: (result: unknown) => void): void {
  const item = {
    id: `nudge-${Date.now()}`,
    title: `${nudge.title} — ${nudge.waveFrom} vs ${nudge.waveTo}`,
    crossTab: {
      row: nudge.questionId,
      column: 'WAVE',
      filters: [],
      stat: 'colpct',
      decimals: 0,
    },
    waveScope: 'All',
    weighted: true,
    view: 'both',
    chartType: 'column',
    savedAt: new Date().toISOString(),
  }
  addSavedResult(item)
}

// Sparkline scaled to its own data range so movement is visible.
// The start/end labels underneath keep the scale honest.
function Sparkline({ values, labelFirst, labelLast }: { values: number[]; labelFirst: string; labelLast: string }) {
  if (values.length < 2) return null
  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = max - min
  const pad = range > 0 ? range * 0.1 : Math.max(Math.abs(max) * 0.05, 0.5)
  const lo = min - pad
  const hi = max + pad
  const y = (v: number) => 30 - ((v - lo) / (hi - lo)) * 26
  const pts = values.map((v, i) => `${(i / (values.length - 1)) * 100},${y(v)}`).join(' ')
  return (
    <div>
      <svg viewBox="0 0 100 32" preserveAspectRatio="none" className="h-9 w-full" aria-hidden="true">
        <line x1="0" y1="30" x2="100" y2="30" stroke="#E8E6EE" strokeWidth={1} vectorEffect="non-scaling-stroke" />
        <polyline points={pts} fill="none" stroke={FOCUS_COLOR} strokeWidth={2} vectorEffect="non-scaling-stroke" />
      </svg>
      <div className="mt-1 flex justify-between text-xs tabular-nums text-muted-foreground">
        <span>{labelFirst}</span>
        <span>{labelLast}</span>
      </div>
    </div>
  )
}

const card = 'rounded-[14px] border border-border bg-card'
const chip = 'inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-1 text-xs text-foreground'
const linkBtn = 'text-sm font-medium text-primary hover:underline focus:outline-none focus:ring-2 focus:ring-primary/40 rounded'

export default function Home() {
  const navigate = useNavigate()
  const crossTab = useLensStore((s) => s.crossTab)
  const savedResults = useLensStore((s) => s.savedResults)
  const openCrossTab = useLensStore((s) => s.openCrossTab)
  const addAskQuestion = useLensStore((s) => s.addAskQuestion)
  const addSavedResult = useLensStore((s) => s.addSavedResult)
  const [question, setQuestion] = useState('')

  const d = useMemo(() => {
    const q1 = crosstab({ row: 'Q1', column: 'WAVE' })
    const q2 = crosstab({ row: 'Q2', column: 'WAVE' })
    const q3 = crosstab({ row: 'Q3', column: 'WAVE' })
    const q6 = crosstab({ row: 'Q6', column: 'WAVE', filters: [{ variable: 'Q3', codes: [1] }] })
    const find = (rows: Row[], label: string) => rows.find((r) => r.label === label)!
    const first = WAVES[0]!

    const kpi = (label: string, row: Row, isMean: boolean, view: Parameters<typeof openCrossTab>[0], note?: string) => {
      const cur = row.cells[latestWave]!.rawValue
      const prev = row.cells[previousWave]!.rawValue
      const start = row.cells[first]!.rawValue
      const f = (v: number) => (isMean ? v.toFixed(1) : pct(v))
      return {
        label,
        cur,
        diff: cur - prev,
        value: f(cur),
        suffix: isMean ? '/ 10' : '',
        change: isMean ? signed(cur - prev, 1) : ptsTxt(cur - prev),
        sig: isMean ? 0 : row.cells[latestWave]!.significance,
        spark: WAVES.map((w) => row.cells[w]!.rawValue),
        first: `${first} ${f(start)}`,
        last: `${latestWave} ${f(cur)}`,
        view,
        note,
      }
    }

    const q6Row = q6.rows[0]!
    const kpis = [
      kpi('Awareness', find(q1.rows, FOCUS), false, { row: 'Q1', column: 'WAVE', filters: [] }),
      kpi('Trial (past 3 months)', find(q2.rows, FOCUS), false, { row: 'Q2', column: 'WAVE', filters: [] }),
      kpi('Main-brand share', find(q3.rows, FOCUS), false, { row: 'Q3', column: 'WAVE', filters: [] }),
      kpi('Recommend (main-brand users)', q6Row, true, { row: 'Q6', column: 'WAVE', filters: [{ variable: 'Q3', codes: [1] }] },
        `n=${q6Row.cells[latestWave]!.unweightedBase}`),
    ]

    const league = BRANDS.map((b) => {
      const at = (res: typeof q1) => res.rows.find((r) => r.label === b.label)?.cells[latestWave]
      const a = at(q1)
      const t = at(q2)
      const m = at(q3)
      return {
        brand: b.label,
        aware: a?.rawValue ?? 0, awareSig: a?.significance ?? 0,
        trial: t?.rawValue ?? 0, trialSig: t?.significance ?? 0,
        main: m?.rawValue ?? 0, mainSig: m?.significance ?? 0,
      }
    }).sort((x, y) => y.main - x.main)

    const firstRow = q1.rows[0]!
    const ff = funnel(FOCUS, latestWave)
    const cf = funnel(COMPARE, latestWave)
    return {
      kpis,
      league,
      latestN: firstRow.cells[latestWave]!.unweightedBase,
      totalN: firstRow.cells['TOTAL']?.unweightedBase ?? 0,
      changes: significantChanges(latestWave, previousWave),
      ff,
      cf,
      efficiency: weightingEfficiency(latestWave),
    }
  }, [])

  const { kpis, league, latestN, totalN, changes, ff, cf, efficiency } = d
  const nudges = buildNudges(changes, efficiency, ff, cf)
  const nextWave = nextWaveLabel(latestWave)
  const savedCount = savedResults.filter((r) => readSaved(r) !== null).length
  const boardTitle = storyboardTitle()

  // ---- funnel gaps vs comparison brand ----
  const t1 = ratioPct(ff.trialToAwarenessRatio)
  const t2 = ratioPct(cf.trialToAwarenessRatio)
  const m1 = ratioPct(ff.mainToTrialRatio)
  const m2 = ratioPct(cf.mainToTrialRatio)
  const gaps = [
    { name: 'awareness', gap: cf.awareness - ff.awareness, text: `${pct(ff.awareness)} vs ${pct(cf.awareness)}` },
    { name: 'turning awareness into trial', gap: t2 - t1, text: `${t1}% vs ${t2}%` },
    { name: 'turning trial into main-brand loyalty', gap: m2 - m1, text: `${m1}% vs ${m2}%` },
  ]
  const biggestGap = gaps.reduce((a, b) => (b.gap > a.gap ? b : a), gaps[0]!)

  // ---- one-paragraph brief, built only from computed numbers ----
  const phrase = (label: string, k: (typeof kpis)[number]) =>
    k.sig !== 0
      ? `${label} ${k.diff >= 0 ? 'rose' : 'fell'} significantly to ${k.value} (${k.change})`
      : `${label} is ${k.value} (${k.change}, not a significant change)`
  const brief = `In ${latestWave}, Campa ${phrase('awareness', kpis[0]!)}; ${phrase('trial', kpis[1]!)}; ${phrase('main-brand share', kpis[2]!)}.`
  const briefGap = biggestGap.gap > 0 ? `Versus ${COMPARE}, the biggest gap is ${biggestGap.name} (${biggestGap.text}).` : `Campa matches or leads ${COMPARE} at every funnel stage.`

  // ---- next steps, derived from data and the user's work ----
  const steps: Step[] = []
  if (efficiency > 0 && efficiency < 0.9) {
    steps.push({ title: 'Check the weighting', detail: `Weighting efficiency for ${latestWave} is ${Math.round(efficiency * 100)}%, so fewer differences will reach significance.`, cta: 'Open Weights', go: () => navigate('/weights'), tone: 'warn' })
  }
  const top = changes[0]
  if (top) {
    const metric = METRIC[top.questionId] ?? top.questionLabel.toLowerCase()
    const q = top.questionId === 'Q1' ? `Who is driving ${top.brand}'s awareness growth?` : top.questionId === 'Q2' ? `Who is driving ${top.brand}'s trial growth?` : `What is ${top.brand}'s main-brand share?`
    steps.push({ title: 'Explain the biggest change', detail: `${top.brand} ${metric} ${top.direction === 1 ? 'rose' : 'fell'} ${Math.abs(top.change)} pts to ${Math.round(top.current)}%. See which groups drove it.`, cta: 'Ask AI', go: () => navigate('/ask', { state: { question: q } }) })
  }
  if (biggestGap.gap > 0) {
    steps.push({ title: 'Investigate the funnel gap', detail: `The biggest gap vs ${COMPARE} is ${biggestGap.name}: ${biggestGap.text}.`, cta: 'Compare brands', go: () => navigate('/ask', { state: { question: `How does ${FOCUS} compare with ${COMPARE}?` } }) })
  }
  steps.push(
    savedCount === 0
      ? { title: 'Start your storyboard', detail: 'Save key tables from Cross-tabs; export them to PowerPoint in one click.', cta: 'Open Cross-tabs', go: () => navigate('/cross-tabs') }
      : { title: `Export "${boardTitle}"`, detail: `${savedCount} slide${savedCount === 1 ? '' : 's'} ready · PowerPoint or a shareable dashboard.`, cta: 'Open storyboard', go: () => navigate('/storyboards') },
  )
  if (nextWave) {
    steps.push({ title: `Prepare for ${nextWave}`, detail: `Add the ${nextWave} wave when fieldwork closes; trends, Home and storyboards update automatically.`, cta: 'Go to Waves', go: () => navigate('/waves') })
  }

  const submitQuestion = () => {
    const q = question.trim()
    if (q) navigate('/ask', { state: { question: q } })
  }

  const lastViewTitle = crossTab ? `${ROW_LABEL[crossTab.row] ?? crossTab.row} by ${COL_LABEL[crossTab.column] ?? crossTab.column}` : 'Brand awareness by Wave'
  const recent = savedResults.slice(-3).reverse().map(readSaved).filter((x): x is { title: string; date: string } => x !== null)
  const sigMark = (s: number) => (s === 1 ? <span className="ml-1 text-sig-high">▲</span> : s === -1 ? <span className="ml-1 text-sig-low">▼</span> : null)

  return (
    <div className="h-full w-full overflow-y-auto">
      <div className="mx-auto w-full max-w-6xl p-6">
        {/* 1. Header + trust chips */}
        <PageHeader title="Campa Beverage Tracker" />
        <div className="mt-3 flex flex-wrap gap-2">
          <span className={chip}><span className="h-2 w-2 rounded-full bg-sig-high" aria-hidden="true" />Data ready · {latestWave} (n={latestN.toLocaleString()})</span>
          <span className={chip}>
            <span className={`h-2 w-2 rounded-full ${efficiency >= 0.9 ? 'bg-sig-high' : 'bg-[#B45309]'}`} aria-hidden="true" />
            Weighting {Math.round(efficiency * 100)}% efficient ({latestWave})
          </span>
          <span className={chip}>{WAVES.length} waves · {totalN.toLocaleString()} respondents</span>
          {nextWave && <span className={chip}>Next wave expected {nextWave}</span>}
        </div>

        <div className="mt-5 space-y-6">

        {/* 2. Ask */}
        <form className={`${card} flex flex-wrap items-center gap-2 p-2 pl-4`} onSubmit={(e) => { e.preventDefault(); submitQuestion() }}>
          <span className="text-primary" aria-hidden="true">✦</span>
          <input
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="Ask anything about the Campa research, e.g. who is driving Campa's growth?"
            aria-label="Ask a question"
            className="h-10 min-w-[240px] flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
          />
          <button type="submit" disabled={!question.trim()} className="h-10 rounded-[10px] bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-primary/40 disabled:opacity-50">
            Ask
          </button>
        </form>

        {/* 3. Brief */}
        <section className="rounded-[14px] border border-primary/20 bg-primary/5 p-5">
          <p className="text-xs font-medium text-primary">Summary of {latestWave} · written from the data</p>
          <p className="mt-2 text-base leading-relaxed text-foreground">{brief}</p>
          <p className="mt-1 text-base leading-relaxed text-foreground">{briefGap}</p>
        </section>

        {/* 4. KPIs */}
        <section aria-label="Campa key results">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {kpis.map((k) => (
              <button key={k.label} type="button" onClick={() => openCrossTab(k.view, navigate)}
                className={`${card} flex flex-col p-4 text-left transition-colors hover:border-primary/40 hover:bg-muted/30 focus:outline-none focus:ring-2 focus:ring-primary/40`}>
                <span className="text-xs font-medium text-muted-foreground">{k.label}</span>
                <span className="mt-2 flex items-baseline gap-1">
                  <span className="text-3xl font-semibold tabular-nums text-foreground">{k.value}</span>
                  {k.suffix && <span className="text-sm text-muted-foreground">{k.suffix}</span>}
                </span>
                <span className={`mt-1 text-xs tabular-nums ${k.sig === 1 ? 'text-sig-high' : k.sig === -1 ? 'text-sig-low' : 'text-muted-foreground'}`}>
                  {k.sig === 1 ? '▲ ' : k.sig === -1 ? '▼ ' : ''}{k.change} vs {previousWave}{k.sig === 0 && k.note === undefined ? ' · not significant' : ''}{k.note ? ` · ${k.note}` : ''}
                </span>
                <span className="mt-3"><Sparkline values={k.spark} labelFirst={k.first} labelLast={k.last} /></span>
              </button>
            ))}
          </div>
        </section>

        {/* 5. Changes + next steps */}
        <section className="grid grid-cols-1 items-start gap-6 lg:grid-cols-3">
          <div className={`${card} p-5 lg:col-span-2`}>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-sm font-semibold text-foreground">What changed since {previousWave}</h2>
              <span className="text-xs text-muted-foreground">All brands tested on awareness, trial and main brand · 95%</span>
            </div>
            {nudges.length === 0 ? (
              <p className="mt-4 text-sm text-muted-foreground">No research nudges for this wave.</p>
            ) : (
              <div className="mt-4 space-y-3">
                {nudges.map((n) => {
                  const up = n.change >= 0
                  const sigColor = n.significance === 1 ? 'text-sig-high' : n.significance === -1 ? 'text-sig-low' : 'text-muted-foreground'
                  const priorityBadge =
                    n.priority === 'high'
                      ? 'bg-sig-low/10 text-sig-low border border-sig-low/30'
                      : n.priority === 'medium'
                        ? 'bg-[#B45309]/10 text-[#B45309] border border-[#B45309]/30'
                        : 'bg-muted/50 text-muted-foreground border border-muted/30'
                  const typeLabel =
                    n.type === 'data-quality'
                      ? '⚠ Data quality'
                      : n.type === 'unusual-movement'
                        ? '⚠ Unusual movement'
                        : '📊 Significant change'
                  return (
                    <div key={n.id} className={`${card} border-l-3 p-4 ${n.significance === 1 ? 'border-sig-high' : n.significance === -1 ? 'border-sig-low' : 'border-border'}`}>
                      <div className="flex items-start justify-between gap-3 mb-2">
                        <div className="flex items-center gap-1.5">
                          <span className={`text-[10px] font-semibold ${priorityBadge} px-2 py-0.5 rounded`}>{n.priority} priority</span>
                          <span className="text-[10px] text-muted-foreground">{typeLabel}</span>
                        </div>
                        <span className="text-[10px] font-mono text-muted-foreground">{n.waveFrom} → {n.waveTo}</span>
                      </div>
                      <h3 className="text-sm font-semibold text-foreground">{n.title}</h3>
                      <p className={`mt-1 text-sm ${sigColor}`}>
                        {n.brand} {n.metric} {up ? '▲' : '▼'} {Math.abs(n.change)} pts to {Math.round(n.current)}%
                      </p>
                      {n.caveat && (
                        <p className="mt-1.5 text-xs text-muted-foreground">{n.caveat}</p>
                      )}
                      <div className="mt-3 flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            const q = `Why did ${n.brand} ${n.metric} ${up ? 'rose' : 'fell'} ${Math.abs(n.change)} pts in ${n.waveTo}?`
                            addAskQuestion(q)
                            navigate('/ask', { state: { question: q } })
                          }}
                          className="flex-1 h-8 rounded-[8px] border border-border px-3 text-xs font-medium text-foreground hover:bg-muted focus:outline-none focus:ring-2 focus:ring-primary/40"
                        >
                          Investigate in Ask AI
                        </button>
                        <button
                          type="button"
                          onClick={() => openCrossTab({ row: n.questionId, column: 'WAVE', filters: [] }, navigate)}
                          className="flex-1 h-8 rounded-[8px] border border-border px-3 text-xs font-medium text-foreground hover:bg-muted focus:outline-none focus:ring-2 focus:ring-primary/40"
                        >
                          Open in Cross-tabs
                        </button>
                        <button
                          type="button"
                          onClick={() => saveNudgeToStoryboard(n, addSavedResult)}
                          className="flex-1 h-8 rounded-[8px] border border-border px-3 text-xs font-medium text-foreground hover:bg-muted focus:outline-none focus:ring-2 focus:ring-primary/40"
                        >
                          Save to storyboard
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          <div className={`${card} p-5`}>
            <h2 className="text-sm font-semibold text-foreground">Recommended next steps</h2>
            <ol className="mt-4 space-y-4">
              {steps.slice(0, 4).map((s, i) => (
                <li key={s.title} className="flex gap-3">
                  <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${s.tone === 'warn' ? 'bg-[#FEF4E6] text-[#B45309]' : 'bg-primary/10 text-primary'}`}>{i + 1}</span>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground">{s.title}</p>
                    <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{s.detail}</p>
                    <button type="button" className={`${linkBtn} mt-1`} onClick={s.go}>{s.cta} →</button>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* 6. Competitive context */}
        <section className="grid grid-cols-1 items-start gap-6 lg:grid-cols-5">
          <div className={`${card} p-5 lg:col-span-3`}>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-sm font-semibold text-foreground">Brand league · {latestWave}</h2>
              <span className="text-xs text-muted-foreground">Ranked by main-brand share · ▲▼ vs {previousWave}</span>
            </div>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-muted-foreground">
                    <th className="py-2 text-left font-medium">#</th>
                    <th className="py-2 text-left font-medium">Brand</th>
                    <th className="py-2 text-right font-medium">Aware</th>
                    <th className="py-2 text-right font-medium">Tried</th>
                    <th className="py-2 text-right font-medium">Main brand</th>
                  </tr>
                </thead>
                <tbody>
                  {league.map((b, i) => {
                    const focus = b.brand === FOCUS
                    return (
                      <tr key={b.brand} className={`border-t border-border ${focus ? 'bg-primary/5' : ''}`}>
                        <td className="py-2.5 pr-2 tabular-nums text-muted-foreground">{i + 1}</td>
                        <td className={`py-2.5 ${focus ? 'font-semibold text-foreground' : 'text-foreground'}`}>{b.brand}</td>
                        <td className="py-2.5 text-right tabular-nums text-foreground">{pct(b.aware)}{sigMark(b.awareSig)}</td>
                        <td className="py-2.5 text-right tabular-nums text-foreground">{pct(b.trial)}{sigMark(b.trialSig)}</td>
                        <td className={`py-2.5 text-right tabular-nums ${focus ? 'font-semibold' : ''} text-foreground`}>{pct(b.main)}{sigMark(b.mainSig)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div className={`${card} p-5 lg:col-span-2`}>
            <h2 className="text-sm font-semibold text-foreground">Where {FOCUS} loses people</h2>
            <p className="mt-1 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: FOCUS_COLOR }} /> {FOCUS}</span>
              <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: COMPARE_COLOR }} /> {COMPARE}</span>
            </p>
            <div className="mt-4 space-y-3">
              {[
                { label: 'Aware', a: ff.awareness, b: cf.awareness, note: '' },
                { label: 'Tried', a: ff.trial, b: cf.trial, note: `${t1}% vs ${t2}% of aware` },
                { label: 'Main brand', a: ff.main, b: cf.main, note: `${m1}% vs ${m2}% of triers` },
              ].map((s) => (
                <div key={s.label}>
                  <div className="flex items-baseline justify-between text-xs">
                    <span className="font-medium text-foreground">{s.label}</span>
                    {s.note && <span className="tabular-nums text-muted-foreground">{s.note}</span>}
                  </div>
                  {[{ v: s.a, c: FOCUS_COLOR }, { v: s.b, c: COMPARE_COLOR }].map((bar, i) => (
                    <div key={i} className="mt-1 flex items-center gap-2">
                      <div className="h-2 flex-1 rounded-full bg-muted">
                        <div className="h-2 rounded-full" style={{ width: `${Math.min(100, Math.max(0, bar.v))}%`, backgroundColor: bar.c }} />
                      </div>
                      <span className="w-9 text-right text-xs tabular-nums text-foreground">{pct(bar.v)}</span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* 7. Your work */}
        <section className={`${card} p-5`}>
          <h2 className="text-sm font-semibold text-foreground">Your work</h2>
          <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-3">
            <div className="rounded-[10px] border border-border p-4">
              <p className="text-xs text-muted-foreground">Storyboard</p>
              <p className="mt-1 text-sm font-medium text-foreground">{boardTitle}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">{savedCount === 0 ? 'No slides yet' : `${savedCount} slide${savedCount === 1 ? '' : 's'} · ready to export`}</p>
              <button type="button" className={`${linkBtn} mt-2`} onClick={() => navigate(savedCount === 0 ? '/cross-tabs' : '/storyboards')}>
                {savedCount === 0 ? 'Build the first slide →' : 'Open storyboard →'}
              </button>
            </div>
            <div className="rounded-[10px] border border-border p-4">
              <p className="text-xs text-muted-foreground">Last cross-tab</p>
              <p className="mt-1 text-sm font-medium text-foreground">{lastViewTitle}</p>
              <button type="button" className={`${linkBtn} mt-2`} onClick={() => navigate('/cross-tabs')}>Continue →</button>
            </div>
            <div className="rounded-[10px] border border-border p-4">
              <p className="text-xs text-muted-foreground">Recently saved</p>
              {recent.length === 0 ? (
                <p className="mt-1 text-sm text-muted-foreground">Nothing saved yet.</p>
              ) : (
                <ul className="mt-1 space-y-1">
                  {recent.map((r, i) => (
                    <li key={i} className="flex justify-between gap-2 text-sm">
                      <button type="button" className="min-w-0 truncate text-left text-foreground hover:text-primary" onClick={() => navigate('/storyboards')} title={r.title}>{r.title}</button>
                      <span className="shrink-0 text-xs text-muted-foreground">{r.date}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </section>
        </div>
      </div>
    </div>
  )
}