import { Fragment, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLensStore } from '@/store/useLensStore'
import { significantChanges } from '@/engine/insights'
import { WAVES } from '@/engine/questions'
import PageHeader from '@/components/PageHeader'
import rawCsv from '../../data/campa_tracker_data.csv?raw'
import datamapUrl from '../../data/campa_datamap.xlsx?url'

const LINES = rawCsv.split(/\r?\n/).filter((l) => l.trim().length > 0)
const HEADER = (LINES[0] ?? '').split(',').map((h) => h.trim())
const BODY = LINES.slice(1)
const WAVE_IDX = HEADER.indexOf('wave')
const WT_IDX = HEADER.indexOf('wt')
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const METRIC: Record<string, string> = { Q1: 'awareness', Q2: 'trial', Q3: 'main-brand share' }
const COMING_SOON = 'Uploading new waves is coming soon'

type WaveStat = { wave: string; n: number; weightedAll: boolean; fieldsPresent: number; lines: string[] }

function computeStats(): WaveStat[] {
  return WAVES.map((w) => {
    const lines = BODY.filter((l) => (l.split(',')[WAVE_IDX] ?? '').trim() === w)
    const present = Array.from({ length: HEADER.length }, () => false)
    let weightedAll = lines.length > 0
    for (const l of lines) {
      const cells = l.split(',')
      cells.forEach((c, i) => {
        if (c.trim() !== '') present[i] = true
      })
      const wt = cells[WT_IDX]
      if (wt === undefined || wt.trim() === '' || Number.isNaN(Number(wt))) weightedAll = false
    }
    return { wave: w, n: lines.length, weightedAll, fieldsPresent: present.filter(Boolean).length, lines }
  })
}

function nextWaveLabel(label: string): string {
  const m = /^([A-Za-z]{3})-(\d{2})$/.exec(label)
  if (!m) return ''
  const mi = MONTHS.indexOf(m[1] ?? '')
  if (mi < 0) return ''
  const total = mi + 3
  const yy = (Number(m[2]) + Math.floor(total / 12)) % 100
  return `${MONTHS[total % 12]}-${String(yy).padStart(2, '0')}`
}

function downloadWave(stat: WaveStat) {
  const csv = [HEADER.join(','), ...stat.lines].join('\n')
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
  const a = document.createElement('a')
  a.href = url
  a.download = `campa_tracker_${stat.wave}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

const card = 'rounded-[14px] border border-border bg-card'
const btnSm =
  'h-8 rounded-[8px] border border-border bg-card px-3 text-xs font-medium text-foreground hover:bg-muted focus:outline-none focus:ring-2 focus:ring-primary/40 disabled:cursor-not-allowed disabled:opacity-50'
const btnPrimary =
  'h-9 rounded-[10px] bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-primary/40 disabled:cursor-not-allowed disabled:opacity-50'

export default function Waves() {
  const navigate = useNavigate()
  const openCrossTab = useLensStore((s) => s.openCrossTab)
  const stats = useMemo(() => computeStats(), [])
  const changesByWave = useMemo(
    () => WAVES.map((w, i) => (i === 0 ? null : significantChanges(w, WAVES[i - 1]!))),
    [],
  )
  const latest = WAVES[WAVES.length - 1] ?? ''
  const [open, setOpen] = useState<string | null>(latest || null)

  const total = stats.reduce((s, w) => s + w.n, 0)
  const nextExpected = nextWaveLabel(latest)

  const viewWave = (wave: string) => {
    useLensStore.setState({ waveScope: wave } as Partial<ReturnType<typeof useLensStore.getState>>)
    openCrossTab({ row: 'Q1', column: 'AGE', filters: [] }, navigate)
  }

  const ordered = [...stats].reverse()

  return (
    <div className="h-full w-full overflow-y-auto">
      <div className="mx-auto w-full max-w-6xl p-6">
        <PageHeader
          title="Waves"
          description="Every survey wave in this study, its data checks, and what changed in each."
          actions={
            <span title={COMING_SOON}>
              <button type="button" className={btnPrimary} disabled aria-disabled="true">+ Add wave</button>
            </span>
          }
        />
        <div className="mt-5 space-y-6">
          {/* Summary strip */}
          <section className={`${card} grid grid-cols-2 sm:grid-cols-4 sm:divide-x sm:divide-border`}>
            {[
              { label: 'Waves', value: String(WAVES.length), note: '' },
              { label: 'Respondents', value: total.toLocaleString(), note: '' },
              { label: 'Latest wave', value: latest, note: '' },
              { label: 'Next expected', value: nextExpected || '—', note: nextExpected ? 'assuming the current quarterly cadence' : '' },
            ].map((s) => (
              <div key={s.label} className="px-5 py-3.5">
                <p className="text-xs text-muted-foreground">{s.label}</p>
                <p className="mt-0.5 text-lg font-semibold tabular-nums text-foreground">{s.value}</p>
                {s.note && <p className="text-xs text-muted-foreground">{s.note}</p>}
              </div>
            ))}
          </section>

          {/* Waves table */}
          <section className={`${card} overflow-hidden`}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/40 text-left text-xs text-muted-foreground">
                    <th className="px-5 py-2.5 font-medium">Wave</th>
                    <th className="px-3 py-2.5 text-right font-medium">Respondents</th>
                    <th className="px-3 py-2.5 text-right font-medium">Share</th>
                    <th className="px-3 py-2.5 font-medium">Data check</th>
                    <th className="px-3 py-2.5 font-medium">Changes vs previous</th>
                    <th className="px-3 py-2.5 font-medium">Status</th>
                    <th className="px-5 py-2.5 text-right font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {ordered.map((w) => {
                    const idx = WAVES.indexOf(w.wave as (typeof WAVES)[number])
                    const prev = idx > 0 ? WAVES[idx - 1] : undefined
                    const changes = changesByWave[idx] ?? null
                    const ups = changes ? changes.filter((c) => c.direction === 1).length : 0
                    const downs = changes ? changes.filter((c) => c.direction !== 1).length : 0
                    const complete = w.fieldsPresent === HEADER.length && w.weightedAll
                    const share = total > 0 ? Math.round((w.n / total) * 100) : 0
                    const expanded = open === w.wave
                    return (
                      <Fragment key={w.wave}>
                        <tr
                          className={`h-11 cursor-pointer border-b border-border transition-colors hover:bg-muted/30 ${expanded ? 'bg-muted/20' : ''}`}
                          onClick={() => setOpen(expanded ? null : w.wave)}
                        >
                          <td className="px-5 py-2">
                            <button
                              type="button"
                              aria-expanded={expanded}
                              aria-label={`${expanded ? 'Hide' : 'Show'} changes for ${w.wave}`}
                              onClick={(e) => {
                                e.stopPropagation()
                                setOpen(expanded ? null : w.wave)
                              }}
                              className="flex items-center gap-2 rounded focus:outline-none focus:ring-2 focus:ring-primary/40"
                            >
                              <span className="w-3 text-xs text-muted-foreground" aria-hidden="true">{expanded ? '▾' : '▸'}</span>
                              <span className="font-medium text-foreground">{w.wave}</span>
                              {idx === WAVES.length - 1 && (
                                <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">Latest</span>
                              )}
                              {idx === 0 && (
                                <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">Baseline</span>
                              )}
                            </button>
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums text-foreground">{w.n.toLocaleString()}</td>
                          <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{share}%</td>
                          <td className="px-3 py-2">
                            {complete ? (
                              <span className="text-sig-high">✓ {w.fieldsPresent}/{HEADER.length} fields · all weighted</span>
                            ) : (
                              <span className="text-[#B45309]">
                                ! {w.fieldsPresent}/{HEADER.length} fields · {w.weightedAll ? 'all weighted' : 'weights missing'}
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-2 tabular-nums">
                            {!prev ? (
                              <span className="text-muted-foreground">Baseline</span>
                            ) : ups + downs === 0 ? (
                              <span className="text-muted-foreground">None significant</span>
                            ) : (
                              <span>
                                {ups > 0 && <span className="text-sig-high">▲ {ups}</span>}
                                {ups > 0 && downs > 0 && <span className="text-muted-foreground"> · </span>}
                                {downs > 0 && <span className="text-sig-low">▼ {downs}</span>}
                                <span className="text-muted-foreground"> vs {prev}</span>
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-2">
                            <span className="inline-flex items-center gap-1.5 text-foreground">
                              <span className="h-1.5 w-1.5 rounded-full bg-sig-high" aria-hidden="true" />
                              In analysis
                            </span>
                          </td>
                          <td className="px-5 py-2">
                            <div className="flex justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
                              <button type="button" className={btnSm} onClick={() => viewWave(w.wave)}>View</button>
                              <button type="button" className={btnSm} onClick={() => downloadWave(w)}>Download CSV</button>
                            </div>
                          </td>
                        </tr>
                        {expanded && (
                          <tr className="border-b border-border bg-muted/20">
                            <td colSpan={7} className="px-5 pb-4 pt-2">
                              {!prev || !changes ? (
                                <p className="text-sm text-muted-foreground">Baseline wave. Changes in later waves are measured from here.</p>
                              ) : changes.length === 0 ? (
                                <p className="text-sm text-muted-foreground">No significant changes vs {prev} on awareness, trial or main-brand share.</p>
                              ) : (
                                <>
                                  <p className="mb-2 text-xs text-muted-foreground">
                                    {changes.length} significant change{changes.length === 1 ? '' : 's'} vs {prev} (95%)
                                  </p>
                                  <ul className="grid grid-cols-1 gap-x-8 gap-y-1.5 md:grid-cols-2">
                                    {changes.map((c) => {
                                      const up = c.direction === 1
                                      const metric = METRIC[c.questionId] ?? c.questionLabel.toLowerCase()
                                      return (
                                        <li key={`${c.questionId}-${c.brandCode}`} className="text-sm text-foreground">
                                          <span className={up ? 'text-sig-high' : 'text-sig-low'}>{up ? '▲ ' : '▼ '}</span>
                                          {c.brand} {metric} {up ? 'rose' : 'fell'} {Math.abs(c.change)} pts to {Math.round(c.current)}%
                                        </li>
                                      )
                                    })}
                                  </ul>
                                </>
                              )}
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <p className="border-t border-border px-5 py-2.5 text-xs text-muted-foreground">
              Changes are tested at 95% on awareness, trial and main-brand share for every brand. Click a row for details.
            </p>
          </section>

          {/* Setup + intended flow */}
          <section className="grid grid-cols-1 items-start gap-6 lg:grid-cols-2">
            <div className={`${card} p-5`}>
              <h2 className="text-sm font-semibold text-foreground">Study setup</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">Used by every wave, so an answer means the same thing in each.</p>
              <ul className="mt-3 divide-y divide-border text-sm">
                <li className="flex items-center justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <p className="text-foreground">Data map</p>
                    <p className="truncate font-mono text-xs text-muted-foreground">campa_datamap.xlsx · <span className="font-sans text-sig-high">in use</span></p>
                  </div>
                  <a className={`${btnSm} inline-flex items-center`} href={datamapUrl} download="campa_datamap.xlsx">Download</a>
                </li>
                <li className="flex items-center justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <p className="text-foreground">Questionnaire</p>
                    <p className="text-xs text-[#B45309]">Not uploaded · recommended</p>
                  </div>
                  <span title="Uploading files is coming soon">
                    <button type="button" className={btnSm} disabled aria-disabled="true">Upload</button>
                  </span>
                </li>
                <li className="flex items-center justify-between gap-3 py-2.5">
                  <div>
                    <p className="text-foreground">Open-ended codeframe</p>
                    <p className="text-xs text-muted-foreground">Optional · not set</p>
                  </div>
                </li>
              </ul>
            </div>

            <div className={`${card} p-5`}>
              <h2 className="text-sm font-semibold text-foreground">How new waves will work</h2>
              <ol className="mt-3 space-y-2 text-sm text-foreground">
                <li><span className="text-muted-foreground">1.</span> Upload the new wave's data file.</li>
                <li><span className="text-muted-foreground">2.</span> Lens checks every field against the data map.</li>
                <li><span className="text-muted-foreground">3.</span> Your research team confirms anything unusual; the wave then joins every analysis and trend.</li>
              </ol>
              <p className="mt-3 text-xs text-muted-foreground">Wave upload is not enabled in this preview.</p>
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}