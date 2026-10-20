import { Fragment, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLensStore } from '@/store/useLensStore'
import { significantChanges } from '@/engine/insights'
import { WAVES } from '@/engine/questions'
import PageHeader from '@/components/PageHeader'
import { BASE_BODY, BASE_HEADER, loadStoredWaves, parseCsvFile, saveStoredWaves, validateWave, type CheckResult, type StoredWave } from '@/engine/uploads'
import datamapUrl from '../../data/campa_datamap.xlsx?url'

const WAVE_IDX = BASE_HEADER.indexOf('wave')
const WT_IDX = BASE_HEADER.indexOf('wt')
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const METRIC: Record<string, string> = { Q1: 'awareness', Q2: 'trial', Q3: 'main-brand share' }
const ANALYSIS_WAVES = WAVES as readonly string[]

type WaveRow = {
  name: string
  n: number
  weightedAll: boolean
  fieldsPresent: number
  lines: string[]
  inAnalysis: boolean
  stored?: StoredWave
}

function rowStats(name: string, lines: string[], stored: StoredWave | undefined): WaveRow {
  const present = Array.from({ length: BASE_HEADER.length }, () => false)
  let weightedAll = lines.length > 0
  for (const l of lines) {
    const cells = l.split(',')
    cells.forEach((c, i) => {
      if (c.trim() !== '') present[i] = true
    })
    const wt = Number(cells[WT_IDX])
    if (!Number.isFinite(wt) || wt <= 0) weightedAll = false
  }
  return { name, n: lines.length, weightedAll, fieldsPresent: present.filter(Boolean).length, lines, inAnalysis: ANALYSIS_WAVES.includes(name), stored }
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

function downloadWave(name: string, lines: string[]) {
  const csv = [BASE_HEADER.join(','), ...lines].join('\n')
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
  const a = document.createElement('a')
  a.href = url
  a.download = `campa_tracker_${name}.csv`
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
  const [stored] = useState<StoredWave[]>(() => loadStoredWaves())
  const latest = ANALYSIS_WAVES[ANALYSIS_WAVES.length - 1] ?? ''
  const [open, setOpen] = useState<string | null>(latest || null)
  const [addOpen, setAddOpen] = useState(false)
  const [name, setName] = useState('')
  const [fileName, setFileName] = useState('')
  const [check, setCheck] = useState<CheckResult | null>(null)
  const [busy, setBusy] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)
  const lastFile = useRef<File | null>(null)
  const addRef = useRef<HTMLDivElement>(null)

  const rows: WaveRow[] = useMemo(() => {
    const storedLines = stored.flatMap((w) => w.csv.split('\n').filter((l) => l.trim().length > 0))
    const all = [...BASE_BODY, ...storedLines]
    const linesFor = (w: string) => all.filter((l) => (l.split(',')[WAVE_IDX] ?? '').trim() === w)
    const names = [...ANALYSIS_WAVES, ...stored.map((s) => s.name).filter((n) => !ANALYSIS_WAVES.includes(n))]
    return names.map((n) => rowStats(n, linesFor(n), stored.find((s) => s.name === n)))
  }, [stored])

  const changesByWave = useMemo(
    () => ANALYSIS_WAVES.map((w, i) => (i === 0 ? null : significantChanges(WAVES[i]!, WAVES[i - 1]!))),
    [],
  )

  const analysisRows = rows.filter((r) => r.inAnalysis)
  const total = analysisRows.reduce((s, r) => s + r.n, 0)
  const taken = rows.map((r) => r.name)
  const suggested = (() => {
    let c = nextWaveLabel(latest)
    while (c && taken.includes(c)) c = nextWaveLabel(c)
    return c
  })()
  const nextExpected = nextWaveLabel(latest)
  const waveName = (name || suggested).trim()

  const viewWave = (wave: string) => {
    useLensStore.setState({ waveScope: wave } as Partial<ReturnType<typeof useLensStore.getState>>)
    openCrossTab({ row: 'Q1', column: 'AGE', filters: [] }, navigate)
  }

  const runCheck = async (file: File, wn: string) => {
    setBusy('Checking the file…')
    setFileName(file.name)
    setCheck(null)
    try {
      setCheck(validateWave(await parseCsvFile(file), wn, taken))
    } catch (e) {
      setCheck({ rows: 0, matched: 0, errors: [e instanceof Error ? e.message : 'Could not read the file.'], warnings: [], lines: [], efficiency: 0 })
    } finally {
      setBusy('')
    }
  }
  const pick = (f: File | undefined) => {
    if (!f) return
    lastFile.current = f
    void runCheck(f, waveName)
  }
  const changeName = (v: string) => {
    setName(v)
    if (lastFile.current) void runCheck(lastFile.current, (v || suggested).trim())
  }
  const resetUpload = () => {
    setCheck(null)
    setFileName('')
    lastFile.current = null
    if (fileRef.current) fileRef.current.value = ''
  }
  const openAdd = () => {
    setAddOpen(true)
    window.setTimeout(() => addRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50)
  }

  const add = () => {
    if (!check || check.errors.length) return
    const entry: StoredWave = {
      id: `${Date.now()}`,
      name: waveName,
      fileName,
      rows: check.rows,
      addedAt: new Date().toISOString(),
      csv: check.lines.join('\n'),
      warnings: check.warnings.length,
    }
    if (!saveStoredWaves([...stored, entry])) {
      setCheck({ ...check, errors: ['Not enough browser storage to save this wave. Remove an uploaded wave and try again.'] })
      return
    }
    setBusy(`Adding ${waveName}… every page will update`)
    window.setTimeout(() => window.location.reload(), 700)
  }
  const remove = (s: StoredWave) => {
    if (!window.confirm(`Remove ${s.name}? It will disappear from every page.`)) return
    saveStoredWaves(stored.filter((x) => x.id !== s.id))
    setBusy(`Removing ${s.name}…`)
    window.setTimeout(() => window.location.reload(), 500)
  }

  return (
    <div className="h-full w-full overflow-y-auto">
      <div className="mx-auto w-full max-w-6xl p-6">
        <PageHeader
          title="Waves"
          description="Every survey wave in this study, its data checks, and what changed in each."
          actions={<button type="button" className={btnPrimary} onClick={openAdd}>+ Add wave</button>}
        />
        <div className="mt-5 space-y-6">
          {busy && !check && <p className="rounded-[10px] bg-primary/5 px-4 py-2 text-sm text-primary">{busy}</p>}

          {/* Summary strip */}
          <section className={`${card} grid grid-cols-2 sm:grid-cols-4 sm:divide-x sm:divide-border`}>
            {[
              { label: 'Waves in analysis', value: String(analysisRows.length), note: stored.length ? `${stored.length} uploaded` : '' },
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
                  {[...rows].reverse().map((w) => {
                    const idx = ANALYSIS_WAVES.indexOf(w.name)
                    const prev = idx > 0 ? ANALYSIS_WAVES[idx - 1] : undefined
                    const changes = idx >= 0 ? changesByWave[idx] ?? null : null
                    const ups = changes ? changes.filter((c) => c.direction === 1).length : 0
                    const downs = changes ? changes.filter((c) => c.direction !== 1).length : 0
                    const complete = w.fieldsPresent === BASE_HEADER.length && w.weightedAll
                    const share = w.inAnalysis && total > 0 ? `${Math.round((w.n / total) * 100)}%` : '—'
                    const expanded = open === w.name
                    return (
                      <Fragment key={w.name}>
                        <tr
                          className={`h-11 cursor-pointer border-b border-border transition-colors hover:bg-muted/30 ${expanded ? 'bg-muted/20' : ''}`}
                          onClick={() => setOpen(expanded ? null : w.name)}
                        >
                          <td className="px-5 py-2">
                            <button
                              type="button"
                              aria-expanded={expanded}
                              aria-label={`${expanded ? 'Hide' : 'Show'} details for ${w.name}`}
                              onClick={(e) => {
                                e.stopPropagation()
                                setOpen(expanded ? null : w.name)
                              }}
                              className="flex items-center gap-2 rounded focus:outline-none focus:ring-2 focus:ring-primary/40"
                            >
                              <span className="w-3 text-xs text-muted-foreground" aria-hidden="true">{expanded ? '▾' : '▸'}</span>
                              <span className="font-medium text-foreground">{w.name}</span>
                              {w.name === latest && <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">Latest</span>}
                              {idx === 0 && <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">Baseline</span>}
                              {w.stored && <span className="rounded-full border border-border px-2 py-0.5 text-[11px] font-medium text-muted-foreground">Uploaded</span>}
                            </button>
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums text-foreground">{w.n.toLocaleString()}</td>
                          <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{share}</td>
                          <td className="px-3 py-2">
                            {complete ? (
                              <span className="text-sig-high">✓ {w.fieldsPresent}/{BASE_HEADER.length} fields · all weighted</span>
                            ) : (
                              <span className="text-[#B45309]">! {w.fieldsPresent}/{BASE_HEADER.length} fields · {w.weightedAll ? 'all weighted' : 'weights missing'}</span>
                            )}
                          </td>
                          <td className="px-3 py-2 tabular-nums">
                            {!w.inAnalysis ? (
                              <span className="text-muted-foreground">—</span>
                            ) : !prev ? (
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
                            {w.inAnalysis ? (
                              <span className="inline-flex items-center gap-1.5 text-foreground"><span className="h-1.5 w-1.5 rounded-full bg-sig-high" aria-hidden="true" />In analysis</span>
                            ) : (
                              <span className="inline-flex items-center gap-1.5 text-[#B45309]"><span className="h-1.5 w-1.5 rounded-full bg-[#B45309]" aria-hidden="true" />Saved · not in analysis</span>
                            )}
                          </td>
                          <td className="px-5 py-2">
                            <div className="flex justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
                              {w.inAnalysis && <button type="button" className={btnSm} onClick={() => viewWave(w.name)}>View</button>}
                              <button type="button" className={btnSm} onClick={() => downloadWave(w.name, w.lines)} disabled={w.lines.length === 0}>Download CSV</button>
                              {w.stored && <button type="button" className={`${btnSm} text-sig-low`} onClick={() => remove(w.stored!)}>Remove</button>}
                            </div>
                          </td>
                        </tr>
                        {expanded && (
                          <tr className="border-b border-border bg-muted/20">
                            <td colSpan={7} className="px-5 pb-4 pt-2">
                              {w.stored && (
                                <p className="mb-2 text-xs text-muted-foreground">
                                  Uploaded from <span className="font-mono">{w.stored.fileName}</span> on {new Date(w.stored.addedAt).toLocaleDateString()}
                                  {w.stored.warnings ? ` · ${w.stored.warnings} warning${w.stored.warnings > 1 ? 's' : ''} at upload` : ''} · stored in this browser
                                </p>
                              )}
                              {!w.inAnalysis ? (
                                <p className="text-sm text-muted-foreground">This wave is saved but the analysis can't read uploaded waves yet. It will join every page once that is connected.</p>
                              ) : !prev || !changes ? (
                                <p className="text-sm text-muted-foreground">Baseline wave. Changes in later waves are measured from here.</p>
                              ) : changes.length === 0 ? (
                                <p className="text-sm text-muted-foreground">No significant changes vs {prev} on awareness, trial or main-brand share.</p>
                              ) : (
                                <>
                                  <p className="mb-2 text-xs text-muted-foreground">{changes.length} significant change{changes.length === 1 ? '' : 's'} vs {prev} (95%)</p>
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

          {/* Add a wave */}
          {addOpen && (
            <section ref={addRef} className={`${card} scroll-mt-6 p-5`}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h2 className="text-sm font-semibold text-foreground">Add a wave</h2>
                  <p className="mt-0.5 text-xs text-muted-foreground">A CSV with the same columns as the data map. From Excel, use File → Save As → CSV.</p>
                </div>
                <button type="button" className="text-xs text-muted-foreground hover:text-foreground" onClick={() => { resetUpload(); setAddOpen(false) }}>Close</button>
              </div>

              <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-[160px_1fr]">
                <label className="block">
                  <span className="text-xs text-muted-foreground">Wave name</span>
                  <input
                    value={name}
                    onChange={(e) => changeName(e.target.value)}
                    placeholder={suggested || 'e.g. Jul-26'}
                    className="mt-1 h-9 w-full rounded-[10px] border border-border bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
                  />
                </label>
                <div
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => { e.preventDefault(); pick(e.dataTransfer.files[0]) }}
                  className="flex min-h-[64px] flex-wrap items-center justify-between gap-3 rounded-[10px] border border-dashed border-border px-4 py-3"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm text-foreground">{fileName || 'Drag the wave CSV here'}</p>
                    <p className="text-xs text-muted-foreground">{busy || (fileName ? 'Checked against the existing data' : 'Every row and column is checked before anything is added')}</p>
                  </div>
                  <div className="flex gap-2">
                    {fileName && <button type="button" className={btnSm} onClick={resetUpload}>Clear</button>}
                    <button type="button" className={btnSm} onClick={() => fileRef.current?.click()}>Choose file</button>
                  </div>
                  <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={(e) => pick(e.target.files?.[0])} />
                </div>
              </div>

              {check && (
                <div className="mt-4 space-y-3">
                  <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-foreground">
                    <span><span className="font-medium tabular-nums">{check.rows.toLocaleString()}</span> respondents</span>
                    <span><span className="font-medium tabular-nums">{check.matched}/{BASE_HEADER.length - 1}</span> columns matched</span>
                    {check.efficiency > 0 && <span>Weighting <span className="font-medium tabular-nums">{Math.round(check.efficiency * 100)}%</span> efficient</span>}
                  </div>
                  {check.errors.length === 0 && check.warnings.length === 0 && (
                    <p className="rounded-[10px] bg-[#EAF6EE] px-3 py-2 text-sm text-[#15803D]">✓ Every check passed. Ready to add.</p>
                  )}
                  {check.errors.length > 0 && (
                    <ul className="space-y-1 rounded-[10px] bg-[#FDEEEC] px-3 py-2 text-sm text-[#C0362C]">
                      {check.errors.slice(0, 6).map((e) => <li key={e}>✕ {e}</li>)}
                      {check.errors.length > 6 && <li>…and {check.errors.length - 6} more</li>}
                    </ul>
                  )}
                  {check.warnings.length > 0 && (
                    <ul className="space-y-1 rounded-[10px] bg-[#FEF4E6] px-3 py-2 text-sm text-[#B45309]">
                      {check.warnings.slice(0, 4).map((w) => <li key={w}>! {w}</li>)}
                    </ul>
                  )}
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="text-xs text-muted-foreground">
                      {check.errors.length ? 'Fix the errors in the file and choose it again.' : `Will be added as ${waveName}. Every page updates after adding.`}
                    </p>
                    <button type="button" className={btnPrimary} disabled={check.errors.length > 0 || !!busy} onClick={add}>
                      {busy && check.errors.length === 0 ? busy : 'Add to analysis'}
                    </button>
                  </div>
                </div>
              )}
            </section>
          )}

          {/* Setup + how it works */}
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
                  <span title="Questionnaire upload is coming soon">
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
              <h2 className="text-sm font-semibold text-foreground">How adding a wave works</h2>
              <ol className="mt-3 space-y-2 text-sm text-foreground">
                <li><span className="text-muted-foreground">1.</span> Export the wave as a CSV with the same columns as the data map.</li>
                <li><span className="text-muted-foreground">2.</span> Lens checks every row and column against the existing data.</li>
                <li><span className="text-muted-foreground">3.</span> Add it: Home, Cross-tabs, Ask AI, Weights and Storyboards all update.</li>
              </ol>
              <p className="mt-3 text-xs text-muted-foreground">Uploaded waves are stored in this browser. To remove one, use Remove in the table.</p>
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}