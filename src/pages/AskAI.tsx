import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Bar, BarChart, CartesianGrid, Cell, LabelList, Line, LineChart, ResponsiveContainer, XAxis, YAxis } from 'recharts'
import { useLensStore } from '@/store/useLensStore'
import { crosstab } from '@/engine/crosstab'
import { significantChanges, funnel, latestWave, previousWave } from '@/engine/insights'
import { BRANDS, WAVES } from '@/engine/questions'

type CtArgs = Parameters<typeof crosstab>[0]
type Row = ReturnType<typeof crosstab>['rows'][number]
type View = Parameters<ReturnType<typeof useLensStore.getState>['openCrossTab']>[0]

type Chart = {
  type: 'line' | 'bar'
  data: Record<string, string | number>[]
  series: { key: string; label: string; color: string }[]
  yMax: number
  unit: '%' | 'mean'
  highlight?: string
}
type TableRow = { label: string; value: string; sig: number; base: number | null }
type Answer = {
  understood: string[]
  steps: { text: string; ref: string }[]
  headline: string
  findings: { text: string; ref: string; sig: number }[]
  chart: Chart
  tableHead: [string, string, string]
  table: TableRow[]
  citation: string
  caveats: string[]
  view: View
  followUps: string[]
}
type Turn = { id: number; question: string; answer: Answer | null }

const PURPLE = '#6B47D6'
const GREY = '#C9C6D3'
const AI_BLUE = '#2F5BEA'
const AGES = ['18-24', '25-34', '35-44', '45+']
const FIRST = WAVES[0]!
const METRIC: Record<string, string> = { Q1: 'awareness', Q2: 'trial', Q3: 'main-brand share' }
const SUGGESTIONS = [
  'How has Campa awareness changed?',
  "Who is driving Campa's growth?",
  'How does Campa compare with Coca-Cola?',
  "What is Campa's main-brand share?",
  'Which brand has the highest trial?',
  'How likely are people to recommend Campa?',
]

const r = Math.round
const pct = (v: number) => `${r(v)}%`
const pts = (d: number) => `${r(Math.abs(d))} pts`
const ratioPct = (x: number) => r(x <= 1 ? x * 100 : x)

function brandRow(q: CtArgs['row'], brand: string, filters?: CtArgs['filters']): Row | undefined {
  const res = filters ? crosstab({ row: q, column: 'WAVE', filters }) : crosstab({ row: q, column: 'WAVE' })
  return res.rows.find((x) => x.label === brand)
}

function waveSeries(row: Row) {
  return WAVES.map((w) => ({
    wave: w,
    value: row.cells[w]!.rawValue,
    sig: row.cells[w]!.significance,
    n: row.cells[w]!.unweightedBase,
  }))
}

function trendAnswer(q: 'Q1' | 'Q2', brand: string, byAge: boolean): Answer | null {
  const row = brandRow(q, brand)
  if (!row) return null
  const metric = METRIC[q] ?? ''
  const s = waveSeries(row)
  const first = s[0]!
  const last = s[s.length - 1]!
  const ages = AGES.map((label, i) => {
    const ar = brandRow(q, brand, [{ variable: 'AGE', codes: [i + 1] }])
    const from = ar?.cells[FIRST]?.rawValue ?? 0
    const to = ar?.cells[latestWave]?.rawValue ?? 0
    return { label, from, to, gain: to - from, n: ar?.cells[latestWave]?.unweightedBase ?? 0 }
  })
  const biggest = ages.reduce((m, a) => (a.gain > m.gain ? a : m), ages[0]!)
  const top = ages.reduce((m, a) => (a.to > m.to ? a : m), ages[0]!)
  const smallest = ages.reduce((m, a) => (a.n < m.n ? a : m), ages[0]!)
  const allUp = ages.every((a) => a.gain > 0)
  const rose = last.value >= first.value
  const sigEvery = s.slice(1).every((x) => x.sig === 1)

  const waveFindings = s.slice(1).map((x, i) => {
    const prev = s[i]!
    const d = x.value - prev.value
    return {
      text: `${d >= 0 ? 'Up' : 'Down'} ${pts(d)} to ${pct(x.value)} in ${x.wave}, ${x.sig !== 0 ? 'significant' : 'not significant'} vs ${prev.wave}.`,
      ref: `${q} × Wave`,
      sig: x.sig,
    }
  })
  const ageFinding = {
    text:
      biggest.gain > 0
        ? `The biggest climb was among ${biggest.label} (${pct(biggest.from)} → ${pct(biggest.to)}); ${top.label} is now highest at ${pct(top.to)}.`
        : `No age group grew between ${FIRST} and ${latestWave}.`,
    ref: `${q} × Age group`,
    sig: 0,
  }
  const findings = byAge ? [ageFinding, ...waveFindings] : [...waveFindings, ageFinding]
  const steps = [
    { text: `${brand} ${metric} by wave`, ref: `${q} × Wave` },
    { text: `${brand} ${metric} by age group, ${FIRST} vs ${latestWave}`, ref: `${q} × Age group` },
  ]
  if (q === 'Q1') {
    const f0 = funnel(brand, FIRST)
    const f1 = funnel(brand, latestWave)
    const c0 = ratioPct(f0.trialToAwarenessRatio)
    const c1 = ratioPct(f1.trialToAwarenessRatio)
    findings.push({
      text: `Awareness-to-trial conversion ${c1 >= c0 ? 'rose' : 'fell'} from ${c0}% to ${c1}%: ${c1 >= c0 ? 'more' : 'fewer'} aware people are trying ${brand}.`,
      ref: 'Q2 × Wave',
      sig: 0,
    })
    steps.push({ text: `${brand} trial by wave, to check the funnel`, ref: 'Q2 × Wave' })
  }

  const headline = byAge
    ? allUp
      ? `Every age group grew; the biggest gain was among ${biggest.label} (${pct(biggest.from)} → ${pct(biggest.to)}).`
      : `Growth is uneven across ages: ${biggest.label} gained most (${pct(biggest.from)} → ${pct(biggest.to)}).`
    : `${brand} ${metric} ${rose ? 'rose' : 'fell'} from ${pct(first.value)} to ${pct(last.value)} over ${s.length} waves${rose && sigEvery ? ', significantly in every wave' : ''}${allUp ? ', with gains in every age group' : ''}.`

  const caveats = ['Age-group changes are shown but not individually significance-tested.']
  if (smallest.n < 100) caveats.unshift(`${smallest.label} base in ${latestWave} is ${smallest.n} respondents; read age detail with care.`)

  return {
    understood: [`Measure: ${q} ${metric}`, `Brand: ${brand}`, 'Across: Wave', 'Split by: Age group', 'Base: all respondents', 'Test: vs previous wave · 95%'],
    steps,
    headline,
    findings,
    chart: byAge
      ? {
          type: 'bar',
          data: ages.map((a) => ({ name: a.label, a: a.from, b: a.to })),
          series: [
            { key: 'a', label: FIRST, color: GREY },
            { key: 'b', label: latestWave, color: PURPLE },
          ],
          yMax: 100,
          unit: '%',
        }
      : {
          type: 'line',
          data: s.map((x) => ({ name: x.wave, a: x.value })),
          series: [{ key: 'a', label: brand, color: PURPLE }],
          yMax: 100,
          unit: '%',
        },
    tableHead: byAge ? ['Age group', `${FIRST} → ${latestWave}`, `Base ${latestWave}`] : ['Wave', 'Value', 'Base (n)'],
    table: byAge
      ? ages.map((a) => ({ label: a.label, value: `${pct(a.from)} → ${pct(a.to)}`, sig: 0, base: a.n }))
      : s.map((x) => ({ label: x.wave, value: pct(x.value), sig: x.sig, base: x.n })),
    citation: `${q} · ${brand} · weighted · bases ${s.map((x) => x.n).join(' / ')}`,
    caveats,
    view: { row: q, column: 'WAVE', filters: [] },
    followUps: byAge
      ? [`How has ${brand} awareness changed?`, `How does ${brand} compare with Coca-Cola?`, `What is ${brand}'s main-brand share?`]
      : [`Who is driving ${brand}'s growth?`, `How does ${brand} compare with Coca-Cola?`, `What is ${brand}'s main-brand share?`],
  }
}

function compareAnswer(b1: string, b2: string): Answer {
  const f1 = funnel(b1, latestWave)
  const f2 = funnel(b2, latestWave)
  const t1 = ratioPct(f1.trialToAwarenessRatio)
  const t2 = ratioPct(f2.trialToAwarenessRatio)
  const m1 = ratioPct(f1.mainToTrialRatio)
  const m2 = ratioPct(f2.mainToTrialRatio)
  const gaps = [
    { name: 'awareness', gap: f2.awareness - f1.awareness, text: `${pct(f1.awareness)} aware vs ${pct(f2.awareness)}` },
    { name: 'conversion to trial', gap: t2 - t1, text: `${t1}% of aware people have tried it, vs ${t2}%` },
    { name: 'conversion to main brand', gap: m2 - m1, text: `${m1}% of triers make it their main brand, vs ${m2}%` },
  ]
  const worst = gaps.reduce((m, g) => (g.gap > m.gap ? g : m), gaps[0]!)
  const headline =
    worst.gap > 0
      ? `${b1}'s biggest gap with ${b2} is ${worst.name}: ${worst.text}.`
      : `${b1} matches or leads ${b2} at every stage of the funnel in ${latestWave}.`
  return {
    understood: [`Brands: ${b1} vs ${b2}`, `Wave: ${latestWave}`, 'Measures: awareness, trial, main brand', 'Base: all respondents (main brand: those who tried a brand)'],
    steps: [
      { text: `${b1} funnel, ${latestWave}`, ref: 'Q1, Q2, Q3' },
      { text: `${b2} funnel, ${latestWave}`, ref: 'Q1, Q2, Q3' },
      { text: 'Stage-to-stage ratios for both brands', ref: 'Derived' },
    ],
    headline,
    findings: [
      { text: `Aware: ${b1} ${pct(f1.awareness)} vs ${b2} ${pct(f2.awareness)}.`, ref: 'Q1', sig: 0 },
      { text: `Tried: ${b1} ${pct(f1.trial)} vs ${b2} ${pct(f2.trial)} (${t1}% vs ${t2}% of aware).`, ref: 'Q2', sig: 0 },
      { text: `Main brand: ${b1} ${pct(f1.main)} vs ${b2} ${pct(f2.main)} (${m1}% vs ${m2}% of triers).`, ref: 'Q3', sig: 0 },
    ],
    chart: {
      type: 'bar',
      data: [
        { name: 'Aware', a: f1.awareness, b: f2.awareness },
        { name: 'Tried', a: f1.trial, b: f2.trial },
        { name: 'Main brand', a: f1.main, b: f2.main },
      ],
      series: [
        { key: 'a', label: b1, color: PURPLE },
        { key: 'b', label: b2, color: GREY },
      ],
      yMax: 100,
      unit: '%',
    },
    tableHead: ['Stage', `${b1} vs ${b2}`, 'Base'],
    table: [
      { label: 'Aware', value: `${pct(f1.awareness)} vs ${pct(f2.awareness)}`, sig: 0, base: null },
      { label: 'Tried', value: `${pct(f1.trial)} vs ${pct(f2.trial)}`, sig: 0, base: null },
      { label: 'Main brand', value: `${pct(f1.main)} vs ${pct(f2.main)}`, sig: 0, base: null },
    ],
    citation: `Q1, Q2, Q3 · ${latestWave} · weighted`,
    caveats: ['Stage ratios compare separate questions in the same wave; they describe the population, not individual journeys.'],
    view: { row: 'Q2', column: 'WAVE', filters: [] },
    followUps: [`Who is driving ${b1}'s growth?`, `What is ${b1}'s main-brand share?`, 'Which brand has the highest trial?'],
  }
}

function shareAnswer(q: 'Q2' | 'Q3', brand: string): Answer {
  const ct = crosstab({ row: q, column: 'WAVE' })
  const items = BRANDS.map((b) => {
    const row = ct.rows.find((x) => x.label === b.label)
    return {
      brand: b.label,
      cur: row?.cells[latestWave]?.rawValue ?? 0,
      prev: row?.cells[previousWave]?.rawValue ?? 0,
      sig: row?.cells[latestWave]?.significance ?? 0,
      n: row?.cells[latestWave]?.unweightedBase ?? 0,
    }
  }).sort((a, b) => b.cur - a.cur)
  const top = items[0]!
  const rank = items.findIndex((x) => x.brand === brand) + 1
  const focus = items.find((x) => x.brand === brand) ?? top
  const d = focus.cur - focus.prev
  const isTrial = q === 'Q2'
  const headline = isTrial
    ? `${top.brand} has the highest trial at ${pct(top.cur)}; ${brand} is at ${pct(focus.cur)} (rank ${rank} of ${items.length}).`
    : `${brand} is main brand for ${pct(focus.cur)} of drinkers in ${latestWave}, rank ${rank} of ${items.length}, ${d >= 0 ? 'up' : 'down'} ${pts(d)} vs ${previousWave} (${focus.sig !== 0 ? 'significant' : 'not significant'}).`
  return {
    understood: [`Measure: ${q} ${METRIC[q] ?? ''}`, 'Brands: all five', `Wave: ${latestWave}`, isTrial ? 'Base: all respondents' : 'Base: those who tried a brand', 'Test: vs previous wave · 95%'],
    steps: [
      { text: `${METRIC[q] ?? ''} for every brand, ${latestWave}`, ref: `${q} × Wave` },
      { text: `Change vs ${previousWave}, tested at 95%`, ref: `${q} × Wave` },
    ],
    headline,
    findings: items.slice(0, 3).map((x, i) => ({
      text: `${i + 1}. ${x.brand}: ${pct(x.cur)} (${x.cur - x.prev >= 0 ? '+' : '−'}${pts(x.cur - x.prev)} vs ${previousWave}${x.sig !== 0 ? ', significant' : ''}).`,
      ref: `${q} × Wave`,
      sig: x.sig,
    })),
    chart: {
      type: 'bar',
      data: items.map((x) => ({ name: x.brand, a: x.cur })),
      series: [{ key: 'a', label: latestWave, color: GREY }],
      yMax: 100,
      unit: '%',
      highlight: brand,
    },
    tableHead: ['Brand', latestWave, `Change vs ${previousWave}`],
    table: items.map((x) => ({ label: x.brand, value: `${pct(x.cur)}  (${x.cur - x.prev >= 0 ? '+' : '−'}${pts(x.cur - x.prev)})`, sig: x.sig, base: null })),
    citation: `${q} · ${latestWave} · weighted · base n=${top.n}`,
    caveats: isTrial ? [] : ['Base is respondents who tried at least one brand.'],
    view: { row: q, column: 'WAVE', filters: [] },
    followUps: [`How does ${brand} compare with Coca-Cola?`, `Who is driving ${brand}'s growth?`, `How likely are people to recommend ${brand}?`],
  }
}

function recommendAnswer(brand: string): Answer | null {
  const code = BRANDS.findIndex((b) => b.label === brand) + 1
  if (code < 1) return null
  const row = crosstab({ row: 'Q6', column: 'WAVE', filters: [{ variable: 'Q3', codes: [code] }] }).rows[0]
  if (!row) return null
  const s = waveSeries(row)
  const last = s[s.length - 1]!
  const prev = s[s.length - 2]!
  const d = last.value - prev.value
  const caveats = ['Means are not significance-tested.']
  if (last.n < 100) caveats.unshift(`Base in ${latestWave} is ${last.n} respondents; treat small changes with care.`)
  return {
    understood: ['Measure: Q6 likelihood to recommend (0–10)', `Base: ${brand} main-brand users`, 'Across: Wave', 'Statistic: weighted mean'],
    steps: [{ text: `Q6 mean by wave, filtered to ${brand} main-brand users`, ref: 'Q6 × Wave' }],
    headline: `${brand}'s main-brand users rate their likelihood to recommend at ${last.value.toFixed(1)} / 10 in ${latestWave} (n=${last.n}), ${d >= 0 ? 'up' : 'down'} ${Math.abs(d).toFixed(1)} vs ${previousWave}.`,
    findings: s.map((x) => ({ text: `${x.wave}: ${x.value.toFixed(1)} / 10 (n=${x.n}).`, ref: 'Q6 × Wave', sig: 0 })),
    chart: {
      type: 'line',
      data: s.map((x) => ({ name: x.wave, a: x.value })),
      series: [{ key: 'a', label: brand, color: PURPLE }],
      yMax: 10,
      unit: 'mean',
    },
    tableHead: ['Wave', 'Mean (0–10)', 'Base (n)'],
    table: s.map((x) => ({ label: x.wave, value: x.value.toFixed(1), sig: 0, base: x.n })),
    citation: `Q6 · ${brand} main-brand users · weighted · bases ${s.map((x) => x.n).join(' / ')}`,
    caveats,
    view: { row: 'Q6', column: 'WAVE', filters: [{ variable: 'Q3', codes: [code] }] },
    followUps: [`What is ${brand}'s main-brand share?`, `How has ${brand} awareness changed?`, `How does ${brand} compare with Coca-Cola?`],
  }
}

function answerFor(text: string): Answer | null {
  const t = text.toLowerCase()
  const mentioned = BRANDS.map((b) => b.label).filter((l) => t.includes(l.toLowerCase()))
  const brand = mentioned[0] ?? 'Campa'
  if (/(compare|\bvs\b|versus|against)/.test(t)) {
    const other = mentioned.find((m) => m !== brand) ?? (brand === 'Coca-Cola' ? 'Thums Up' : 'Coca-Cola')
    return compareAnswer(brand, other)
  }
  if (/(recommend|nps|advoca)/.test(t)) return recommendAnswer(brand)
  if (/(main[- ]?brand|share)/.test(t)) return shareAnswer('Q3', brand)
  if (/(trial|tried|try)/.test(t) && /(highest|which brand|most|rank|top)/.test(t)) return shareAnswer('Q2', brand)
  if (/(driv|who |which age|age group|by age)/.test(t)) return trendAnswer(/(trial|tried)/.test(t) ? 'Q2' : 'Q1', brand, true)
  if (/(aware|heard)/.test(t)) return trendAnswer('Q1', brand, false)
  if (/(trial|tried)/.test(t)) return trendAnswer('Q2', brand, false)
  if (/(grow|growth|chang|trend)/.test(t)) return trendAnswer('Q1', brand, false)
  return null
}

function fmtLabel(v: unknown, unit: Chart['unit']): string {
  if (typeof v !== 'number') return ''
  return unit === '%' ? `${r(v)}%` : v.toFixed(1)
}

function ChartView({ c }: { c: Chart }) {
  return (
    <div>
      <div className="mb-2 flex flex-wrap gap-3 text-xs text-muted-foreground">
        {c.series.map((s) => (
          <span key={s.key} className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: c.highlight ? PURPLE : s.color }} />
            {c.highlight ? `${c.highlight} highlighted` : s.label}
          </span>
        ))}
      </div>
      <div className="h-56 w-full">
        <ResponsiveContainer width="100%" height="100%">
          {c.type === 'line' ? (
            <LineChart data={c.data} margin={{ top: 22, right: 24, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E8E6EE" />
              <XAxis dataKey="name" tick={{ fontSize: 12 }} />
              <YAxis domain={[0, c.yMax]} tick={{ fontSize: 12 }} width={36} />
              {c.series.map((s) => (
                <Line key={s.key} type="linear" dataKey={s.key} stroke={s.color} strokeWidth={2.5} dot={{ r: 3 }} isAnimationActive={false}>
                  <LabelList dataKey={s.key} position="top" fontSize={12} formatter={(v: unknown) => fmtLabel(v, c.unit)} />
                </Line>
              ))}
            </LineChart>
          ) : (
            <BarChart data={c.data} margin={{ top: 22, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E8E6EE" />
              <XAxis dataKey="name" tick={{ fontSize: 12 }} />
              <YAxis domain={[0, c.yMax]} tick={{ fontSize: 12 }} width={36} />
              {c.series.map((s) => (
                <Bar key={s.key} dataKey={s.key} fill={s.color} radius={[4, 4, 0, 0]} isAnimationActive={false}>
                  {c.highlight && c.series.length === 1
                    ? c.data.map((d, i) => <Cell key={i} fill={d.name === c.highlight ? PURPLE : GREY} />)
                    : null}
                  <LabelList dataKey={s.key} position="top" fontSize={12} formatter={(v: unknown) => fmtLabel(v, c.unit)} />
                </Bar>
              ))}
            </BarChart>
          )}
        </ResponsiveContainer>
      </div>
    </div>
  )
}

const card = 'rounded-[14px] border border-border bg-card'
const chipBtn =
  'rounded-full border border-border px-3 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40'

function AnswerCard({ a, onAsk, onOpen }: { a: Answer; onAsk: (q: string) => void; onOpen: (v: View) => void }) {
  const [tab, setTab] = useState<'chart' | 'table'>('chart')
  const [showSteps, setShowSteps] = useState(true)
  return (
    <div className={`${card} border-l-[3px] p-5`} style={{ borderLeftColor: AI_BLUE }}>
      <div className="flex items-center gap-2 text-xs">
        <span className="font-semibold" style={{ color: AI_BLUE }}>✦ Lens</span>
        <span className="text-muted-foreground">{a.steps.length} queries · computed from the survey data</span>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="text-xs text-muted-foreground">Understood as</span>
        {a.understood.map((u) => (
          <span key={u} className="rounded-md border border-border bg-background px-2 py-0.5 text-xs text-foreground">{u}</span>
        ))}
      </div>

      <div className="mt-3 rounded-[10px] border border-dashed p-3" style={{ borderColor: AI_BLUE, backgroundColor: '#F3F6FF' }}>
        <button type="button" onClick={() => setShowSteps((v) => !v)} className="text-xs font-medium" style={{ color: AI_BLUE }}>
          How Lens answered {showSteps ? '▾' : '▸'}
        </button>
        {showSteps && (
          <ol className="mt-2 space-y-1">
            {a.steps.map((s, i) => (
              <li key={i} className="flex items-center justify-between gap-3 text-xs text-foreground">
                <span><span className="text-sig-high">✓</span> {i + 1}. {s.text}</span>
                <span className="font-mono text-muted-foreground">{s.ref}</span>
              </li>
            ))}
          </ol>
        )}
      </div>

      <p className="mt-4 text-base font-semibold leading-snug text-foreground">{a.headline}</p>

      <ul className="mt-3 space-y-2">
        {a.findings.map((f, i) => (
          <li key={i} className="flex items-start justify-between gap-3 text-sm">
            <span className="text-foreground">
              <span className={f.sig === 1 ? 'text-sig-high' : f.sig === -1 ? 'text-sig-low' : 'text-muted-foreground'}>
                {f.sig === 1 ? '▲ ' : f.sig === -1 ? '▼ ' : '• '}
              </span>
              {f.text}
            </span>
            <span className="shrink-0 font-mono text-xs text-muted-foreground">{f.ref}</span>
          </li>
        ))}
      </ul>

      <div className="mt-4 rounded-[10px] border border-border p-3">
        <div className="mb-3 inline-flex rounded-[8px] border border-border p-0.5 text-xs">
          {(['chart', 'table'] as const).map((t) => (
            <button key={t} type="button" onClick={() => setTab(t)}
              className={`rounded-[6px] px-3 py-1 ${tab === t ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}>
              {t === 'chart' ? 'Chart' : 'Table'}
            </button>
          ))}
        </div>
        {tab === 'chart' ? (
          <ChartView c={a.chart} />
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-muted-foreground">
                <th className="py-1.5 text-left font-medium">{a.tableHead[0]}</th>
                <th className="py-1.5 text-right font-medium">{a.tableHead[1]}</th>
                <th className="py-1.5 text-right font-medium">{a.tableHead[2]}</th>
              </tr>
            </thead>
            <tbody>
              {a.table.map((row) => (
                <tr key={row.label} className="border-t border-border">
                  <td className="py-1.5 text-foreground">{row.label}</td>
                  <td className="py-1.5 text-right tabular-nums text-foreground">
                    {row.value}
                    {row.sig === 1 && <span className="text-sig-high"> ▲</span>}
                    {row.sig === -1 && <span className="text-sig-low"> ▼</span>}
                  </td>
                  <td className="py-1.5 text-right font-mono text-xs text-muted-foreground">{row.base ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p className="mt-2 font-mono text-xs text-muted-foreground">{a.citation}</p>
      </div>

      {a.caveats.length > 0 && (
        <div className="mt-3 rounded-[10px] bg-[#FEF4E6] p-3 text-xs text-[#B45309]">
          {a.caveats.map((c) => <p key={c}>⚠ {c}</p>)}
        </div>
      )}

      <p className="mt-3 text-xs text-sig-high">✓ Every number above is calculated from the survey data.</p>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => onOpen(a.view)}
          className="h-9 rounded-[10px] border border-border px-3 text-sm font-medium text-foreground hover:bg-muted focus:outline-none focus:ring-2 focus:ring-primary/40">
          Open in Cross-tabs
        </button>
      </div>

      <div className="mt-4">
        <p className="mb-2 text-xs text-muted-foreground">Suggested next questions</p>
        <div className="flex flex-wrap gap-2">
          {a.followUps.map((f) => (
            <button key={f} type="button" onClick={() => onAsk(f)} className={chipBtn}>{f}</button>
          ))}
        </div>
      </div>
    </div>
  )
}

export default function AskAI() {
  const navigate = useNavigate()
  const location = useLocation()
  const openCrossTab = useLensStore((s) => s.openCrossTab)
  const [turns, setTurns] = useState<Turn[]>([])
  const [input, setInput] = useState('')
  const started = useRef(false)
  const endRef = useRef<HTMLDivElement>(null)

  const stands = useMemo(() => significantChanges(latestWave, previousWave), [])

  const ask = (q: string) => {
    const text = q.trim()
    if (!text) return
    setTurns((t) => [...t, { id: Date.now() + Math.random(), question: text, answer: answerFor(text) }])
    setInput('')
  }

  useEffect(() => {
    if (started.current) return
    started.current = true
    const st = location.state as { question?: unknown } | null
    if (st && typeof st.question === 'string') ask(st.question)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [turns])

  const onOpen = (v: View) => openCrossTab(v, navigate)

  return (
    <div className="flex h-full w-full overflow-hidden">
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-3xl space-y-5 p-6">
            <header>
              <h1 className="text-2xl font-semibold text-foreground">Ask the Campa research</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Ask in plain language. Lens plans the analysis, computes every number from the data, and shows its working.
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                <span className="rounded-md border border-border bg-card px-2 py-0.5 text-foreground">Market: India</span>
                <span className="rounded-md border border-border bg-card px-2 py-0.5 text-foreground">Waves: all {WAVES.length}</span>
                <span className="rounded-md border border-border bg-card px-2 py-0.5 text-foreground">Weighted</span>
                <span className="text-muted-foreground">Applies to every answer</span>
              </div>
            </header>

            {turns.length === 0 && (
              <div className={`${card} p-5`}>
                <p className="text-sm text-foreground">Start with one of these, or type your own question below.</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {SUGGESTIONS.map((s) => (
                    <button key={s} type="button" onClick={() => ask(s)} className={chipBtn}>{s}</button>
                  ))}
                </div>
              </div>
            )}

            {turns.map((t) => (
              <div key={t.id} className="space-y-3">
                <div className="flex justify-end">
                  <div className="max-w-[80%] rounded-[14px] bg-muted px-4 py-2.5 text-sm text-foreground">{t.question}</div>
                </div>
                {t.answer ? (
                  <AnswerCard a={t.answer} onAsk={ask} onOpen={onOpen} />
                ) : (
                  <div className={`${card} border-l-[3px] p-5`} style={{ borderLeftColor: AI_BLUE }}>
                    <p className="text-sm text-foreground">
                      I couldn't match that to the questions in this study, so I won't guess. Try one of these:
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {SUGGESTIONS.slice(0, 4).map((s) => (
                        <button key={s} type="button" onClick={() => ask(s)} className={chipBtn}>{s}</button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
            <div ref={endRef} />
          </div>
        </div>

        <div className="border-t border-border bg-card">
          <form className="mx-auto flex w-full max-w-3xl gap-2 p-4" onSubmit={(e) => { e.preventDefault(); ask(input) }}>
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask about awareness, trial, main brand, recommendation or a brand comparison…"
              className="h-10 flex-1 rounded-[10px] border border-border bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
            <button type="submit" disabled={!input.trim()}
              className="h-10 rounded-[10px] bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50">
              Ask
            </button>
          </form>
          <p className="mx-auto max-w-3xl px-4 pb-3 text-xs text-muted-foreground">
            Only question names and labels are used to understand your question. Every number is calculated from the survey data.
          </p>
        </div>
      </div>

      <aside className="hidden w-[300px] shrink-0 overflow-y-auto border-l border-border p-4 lg:block">
        <div className={`${card} p-4`}>
          <h2 className="text-sm font-semibold text-foreground">What stands out</h2>
          <p className="mt-1 text-xs text-muted-foreground">Significant changes, {previousWave} → {latestWave}</p>
          {stands.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">No significant changes since the previous wave.</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {stands.map((c) => {
                const up = c.direction === 1
                const metric = METRIC[c.questionId] ?? c.questionLabel.toLowerCase()
                return (
                  <li key={`${c.questionId}-${c.brandCode}`}>
                    <button type="button" onClick={() => ask(`How has ${c.brand} ${metric} changed?`)}
                      className="w-full rounded-[10px] border border-border px-3 py-2 text-left text-sm hover:bg-muted/40 focus:outline-none focus:ring-2 focus:ring-primary/40">
                      <span className={up ? 'text-sig-high' : 'text-sig-low'}>{up ? '▲ ' : '▼ '}</span>
                      <span className="text-foreground">{c.brand} {metric} {up ? 'rose' : 'fell'} {Math.abs(c.change)} pts to {Math.round(c.current)}%</span>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        <div className={`${card} mt-4 p-4`}>
          <h2 className="text-sm font-semibold text-foreground">Research basis</h2>
          <dl className="mt-2 space-y-1 text-xs">
            <div className="flex justify-between gap-2"><dt className="text-muted-foreground">Market</dt><dd className="text-foreground">India</dd></div>
            <div className="flex justify-between gap-2"><dt className="text-muted-foreground">Waves</dt><dd className="text-right text-foreground">{WAVES.join(', ')}</dd></div>
            <div className="flex justify-between gap-2"><dt className="text-muted-foreground">Weighting</dt><dd className="text-foreground">wt (age × gender)</dd></div>
          </dl>
        </div>

        {turns.length > 0 && (
          <div className={`${card} mt-4 p-4`}>
            <h2 className="text-sm font-semibold text-foreground">Recent questions</h2>
            <ul className="mt-2 space-y-1">
              {turns.slice(-5).reverse().map((t) => (
                <li key={t.id}>
                  <button type="button" onClick={() => ask(t.question)} className="w-full rounded-[8px] px-2 py-1 text-left text-xs text-foreground hover:bg-muted">
                    {t.question}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </aside>
    </div>
  )
}
