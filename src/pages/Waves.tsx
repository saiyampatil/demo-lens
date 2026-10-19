import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLensStore } from '@/store/useLensStore'
import { significantChanges } from '@/engine/insights'
import { WAVES } from '@/engine/questions'
import rawCsv from '../../data/campa_tracker_data.csv?raw'
import datamapUrl from '../../data/campa_datamap.xlsx?url'

const LINES = rawCsv.split(/\r?\n/).filter((l) => l.trim().length > 0)
const HEADER = (LINES[0] ?? '').split(',').map((h) => h.trim())
const BODY = LINES.slice(1)
const WAVE_IDX = HEADER.indexOf('wave')
const WT_IDX = HEADER.indexOf('wt')
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const METRIC: Record<string, string> = { Q1: 'awareness', Q2: 'trial', Q3: 'main-brand share' }
const UPLOAD_KEY = 'lens-uploaded-waves'
const QUESTIONNAIRE_KEY = 'lens-questionnaire'
const STAGES = ['Reading file', 'Matching fields to the data map', 'Checking weights', 'Done']

type WaveStat = { wave: string; n: number; weightedAll: boolean; fieldsPresent: number; lines: string[] }
type Upload = {
  id: string
  name: string
  fileName: string
  sizeKb: number
  isCsv: boolean
  rows: number
  missing: string[]
  extra: string[]
  status: 'ready' | 'attention' | 'received'
  addedAt: string
}

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

function checkCsv(text: string) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0)
  const head = (lines[0] ?? '').split(',').map((h) => h.trim().replace(/^"|"$/g, ''))
  const missing = HEADER.filter((h) => h !== 'wave' && !head.includes(h))
  const extra = head.filter((h) => h !== '' && !HEADER.includes(h))
  return { rows: Math.max(0, lines.length - 1), missing, extra }
}

function loadUploads(): Upload[] {
  try {
    const s = localStorage.getItem(UPLOAD_KEY)
    return s ? (JSON.parse(s) as Upload[]) : []
  } catch {
    return []
  }
}

function saveUploads(u: Upload[]) {
  try {
    localStorage.setItem(UPLOAD_KEY, JSON.stringify(u))
  } catch {
    /* storage unavailable */
  }
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
const btn =
  'h-9 rounded-[10px] border border-border px-3 text-sm font-medium text-foreground hover:bg-muted focus:outline-none focus:ring-2 focus:ring-primary/40 disabled:opacity-50'
const btnPrimary =
  'h-9 rounded-[10px] bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-primary/40 disabled:opacity-50'

function AddWaveDialog({
  suggested,
  taken,
  onClose,
  onDone,
}: {
  suggested: string
  taken: string[]
  onClose: () => void
  onDone: (u: Upload) => void
}) {
  const [name, setName] = useState(suggested)
  const [file, setFile] = useState<File | null>(null)
  const [stage, setStage] = useState(-1)
  const [result, setResult] = useState<Upload | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const timers = useRef<number[]>([])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    const t = timers.current
    return () => {
      window.removeEventListener('keydown', onKey)
      t.forEach((id) => window.clearTimeout(id))
    }
  }, [onClose])

  const nameTaken = taken.includes(name.trim())
  const canStart = !!file && name.trim().length > 0 && !nameTaken && stage === -1

  const start = async () => {
    if (!file) return
    const isCsv = file.name.toLowerCase().endsWith('.csv')
    let rows = 0
    let missing: string[] = []
    let extra: string[] = []
    if (isCsv) {
      const checked = checkCsv(await file.text())
      rows = checked.rows
      missing = checked.missing
      extra = checked.extra
    }
    const upload: Upload = {
      id: `${Date.now()}`,
      name: name.trim(),
      fileName: file.name,
      sizeKb: Math.max(1, Math.round(file.size / 1024)),
      isCsv,
      rows,
      missing,
      extra,
      status: !isCsv ? 'received' : missing.length > 0 ? 'attention' : 'ready',
      addedAt: new Date().toISOString(),
    }
    STAGES.forEach((_, i) => {
      timers.current.push(window.setTimeout(() => setStage(i), i * 650))
    })
    timers.current.push(window.setTimeout(() => setResult(upload), STAGES.length * 650))
  }

  const pickFile = (f: File | undefined) => {
    if (f) setFile(f)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-wave-title"
        className={`${card} w-full max-w-lg p-6 shadow-lg`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id="add-wave-title" className="text-lg font-semibold text-foreground">Add a wave</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              The file is read through this study's data map, so answers mean the same thing in every wave.
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="text-muted-foreground hover:text-foreground">✕</button>
        </div>

        {stage === -1 && (
          <div className="mt-5 space-y-4">
            <label className="block">
              <span className="text-xs font-medium text-muted-foreground">Wave name</span>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Jul-26"
                className="mt-1 h-10 w-full rounded-[10px] border border-border bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
              {nameTaken && <span className="mt-1 block text-xs text-sig-low">A wave with this name already exists.</span>}
            </label>

            <div
              onDragOver={(e) => {
                e.preventDefault()
                setDragOver(true)
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault()
                setDragOver(false)
                pickFile(e.dataTransfer.files[0])
              }}
              className={`rounded-[10px] border border-dashed p-6 text-center ${dragOver ? 'border-primary bg-primary/5' : 'border-border'}`}
            >
              {file ? (
                <div>
                  <p className="text-sm font-medium text-foreground">{file.name}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{Math.max(1, Math.round(file.size / 1024))} KB</p>
                  <button type="button" className="mt-3 text-xs text-primary hover:underline" onClick={() => setFile(null)}>
                    Choose a different file
                  </button>
                </div>
              ) : (
                <div>
                  <p className="text-sm text-foreground">Drag the wave's data file here</p>
                  <p className="mt-1 text-xs text-muted-foreground">CSV, SPSS (.sav) or Excel</p>
                  <button type="button" className={`${btn} mt-3`} onClick={() => inputRef.current?.click()}>
                    Choose file
                  </button>
                </div>
              )}
              <input
                ref={inputRef}
                type="file"
                accept=".csv,.sav,.xlsx,.xls"
                className="hidden"
                onChange={(e) => pickFile(e.target.files?.[0])}
              />
            </div>

            <div className="flex justify-end gap-2">
              <button type="button" className={btn} onClick={onClose}>Cancel</button>
              <button type="button" className={btnPrimary} disabled={!canStart} onClick={() => void start()}>
                Check and add
              </button>
            </div>
          </div>
        )}

        {stage >= 0 && !result && (
          <ol className="mt-5 space-y-2">
            {STAGES.slice(0, -1).map((s, i) => (
              <li key={s} className="flex items-center gap-2 text-sm">
                <span className={i < stage ? 'text-sig-high' : i === stage ? 'text-primary' : 'text-muted-foreground'}>
                  {i < stage ? '✓' : i === stage ? '●' : '○'}
                </span>
                <span className={i <= stage ? 'text-foreground' : 'text-muted-foreground'}>{s}</span>
              </li>
            ))}
          </ol>
        )}

        {result && (
          <div className="mt-5 space-y-3">
            <div
              className={`rounded-[10px] p-3 text-sm ${
                result.status === 'ready'
                  ? 'bg-[#EAF6EE] text-[#15803D]'
                  : result.status === 'attention'
                    ? 'bg-[#FEF4E6] text-[#B45309]'
                    : 'bg-muted text-foreground'
              }`}
            >
              {result.status === 'ready' && `All ${HEADER.length - 1} expected fields found in ${result.rows.toLocaleString()} rows.`}
              {result.status === 'attention' && `${result.missing.length} expected field(s) missing: ${result.missing.slice(0, 6).join(', ')}${result.missing.length > 6 ? '…' : ''}`}
              {result.status === 'received' && 'File received. SPSS and Excel files are checked by your research team.'}
            </div>
            {result.extra.length > 0 && (
              <p className="text-xs text-muted-foreground">
                New fields not in the data map: {result.extra.slice(0, 6).join(', ')}{result.extra.length > 6 ? '…' : ''}
              </p>
            )}
            <p className="text-xs text-muted-foreground">In this demo, new waves are checked and listed but not yet added to the analysis.</p>
            <div className="flex justify-end">
              <button type="button" className={btnPrimary} onClick={() => onDone(result)}>Done</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default function Waves() {
  const navigate = useNavigate()
  const openCrossTab = useLensStore((s) => s.openCrossTab)
  const stats = useMemo(() => computeStats(), [])
  const changesByWave = useMemo(
    () => WAVES.map((w, i) => (i === 0 ? null : significantChanges(w, WAVES[i - 1]!))),
    [],
  )
  const [uploads, setUploads] = useState<Upload[]>(() => loadUploads())
  const [dialogOpen, setDialogOpen] = useState(false)
  const [questionnaire, setQuestionnaire] = useState<string>(() => {
    try {
      return localStorage.getItem(QUESTIONNAIRE_KEY) ?? ''
    } catch {
      return ''
    }
  })
  const qInputRef = useRef<HTMLInputElement>(null)

  const total = stats.reduce((s, w) => s + w.n, 0)
  const latest = WAVES[WAVES.length - 1] ?? ''
  const nextExpected = nextWaveLabel(latest)
  const suggestedName = (() => {
    let candidate = nextExpected
    const names = uploads.map((u) => u.name)
    while (candidate && names.includes(candidate)) candidate = nextWaveLabel(candidate)
    return candidate
  })()

  const updateUploads = (u: Upload[]) => {
    setUploads(u)
    saveUploads(u)
  }

  const viewWave = (wave: string) => {
    useLensStore.setState({ waveScope: wave } as Partial<ReturnType<typeof useLensStore.getState>>)
    openCrossTab({ row: 'Q1', column: 'AGE', filters: [] }, navigate)
  }

  const onQuestionnaire = (f: File | undefined) => {
    if (!f) return
    setQuestionnaire(f.name)
    try {
      localStorage.setItem(QUESTIONNAIRE_KEY, f.name)
    } catch {
      /* storage unavailable */
    }
  }

  const ordered = [...stats].reverse()

  return (
    <div className="h-full w-full overflow-y-auto">
      <div className="mx-auto w-full max-w-6xl space-y-6 p-6">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-foreground">Waves</h1>
            <p className="mt-1 text-sm text-muted-foreground">Every survey wave in this study, what changed in each, and where to add the next one.</p>
          </div>
          <button type="button" className={btnPrimary} onClick={() => setDialogOpen(true)}>+ Add wave</button>
        </header>

        <section className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {[
            { label: 'Waves', value: String(WAVES.length) },
            { label: 'Respondents', value: total.toLocaleString() },
            { label: 'Latest wave', value: latest },
            { label: 'Next expected', value: nextExpected || '—' },
          ].map((s) => (
            <div key={s.label} className={`${card} p-4`}>
              <p className="text-xs font-medium text-muted-foreground">{s.label}</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums text-foreground">{s.value}</p>
            </div>
          ))}
        </section>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <section className="space-y-4 lg:col-span-2">
            <h2 className="text-sm font-semibold text-foreground">Waves in analysis · {WAVES.length}</h2>

            {uploads.length > 0 && (
              <div className="space-y-3">
                {[...uploads].reverse().map((u) => (
                  <div key={u.id} className={`${card} border-dashed p-5`}>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-base font-semibold text-foreground">{u.name}</h3>
                          <span
                            className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                              u.status === 'ready'
                                ? 'bg-[#EAF6EE] text-[#15803D]'
                                : u.status === 'attention'
                                  ? 'bg-[#FEF4E6] text-[#B45309]'
                                  : 'bg-muted text-muted-foreground'
                            }`}
                          >
                            {u.status === 'ready' ? 'Checked · fields match' : u.status === 'attention' ? 'Needs attention' : 'Received'}
                          </span>
                        </div>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {u.fileName} · {u.sizeKb} KB{u.isCsv ? ` · ${u.rows.toLocaleString()} rows` : ''}
                          {u.missing.length > 0 ? ` · ${u.missing.length} field(s) missing` : ''}
                          {u.extra.length > 0 ? ` · ${u.extra.length} new field(s)` : ''}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">Uploaded {new Date(u.addedAt).toLocaleDateString()} · not yet in analysis (demo)</p>
                      </div>
                      <button type="button" className={btn} onClick={() => updateUploads(uploads.filter((x) => x.id !== u.id))}>Remove</button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {ordered.map((w) => {
              const idx = WAVES.indexOf(w.wave as (typeof WAVES)[number])
              const prev = idx > 0 ? WAVES[idx - 1] : undefined
              const changes = changesByWave[idx] ?? null
              const isLatest = idx === WAVES.length - 1
              const share = total > 0 ? Math.round((w.n / total) * 100) : 0
              return (
                <div key={w.wave} className={`${card} p-5`}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-base font-semibold text-foreground">{w.wave}</h3>
                        {isLatest && <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">Latest</span>}
                        {idx === 0 && <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">Baseline</span>}
                        <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                          <span className="h-2 w-2 rounded-full bg-sig-high" aria-hidden="true" /> Ready
                        </span>
                      </div>
                      <p className="mt-1 text-sm text-muted-foreground">
                        <span className="tabular-nums text-foreground">{w.n.toLocaleString()}</span> respondents · {share}% of total ·{' '}
                        {w.fieldsPresent}/{HEADER.length} fields present ·{' '}
                        {w.weightedAll ? 'every respondent weighted' : 'some respondents have no weight'}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button type="button" className={btn} onClick={() => viewWave(w.wave)}>View in Cross-tabs</button>
                      <button type="button" className={btn} onClick={() => downloadWave(w)}>Download CSV</button>
                    </div>
                  </div>

                  <div className="mt-4 border-t border-border pt-3">
                    {idx === 0 || !changes ? (
                      <p className="text-sm text-muted-foreground">Baseline wave. Changes in later waves are measured from here.</p>
                    ) : changes.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No significant changes vs {prev}.</p>
                    ) : (
                      <>
                        <p className="text-xs text-muted-foreground">{changes.length} significant change{changes.length === 1 ? '' : 's'} vs {prev} (95%)</p>
                        <ul className="mt-2 space-y-1.5">
                          {changes.slice(0, 4).map((c) => {
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
                  </div>
                </div>
              )
            })}
          </section>

          <aside className="space-y-4">
            <div className={`${card} p-5`}>
              <h2 className="text-sm font-semibold text-foreground">Study setup</h2>
              <p className="mt-1 text-xs text-muted-foreground">Set once and used by every wave, so an answer means the same thing in each.</p>
              <ul className="mt-4 space-y-4">
                <li className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground">Data map</p>
                    <p className="truncate font-mono text-xs text-muted-foreground">campa_datamap.xlsx</p>
                    <p className="text-xs text-sig-high">In use</p>
                  </div>
                  <a className={`${btn} inline-flex items-center`} href={datamapUrl} download="campa_datamap.xlsx">Download</a>
                </li>
                <li className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground">Questionnaire</p>
                    <p className="truncate text-xs text-muted-foreground">{questionnaire || 'Not uploaded'}</p>
                    <p className={`text-xs ${questionnaire ? 'text-sig-high' : 'text-[#B45309]'}`}>{questionnaire ? 'Uploaded' : 'Recommended'}</p>
                  </div>
                  <button type="button" className={btn} onClick={() => qInputRef.current?.click()}>{questionnaire ? 'Replace' : 'Upload'}</button>
                  <input ref={qInputRef} type="file" accept=".pdf,.doc,.docx" className="hidden" onChange={(e) => onQuestionnaire(e.target.files?.[0])} />
                </li>
                <li className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-foreground">Open-ended codeframe</p>
                    <p className="text-xs text-muted-foreground">Optional · not set</p>
                  </div>
                </li>
              </ul>
            </div>

            <div className={`${card} p-5`}>
              <h2 className="text-sm font-semibold text-foreground">How adding a wave works</h2>
              <ol className="mt-3 space-y-2 text-sm text-foreground">
                <li><span className="text-muted-foreground">1.</span> Upload the wave's file (CSV, SPSS or Excel).</li>
                <li><span className="text-muted-foreground">2.</span> Lens checks every field against the data map.</li>
                <li><span className="text-muted-foreground">3.</span> Your research team confirms anything unusual; then the wave joins every analysis and trend.</li>
              </ol>
              <p className="mt-3 text-xs text-muted-foreground">In this demo, new waves are checked and listed but not yet added to the analysis.</p>
            </div>
          </aside>
        </div>
      </div>

      {dialogOpen && (
        <AddWaveDialog
          suggested={suggestedName}
          taken={[...WAVES, ...uploads.map((u) => u.name)]}
          onClose={() => setDialogOpen(false)}
          onDone={(u) => {
            updateUploads([...uploads, u])
            setDialogOpen(false)
          }}
        />
      )}
    </div>
  )
}
