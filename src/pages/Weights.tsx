import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLensStore } from '@/store/useLensStore'
import { crosstab } from '@/engine/crosstab'
import { QUESTIONS, WAVES } from '@/engine/questions'
import PageHeader from '@/components/PageHeader'
import rawCsv from '../../data/campa_tracker_data.csv?raw'

// ---------- data ----------
const LINES = rawCsv.split(/\r?\n/).filter((l) => l.trim().length > 0)
const HEADER = (LINES[0] ?? '').split(',').map((h) => h.trim())
const col = (name: string) => HEADER.indexOf(name)
const IDX = { wave: col('wave'), wt: col('wt'), AGE: col('AGE'), GENDER: col('GENDER'), CITY: col('CITY'), SEC: col('SEC') }

type Resp = { wave: string; wt: number; AGE: number; GENDER: number; CITY: number; SEC: number }
const RESP: Resp[] = LINES.slice(1).map((l) => {
  const c = l.split(',')
  const get = (i: number) => (c[i] ?? '').trim()
  return {
    wave: get(IDX.wave),
    wt: get(IDX.wt) === '' ? Number.NaN : Number(get(IDX.wt)),
    AGE: Number(get(IDX.AGE)),
    GENDER: Number(get(IDX.GENDER)),
    CITY: Number(get(IDX.CITY)),
    SEC: Number(get(IDX.SEC)),
  }
})

// Study settings: the targets the weight (wt) was built to. These are design inputs, not results.
type ProfileVar = 'AGE' | 'GENDER' | 'CITY' | 'SEC'
const PROFILE_VARS: { id: ProfileVar; label: string; targets: Record<number, number> | null }[] = [
  { id: 'AGE', label: 'Age group', targets: { 1: 26, 2: 32, 3: 24, 4: 18 } },
  { id: 'GENDER', label: 'Gender', targets: { 1: 50, 2: 50 } },
  { id: 'CITY', label: 'City type', targets: null },
  { id: 'SEC', label: 'Socio-economic class', targets: null },
]

const optionLabels = (v: ProfileVar) =>
  (QUESTIONS[v].options ?? []).map((o) => ({ code: Number(o.code), label: o.label }))

function weightStats(rows: Resp[]) {
  const ws = rows.map((r) => r.wt).filter((w) => Number.isFinite(w) && w > 0)
  const sum = ws.reduce((a, b) => a + b, 0)
  const sumSq = ws.reduce((a, b) => a + b * b, 0)
  const eff = sumSq > 0 ? (sum * sum) / sumSq : 0
  const efficiency = rows.length ? eff / rows.length : 0
  const min = ws.length ? Math.min(...ws) : 0
  const max = ws.length ? Math.max(...ws) : 0
  return {
    n: rows.length,
    weightedN: ws.length,
    missing: rows.length - ws.length,
    eff,
    efficiency,
    deff: efficiency > 0 ? 1 / efficiency : 0,
    moe: eff > 0 ? 1.96 * Math.sqrt(0.25 / eff) * 100 : 0, // ± percentage points at p = 50%, 95% confidence
    min,
    max,
    ratio: min > 0 ? max / min : 0,
    extreme: ws.filter((w) => w > 3 || w < 1 / 3).length,
  }
}

function histogram(rows: Resp[]) {
  const ws = rows.map((r) => r.wt).filter((w) => Number.isFinite(w) && w > 0)
  if (ws.length === 0) return { lo: 0, hi: 1, bins: [] as number[] }
  const lo = Math.floor(Math.min(...ws) * 10) / 10
  let hi = Math.ceil(Math.max(...ws) * 10) / 10
  if (hi <= lo) hi = lo + 0.1
  const step = hi - lo <= 1.2 ? 0.05 : 0.1
  const count = Math.max(1, Math.round((hi - lo) / step))
  const bins = Array.from({ length: count }, () => 0)
  ws.forEach((w) => {
    const i = Math.min(count - 1, Math.max(0, Math.floor((w - lo) / step)))
    bins[i] = (bins[i] ?? 0) + 1
  })
  return { lo, hi, bins }
}

function niceCeil(x: number): number {
  if (x <= 0) return 1
  const mag = 10 ** Math.floor(Math.log10(x))
  for (const m of [1, 2, 2.5, 5, 10]) if (m * mag >= x) return m * mag
  return 10 * mag
}

function profile(rows: Resp[], v: ProfileVar, codes: number[]) {
  const valid = rows.filter((r) => Number.isFinite(r.wt))
  const totalW = valid.reduce((a, r) => a + r.wt, 0)
  return codes.map((code) => {
    const inGroup = rows.filter((r) => r[v] === code)
    const wGroup = valid.filter((r) => r[v] === code).reduce((a, r) => a + r.wt, 0)
    return {
      code,
      sample: rows.length ? (inGroup.length / rows.length) * 100 : 0,
      weighted: totalW ? (wGroup / totalW) * 100 : 0,
    }
  })
}

function keyResults(wave: string) {
  const key = wave === 'All' ? 'TOTAL' : wave
  const pick = (weighted: boolean) => {
    const q1 = crosstab({ row: 'Q1', column: 'WAVE', weighted })
    const q2 = crosstab({ row: 'Q2', column: 'WAVE', weighted })
    const q3 = crosstab({ row: 'Q3', column: 'WAVE', weighted })
    const q6 = crosstab({ row: 'Q6', column: 'WAVE', weighted, filters: [{ variable: 'Q3', codes: [1] }] })
    const campa = (rows: typeof q1.rows) => rows.find((r) => r.label === 'Campa')?.cells[key]?.rawValue ?? 0
    return [campa(q1.rows), campa(q2.rows), campa(q3.rows), q6.rows[0]?.cells[key]?.rawValue ?? 0]
  }
  const u = pick(false)
  const w = pick(true)
  return [
    { label: 'Campa awareness', unit: '%', u: u[0]!, w: w[0]! },
    { label: 'Campa trial', unit: '%', u: u[1]!, w: w[1]! },
    { label: 'Campa main-brand share', unit: '%', u: u[2]!, w: w[2]! },
    { label: 'Recommend (Campa main-brand users)', unit: '/10', u: u[3]!, w: w[3]! },
  ]
}

// ---------- UI ----------
const card = 'rounded-[14px] border border-border bg-card'
const seg = (on: boolean) =>
  `px-3 py-1.5 text-xs font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-primary/40 ${
    on ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground'
  }`
const moeTxt = (m: number) => `±${m.toFixed(1)}%`

export default function Weights() {
  const navigate = useNavigate()
  const weighted = useLensStore((s) => s.weighted)
  const [wave, setWave] = useState<string>('All')
  const [profileVar, setProfileVar] = useState<ProfileVar>('AGE')

  const rows = useMemo(() => (wave === 'All' ? RESP : RESP.filter((r) => r.wave === wave)), [wave])
  const s = useMemo(() => weightStats(rows), [rows])
  const hist = useMemo(() => histogram(rows), [rows])
  const results = useMemo(() => keyResults(wave), [wave])
  const byWave = useMemo(() => WAVES.map((w) => ({ wave: w, ...weightStats(RESP.filter((r) => r.wave === w)) })), [])

  const pv = PROFILE_VARS.find((p) => p.id === profileVar)!
  const options = optionLabels(profileVar)
  const prof = useMemo(() => profile(rows, profileVar, options.map((o) => o.code)), [rows, profileVar]) // eslint-disable-line react-hooks/exhaustive-deps

  const status = s.efficiency >= 0.9 && s.ratio <= 3 && s.missing === 0 ? 'healthy' : s.efficiency >= 0.75 && s.ratio <= 5 ? 'acceptable' : 'review'
  const statusStyle =
    status === 'healthy' ? 'bg-[#EAF6EE] text-[#15803D]' : status === 'acceptable' ? 'bg-[#FEF4E6] text-[#B45309]' : 'bg-[#FDEEEC] text-[#C0362C]'
  const lost = Math.max(0, Math.round(s.n - s.eff))
  const verdict =
    status === 'healthy'
      ? `Weighting is healthy. It costs the equivalent of ${lost.toLocaleString()} respondents in statistical power, and no respondent counts for more than ${s.max.toFixed(2)}×.`
      : status === 'acceptable'
        ? `Weighting is acceptable but noticeable: it costs the equivalent of ${lost.toLocaleString()} respondents, so fewer differences will reach significance.`
        : `Review the weighting: it costs the equivalent of ${lost.toLocaleString()} respondents${s.missing ? ` and ${s.missing} respondents have no weight` : ''}.`

  const maxDiff = Math.max(...results.map((r) => Math.abs(r.w - r.u) * (r.unit === '%' ? 1 : 10)))

  // histogram axes
  const maxBin = Math.max(0, ...hist.bins)
  const yMax = niceCeil(maxBin)
  const yTicks = [yMax, yMax / 2, 0]
  const span = hist.hi - hist.lo
  const onePos = span > 0 ? ((1 - hist.lo) / span) * 100 : -1
  const oneInRange = onePos >= 0 && onePos <= 100

  const targetVars = PROFILE_VARS.filter((p) => p.targets)

  return (
    <div className="h-full w-full overflow-y-auto">
      <div className="mx-auto w-full max-w-6xl p-6">
        <PageHeader
          title="Weights"
          description="How the sample is weighted, how healthy the weighting is, and how much it changes your results."
          actions={
            <div className="inline-flex overflow-hidden rounded-[10px] border border-border bg-card" role="tablist" aria-label="Wave">
              {['All', ...WAVES].map((w) => (
                <button key={w} type="button" role="tab" aria-selected={wave === w} onClick={() => setWave(w)} className={seg(wave === w)}>
                  {w === 'All' ? 'All waves' : w}
                </button>
              ))}
            </div>
          }
        />
        <div className="mt-5 space-y-6">
          {/* Verdict */}
          <section className={`${card} p-5`}>
            <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${statusStyle}`}>
              {status === 'healthy' ? 'Healthy' : status === 'acceptable' ? 'Acceptable' : 'Review'}
            </span>
            <p className="mt-2 text-sm text-foreground">{verdict}</p>
            <p className="mt-2 text-xs text-muted-foreground">
              Weighting in Cross-tabs is {weighted ? 'ON' : 'OFF'}{' '}
              <button type="button" onClick={() => navigate('/cross-tabs')} className="font-medium text-primary underline underline-offset-2 hover:opacity-80">
                Change in Cross-tabs →
              </button>
            </p>
          </section>

          {/* Tiles: health + precision */}
          <section className="grid grid-cols-2 gap-4 lg:grid-cols-3">
            {[
              { label: 'Effective base', value: Math.round(s.eff).toLocaleString(), note: `of ${s.n.toLocaleString()} respondents` },
              { label: 'Weighting efficiency', value: `${Math.round(s.efficiency * 100)}%`, note: 'higher is better; above 90% is healthy' },
              { label: 'Design effect', value: s.deff.toFixed(2), note: '1.00 means weighting costs no precision' },
              { label: 'Margin of error', value: moeTxt(s.moe), note: 'at 50%, 95% confidence, effective base' },
              { label: 'Weight range', value: `${s.min.toFixed(2)}–${s.max.toFixed(2)}`, note: s.extreme ? `${s.extreme} extreme weight(s)` : 'no extreme weights' },
              { label: 'Respondents weighted', value: s.weightedN.toLocaleString(), note: s.missing ? `${s.missing} without a weight` : 'every respondent' },
            ].map((t) => (
              <div key={t.label} className={`${card} p-4`}>
                <p className="text-xs font-medium text-muted-foreground">{t.label}</p>
                <p className="mt-1 text-2xl font-semibold tabular-nums text-foreground">{t.value}</p>
                <p className="mt-1 text-xs text-muted-foreground">{t.note}</p>
              </div>
            ))}
          </section>

          {/* Scheme + by wave */}
          <section className="grid grid-cols-1 items-start gap-6 lg:grid-cols-3">
            <div className={`${card} p-5`}>
              <h2 className="text-sm font-semibold text-foreground">Weighting scheme</h2>
              <dl className="mt-3 space-y-2 text-sm">
                {[
                  ['Variable', 'wt'],
                  ['Method', 'Rim weighting to targets'],
                  ['Variables', 'Age group × Gender'],
                  ['Source', 'From the data file'],
                ].map(([k, v]) => (
                  <div key={k} className="flex justify-between gap-3">
                    <dt className="text-muted-foreground">{k}</dt>
                    <dd className={`text-right text-foreground ${k === 'Variable' ? 'font-mono' : ''}`}>{v}</dd>
                  </div>
                ))}
              </dl>
              <div className="mt-4 border-t border-border pt-3">
                <p className="text-xs font-medium text-muted-foreground">Targets</p>
                {targetVars.map((p) => (
                  <p key={p.id} className="mt-1.5 text-sm text-foreground">
                    <span className="text-muted-foreground">{p.label}: </span>
                    {optionLabels(p.id)
                      .map((o) => `${o.label} ${p.targets?.[o.code] ?? '—'}%`)
                      .join(' · ')}
                  </p>
                ))}
                <p className="mt-2 text-xs text-muted-foreground">Targets are set in the study design.</p>
              </div>
            </div>

            <div className={`${card} p-5 lg:col-span-2`}>
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="text-sm font-semibold text-foreground">Weighting by wave</h2>
                <span className="text-xs text-muted-foreground">Click a wave to inspect it</span>
              </div>
              <div className="mt-3 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs text-muted-foreground">
                      <th className="py-2 text-left font-medium">Wave</th>
                      <th className="py-2 text-right font-medium">Respondents</th>
                      <th className="py-2 text-right font-medium">Effective base</th>
                      <th className="py-2 text-right font-medium">Efficiency</th>
                      <th className="py-2 text-right font-medium">Weight range</th>
                      <th className="py-2 text-right font-medium">Margin of error</th>
                    </tr>
                  </thead>
                  <tbody>
                    {byWave.map((w) => {
                      const on = wave === w.wave
                      return (
                        <tr key={w.wave} className={`border-t border-border ${on ? 'bg-primary/5' : ''}`}>
                          <td className="py-2.5">
                            <button type="button" onClick={() => setWave(w.wave)} className={`font-medium hover:text-primary focus:outline-none focus:ring-2 focus:ring-primary/40 ${on ? 'text-primary' : 'text-foreground'}`}>
                              {w.wave}
                            </button>
                          </td>
                          <td className="py-2.5 text-right tabular-nums text-foreground">{w.n.toLocaleString()}</td>
                          <td className="py-2.5 text-right tabular-nums text-foreground">{Math.round(w.eff).toLocaleString()}</td>
                          <td className={`py-2.5 text-right tabular-nums ${w.efficiency >= 0.9 ? 'text-foreground' : 'text-[#B45309]'}`}>{Math.round(w.efficiency * 100)}%</td>
                          <td className="py-2.5 text-right tabular-nums text-foreground">{w.min.toFixed(2)}–{w.max.toFixed(2)}</td>
                          <td className="py-2.5 text-right tabular-nums text-foreground">{moeTxt(w.moe)}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </section>

          {/* Sample vs target */}
          <section className={`${card} p-5`}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-foreground">Sample vs target</h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  {pv.targets ? `${pv.label} is a weighting variable: the weighted sample should match its target.` : `${pv.label} is not weighted to a target; this shows how weighting shifted it.`}
                </p>
              </div>
              <div className="inline-flex overflow-hidden rounded-[10px] border border-border">
                {PROFILE_VARS.map((p) => (
                  <button key={p.id} type="button" onClick={() => setProfileVar(p.id)} className={seg(profileVar === p.id)}>
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-muted-foreground">
                    <th className="py-2 text-left font-medium">{pv.label}</th>
                    <th className="py-2 text-right font-medium">Sample</th>
                    <th className="py-2 text-right font-medium">Weighted</th>
                    {pv.targets && <th className="py-2 text-right font-medium">Target</th>}
                    <th className="py-2 pl-6 text-left font-medium">Effect of weighting</th>
                  </tr>
                </thead>
                <tbody>
                  {prof.map((p) => {
                    const label = options.find((o) => o.code === p.code)?.label ?? String(p.code)
                    const target = pv.targets ? pv.targets[p.code] : undefined
                    const shift = p.weighted - p.sample
                    const onTarget = target !== undefined && Math.abs(p.weighted - target) <= 1
                    return (
                      <tr key={p.code} className="border-t border-border">
                        <td className="py-2.5 text-foreground">{label}</td>
                        <td className={`py-2.5 text-right tabular-nums ${Math.abs(shift) >= 3 ? 'text-[#B45309]' : 'text-foreground'}`}>{Math.round(p.sample)}%</td>
                        <td className="py-2.5 text-right tabular-nums text-foreground">{Math.round(p.weighted)}%</td>
                        {pv.targets && (
                          <td className="py-2.5 text-right tabular-nums text-muted-foreground">
                            {target !== undefined ? `${target}%` : '—'}
                            {target !== undefined && <span className={`ml-1.5 ${onTarget ? 'text-sig-high' : 'text-[#B45309]'}`}>{onTarget ? '✓' : '!'}</span>}
                          </td>
                        )}
                        <td className="py-2.5 pl-6 text-xs text-muted-foreground">
                          {Math.abs(shift) < 0.5 ? 'No change' : `Weighted ${shift > 0 ? 'up' : 'down'} ${Math.abs(Math.round(shift))} pts`}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </section>

          {/* Distribution + impact */}
          <section className="grid grid-cols-1 items-start gap-6 lg:grid-cols-2">
            <div className={`${card} p-5`}>
              <h2 className="text-sm font-semibold text-foreground">Weight distribution</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                How many respondents carry each weight. Weights near 1.0 are ideal; above 3 or below 0.33 are extreme.
                {oneInRange ? ' The dashed line marks 1.0.' : ''}
              </p>
              {hist.bins.length === 0 ? (
                <p className="mt-4 text-sm text-muted-foreground">No weights to show.</p>
              ) : (
                <>
                  <div className="mt-4 flex gap-2">
                    <div className="flex h-36 w-8 shrink-0 flex-col justify-between text-right text-xs tabular-nums leading-none text-muted-foreground" aria-hidden="true">
                      {yTicks.map((t) => (
                        <span key={t}>{Math.round(t)}</span>
                      ))}
                    </div>
                    <div className="relative h-36 flex-1" aria-label="Weight distribution histogram" role="img">
                      {[0, 50, 100].map((top) => (
                        <div key={top} className="absolute left-0 right-0 border-t border-dashed border-border" style={{ top: `${top}%` }} />
                      ))}
                      {oneInRange && (
                        <div className="absolute bottom-0 top-0 border-l border-dashed border-primary/60" style={{ left: `${onePos}%` }} />
                      )}
                      <div className="absolute inset-0 flex items-end gap-px">
                        {hist.bins.map((count, i) => (
                          <div key={i} className="flex h-full flex-1 flex-col justify-end" title={`${count} respondents`}>
                            <div className="w-full rounded-t-sm bg-primary/70" style={{ height: `${(count / yMax) * 100}%`, minHeight: count ? 2 : 0 }} />
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                  <div className="ml-10 mt-1 flex justify-between text-xs tabular-nums text-muted-foreground">
                    <span>{hist.lo.toFixed(1)}</span>
                    <span>{((hist.lo + hist.hi) / 2).toFixed(2)}</span>
                    <span>{hist.hi.toFixed(1)}</span>
                  </div>
                  <p className="ml-10 mt-1 text-xs text-muted-foreground">Weight · respondents per bar</p>
                </>
              )}
            </div>

            <div className={`${card} p-5`}>
              <h2 className="text-sm font-semibold text-foreground">Effect on key results</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                {wave === 'All' ? 'All waves combined.' : `${wave}.`}{' '}
                {maxDiff < 2 ? 'Weighting changes these results by less than 2 points.' : 'Weighting moves at least one result by 2 points or more; mention it when reporting.'}
              </p>
              <table className="mt-4 w-full text-sm">
                <thead>
                  <tr className="text-xs text-muted-foreground">
                    <th className="py-2 text-left font-medium">Result</th>
                    <th className="py-2 text-right font-medium">Unweighted</th>
                    <th className="py-2 text-right font-medium">Weighted</th>
                    <th className="py-2 text-right font-medium">Difference</th>
                  </tr>
                </thead>
                <tbody>
                  {results.map((r) => {
                    const isPct = r.unit === '%'
                    const d = r.w - r.u
                    const big = isPct ? Math.abs(d) >= 2 : Math.abs(d) >= 0.2
                    const fmt = (v: number) => (isPct ? `${Math.round(v)}%` : v.toFixed(1))
                    const dTxt = isPct ? `${d >= 0 ? '+' : '−'}${Math.abs(d).toFixed(1)} pts` : `${d >= 0 ? '+' : '−'}${Math.abs(d).toFixed(2)}`
                    return (
                      <tr key={r.label} className="border-t border-border">
                        <td className="py-2.5 text-foreground">{r.label}</td>
                        <td className="py-2.5 text-right tabular-nums text-muted-foreground">{fmt(r.u)}</td>
                        <td className="py-2.5 text-right tabular-nums text-foreground">{fmt(r.w)}</td>
                        <td className={`py-2.5 text-right tabular-nums ${big ? 'font-medium text-[#B45309]' : 'text-muted-foreground'}`}>{dTxt}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </section>

          {/* Roadmap stub */}
          <section className={`${card} flex flex-wrap items-center justify-between gap-3 p-4`}>
            <div>
              <p className="text-sm font-medium text-foreground">Create or replace weights</p>
              <p className="text-xs text-muted-foreground">RIM weighting to new targets · coming soon</p>
            </div>
            <button
              type="button"
              disabled
              title="Coming soon"
              className="h-8 cursor-not-allowed rounded-[8px] border border-border px-3 text-xs font-medium text-muted-foreground opacity-60"
            >
              Create weights
            </button>
          </section>

          <p className="text-xs leading-relaxed text-muted-foreground">
            Weights come from the <span className="font-mono">wt</span> column in the data file. Effective base = (Σw)² ÷ Σw²; design effect = n ÷ effective base;
            margin of error = 1.96 × √(0.25 ÷ effective base).
          </p>
        </div>
      </div>
    </div>
  )
}