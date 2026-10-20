import Papa from 'papaparse'
import rawCsv from '../../data/campa_tracker_data.csv?raw'

// ---------- base data (the bundled file) ----------
const LINES = rawCsv.split(/\r?\n/).filter((l) => l.trim().length > 0)
export const BASE_HEADER = (LINES[0] ?? '').split(',').map((h) => h.trim())
export const BASE_BODY = LINES.slice(1)
const BASE_CELLS = BASE_BODY.map((l) => l.split(','))
const IDX = (name: string) => BASE_HEADER.indexOf(name)
const SPECIAL_MISSING: Record<string, number[]> = { Q5: [99] }
const SOFT_RANGE = new Set(['Q5']) // out-of-range here is a warning, not an error
const FREE = new Set(['resp_id', 'wt', 'wave'])

// Allowed range and blank rule for every column, learned from the existing data.
type Rule = { min: number; max: number; blankOk: boolean }
const RULES: Record<string, Rule> = (() => {
  const r: Record<string, Rule> = {}
  BASE_HEADER.forEach((h, i) => {
    if (FREE.has(h)) return
    let min = Infinity
    let max = -Infinity
    let blankOk = false
    for (const c of BASE_CELLS) {
      const v = (c[i] ?? '').trim()
      if (v === '') {
        blankOk = true
        continue
      }
      const n = Number(v)
      if (!Number.isFinite(n) || (SPECIAL_MISSING[h] ?? []).includes(n)) continue
      if (n < min) min = n
      if (n > max) max = n
    }
    r[h] = { min, max, blankOk }
  })
  return r
})()

// ---------- stored uploads (browser storage) ----------
export type StoredWave = { id: string; name: string; fileName: string; rows: number; addedAt: string; csv: string; warnings: number }
const KEY = 'lens-wave-uploads-v2'

export function loadStoredWaves(): StoredWave[] {
  try {
    if (typeof localStorage === 'undefined') return []
    const s = localStorage.getItem(KEY)
    const v = s ? (JSON.parse(s) as StoredWave[]) : []
    return Array.isArray(v) ? v : []
  } catch {
    return []
  }
}

export function saveStoredWaves(w: StoredWave[]): boolean {
  try {
    if (typeof localStorage === 'undefined') return false
    localStorage.setItem(KEY, JSON.stringify(w))
    return true
  } catch {
    return false // storage full or unavailable
  }
}

/** Data lines (no header, same column order as the bundled file) of every uploaded wave. */
export function uploadedLines(): string[] {
  return loadStoredWaves().flatMap((w) => w.csv.split('\n').filter((l) => l.trim().length > 0))
}

/** Names of uploaded waves, in upload order. */
export function uploadedWaveNames(): string[] {
  return loadStoredWaves().map((w) => w.name)
}

// ---------- parsing ----------
export async function parseCsvFile(file: File): Promise<string[][]> {
  if (!file.name.toLowerCase().endsWith('.csv')) {
    throw new Error('Upload a .csv file. In Excel, use File → Save As → CSV.')
  }
  const text = await file.text()
  return parseCsvText(text)
}

export function parseCsvText(text: string): string[][] {
  const res = Papa.parse<string[]>(text, { skipEmptyLines: true })
  return res.data.map((r) => r.map((c) => String(c ?? '').trim()))
}

// ---------- validation ----------
export type CheckResult = {
  rows: number
  matched: number
  errors: string[]
  warnings: string[]
  lines: string[] // normalised to BASE_HEADER order, wave column set to the wave name
  efficiency: number
}

export function validateWave(table: string[][], waveName: string, takenNames: string[]): CheckResult {
  const errors: string[] = []
  const warnings: string[] = []
  const name = waveName.trim()

  if (!name) errors.push('Enter a wave name.')
  else if (takenNames.includes(name)) errors.push(`A wave called ${name} already exists.`)
  else if (!/^[A-Z][a-z]{2}-\d{2}$/.test(name)) warnings.push(`"${name}" doesn't follow the Mon-YY pattern used by other waves (e.g. Jul-26).`)

  const header = (table[0] ?? []).map((h) => h.trim())
  const lower = header.map((h) => h.toLowerCase())
  const colOf = (h: string) => lower.indexOf(h.toLowerCase())
  const body = table.slice(1).filter((r) => r.some((c) => c !== ''))

  const required = BASE_HEADER.filter((h) => h !== 'wave')
  const missing = required.filter((h) => colOf(h) < 0)
  const extra = header.filter((h) => h !== '' && !BASE_HEADER.some((b) => b.toLowerCase() === h.toLowerCase()))
  if (missing.length) errors.push(`Missing column${missing.length > 1 ? 's' : ''}: ${missing.slice(0, 8).join(', ')}${missing.length > 8 ? '…' : ''}.`)
  if (extra.length) warnings.push(`Extra column${extra.length > 1 ? 's' : ''} ignored: ${extra.slice(0, 6).join(', ')}${extra.length > 6 ? '…' : ''}.`)

  if (body.length < 30) errors.push(`Only ${body.length} rows. A wave needs at least 30 respondents.`)
  else if (body.length < 200) warnings.push(`Small sample (${body.length} respondents); many subgroup cells will be hidden.`)

  const waveCol = colOf('wave')
  if (waveCol >= 0) {
    const labels = new Set(body.map((r) => (r[waveCol] ?? '').trim()).filter(Boolean))
    if (labels.size > 0 && !(labels.size === 1 && labels.has(name))) {
      warnings.push(`The file's wave column says ${[...labels].slice(0, 3).join(', ')}; rows will be labelled ${name || 'with the name above'}.`)
    }
  }

  const existingIds = new Set<string>([
    ...BASE_CELLS.map((c) => (c[IDX('resp_id')] ?? '').trim()),
    ...uploadedLines().map((l) => (l.split(',')[IDX('resp_id')] ?? '').trim()),
  ])
  const seen = new Set<string>()
  let dupInFile = 0
  let dupExisting = 0
  const wts: number[] = []
  const problems: Record<string, { blank: number; bad: number; range: number; example: string }> = {}
  const note = (h: string, kind: 'blank' | 'bad' | 'range', example: string) => {
    const p = (problems[h] ??= { blank: 0, bad: 0, range: 0, example })
    p[kind]++
  }

  if (missing.length === 0) {
    for (const r of body) {
      const id = (r[colOf('resp_id')] ?? '').trim()
      if (id === '') note('resp_id', 'blank', '')
      else {
        if (seen.has(id)) dupInFile++
        if (existingIds.has(id)) dupExisting++
        seen.add(id)
      }
      const wtRaw = (r[colOf('wt')] ?? '').trim()
      const wt = Number(wtRaw)
      if (wtRaw === '' || !Number.isFinite(wt) || wt <= 0) note('wt', wtRaw === '' ? 'blank' : 'bad', wtRaw)
      else wts.push(wt)

      for (const [h, rule] of Object.entries(RULES)) {
        const v = (r[colOf(h)] ?? '').trim()
        if (v === '') {
          if (!rule.blankOk) note(h, 'blank', '')
          continue
        }
        const num = Number(v)
        if (!Number.isFinite(num)) {
          note(h, 'bad', v)
          continue
        }
        if ((SPECIAL_MISSING[h] ?? []).includes(num)) continue
        if (num < rule.min || num > rule.max) note(h, 'range', v)
      }
    }
  }

  if (dupInFile) errors.push(`${dupInFile} duplicate respondent ID${dupInFile > 1 ? 's' : ''} inside the file.`)
  if (dupExisting) errors.push(`${dupExisting} respondent ID${dupExisting > 1 ? 's' : ''} already exist in another wave. Is this file already uploaded?`)
  for (const [h, p] of Object.entries(problems)) {
    const rule = RULES[h]
    const range = rule && Number.isFinite(rule.min) ? `${rule.min}–${rule.max}` : ''
    if (p.blank) errors.push(`${h}: ${p.blank} blank value${p.blank > 1 ? 's' : ''} where an answer is required.`)
    if (p.bad) errors.push(`${h}: ${p.bad} non-numeric value${p.bad > 1 ? 's' : ''}${p.example ? ` (e.g. "${p.example}")` : ''}.`)
    if (p.range) {
      const msg = `${h}: ${p.range} value${p.range > 1 ? 's' : ''} outside ${range}${p.example ? ` (e.g. ${p.example})` : ''}.`
      if (SOFT_RANGE.has(h)) warnings.push(msg)
      else errors.push(msg)
    }
  }

  const sum = wts.reduce((a, b) => a + b, 0)
  const sumSq = wts.reduce((a, b) => a + b * b, 0)
  const efficiency = wts.length && sumSq ? (sum * sum) / sumSq / wts.length : 0
  if (wts.length && efficiency < 0.8) warnings.push(`Weighting efficiency is ${Math.round(efficiency * 100)}%; some respondents carry very large weights.`)

  const lines =
    missing.length === 0
      ? body.map((r) => BASE_HEADER.map((h) => (h === 'wave' ? name : (r[colOf(h)] ?? '').trim())).join(','))
      : []

  return { rows: body.length, matched: required.length - missing.length, errors, warnings, lines, efficiency }
}