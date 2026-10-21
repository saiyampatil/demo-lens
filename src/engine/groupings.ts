import { useSyncExternalStore } from 'react'
import { respondents, type Respondent } from './data'
import { QUESTIONS, WAVES, BRANDS, type QuestionDef } from './questions'
import { twoProportionZTest } from './stats'
import type { CellResult, Filter } from './crosstab'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export type GroupingType = 'net' | 'classification'

export interface ClassGroup {
  id: string
  label: string
  members: number[]
}

export interface GroupingDef {
  id: string
  type: GroupingType
  name: string
  /** Questions this definition can be applied to (same answer options). */
  variables: string[]
  /** net only: 'options' = chosen answer options, 'range' = a range of scale values */
  kind: 'options' | 'range'
  members: number[]
  range: [number, number] | null
  /** classification only */
  groups: ClassGroup[]
  version: number
  createdAt: string
  updatedAt: string
  history: { version: number; updatedAt: string; summary: string }[]
}

export interface Applied {
  nets: string[]
  classification: string | null
  showMembers: boolean
}

export interface DisplayRow {
  id: string
  label: string
  cells: Record<string, CellResult>
  kind: 'base' | 'net' | 'parent' | 'member' | 'unclassified'
  /** true when the cells are % of respondents (even on a means question) */
  pct: boolean
  note?: string
}

export interface NetSpec {
  id: string
  label: string
  variable: string
  item?: string
  kind: 'options' | 'range'
  members: number[]
  range: [number, number] | null
  missing: number | null
  memberColumns: string[] // multi-response: the 0/1 columns of the member options
  multi: boolean
}

// ---------------------------------------------------------------------------
// Question helpers
// ---------------------------------------------------------------------------
export const RANGE_BOUNDS: Record<string, [number, number]> = { Q4: [1, 5], Q5: [0, 98], Q6: [0, 10] }

const q = (id: string): QuestionDef | undefined => QUESTIONS[id]
const isRangeQuestion = (id: string) => {
  const t = q(id)?.type
  return t === 'numeric' || t === 'scale' || t === 'grid'
}
const signature = (d: QuestionDef) => (d.options ?? []).map((o) => `${o.code}:${o.label}`).join('|')

export function optionQuestions(): QuestionDef[] {
  return Object.values(QUESTIONS).filter((d) => d.options && d.options.length > 0)
}
export function rangeQuestions(): QuestionDef[] {
  return Object.values(QUESTIONS).filter((d) => isRangeQuestion(d.id))
}
/** Questions that share exactly the same answer options as `variable`. */
export function compatibleVariables(variable: string): string[] {
  const base = q(variable)
  if (!base?.options) return [variable]
  const sig = signature(base)
  return optionQuestions().filter((d) => signature(d) === sig).map((d) => d.id)
}
export function optionLabel(variable: string, code: number): string {
  return q(variable)?.options?.find((o) => o.code === code)?.label ?? String(code)
}
const questionLabel = (id: string) => q(id)?.label ?? id

/** Values seen in the data that are not defined answer options (single-choice questions only). */
export function unknownCodes(variable: string, data: readonly Respondent[] = respondents): { code: number; waves: string[] }[] {
  const d = q(variable)
  if (!d || d.type !== 'single' || !d.options) return []
  const known = new Set(d.options.map((o) => o.code))
  const seen = new Map<number, Set<string>>()
  for (const r of data) {
    const v = r[variable]
    if (typeof v === 'number' && !known.has(v)) {
      if (!seen.has(v)) seen.set(v, new Set())
      seen.get(v)!.add(r.wave)
    }
  }
  return [...seen.entries()].map(([code, w]) => ({ code, waves: [...w] }))
}

// ---------------------------------------------------------------------------
// Describing definitions
// ---------------------------------------------------------------------------
export function describeDef(def: GroupingDef): string {
  const v = def.variables[0] ?? ''
  if (def.type === 'classification') {
    return def.groups.map((g) => `${g.label} (${g.members.map((c) => optionLabel(v, c)).join(', ')})`).join(' · ')
  }
  if (def.kind === 'range' && def.range) return `${def.range[0]}–${def.range[1]} on ${questionLabel(v)}`
  return `Any of ${def.members.map((c) => optionLabel(v, c)).join(', ')}`
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------
export function validateDef(def: GroupingDef, others: readonly GroupingDef[]): string[] {
  const errors: string[] = []
  const name = def.name.trim()
  if (!name) errors.push('Give the grouping a name.')
  else if (others.some((o) => o.name.trim().toLowerCase() === name.toLowerCase())) errors.push(`A grouping called "${name}" already exists.`)
  if (def.variables.length === 0) errors.push('Choose the question this grouping applies to.')
  for (const v of def.variables) if (!q(v)) errors.push(`Unknown question ${v}.`)

  const first = def.variables[0] ?? ''
  const optionCodes = new Set((q(first)?.options ?? []).map((o) => o.code))

  if (def.type === 'net') {
    if (def.kind === 'range') {
      const r = def.range
      const bounds = RANGE_BOUNDS[first]
      if (!r || !Number.isFinite(r[0]) || !Number.isFinite(r[1])) errors.push('Enter a minimum and a maximum value.')
      else {
        if (r[0] > r[1]) errors.push('The minimum is higher than the maximum.')
        if (bounds && (r[0] < bounds[0] || r[1] > bounds[1])) errors.push(`Values for ${questionLabel(first)} run from ${bounds[0]} to ${bounds[1]}.`)
      }
    } else {
      if (def.members.length === 0) errors.push('Choose at least one answer option.')
      if (def.members.some((c) => !optionCodes.has(c))) errors.push('A chosen option no longer exists on this question.')
    }
  } else {
    if (def.groups.length === 0) errors.push('Add at least one group.')
    const labels = new Set<string>()
    const seen = new Set<number>()
    for (const g of def.groups) {
      const label = g.label.trim()
      if (!label) errors.push('Every group needs a name.')
      else if (labels.has(label.toLowerCase())) errors.push(`Two groups are called "${label}".`)
      labels.add(label.toLowerCase())
      if (g.members.length === 0) errors.push(`${label || 'A group'} has no options.`)
      for (const c of g.members) {
        if (!optionCodes.has(c)) errors.push(`${label || 'A group'} uses an option that no longer exists.`)
        if (seen.has(c)) errors.push(`${optionLabel(first, c)} is in more than one group.`)
        seen.add(c)
      }
    }
    if (labels.has('unclassified')) errors.push('"Unclassified" is reserved: Lens adds it automatically.')
  }
  return [...new Set(errors)]
}

// ---------------------------------------------------------------------------
// Calculation (mirrors the cross-tab engine: same filters, columns, bases and significance test)
// ---------------------------------------------------------------------------
function matches(r: Respondent, filters: readonly Filter[]): boolean {
  for (const f of filters) {
    const v = r[f.variable]
    if (v === null || v === undefined) return false
    if (!f.codes.some((c) => String(c) === String(v))) return false
  }
  return true
}

function columnIds(col: string): string[] {
  if (col === 'TOTAL') return ['TOTAL']
  if (col === 'WAVE') return [...WAVES, 'TOTAL']
  const opts = q(col)?.options
  return opts ? [...opts.map((o) => String(o.code)), 'TOTAL'] : ['TOTAL']
}

function numeric(r: Respondent, key: string): number | null {
  const v = r[key]
  return typeof v === 'number' ? v : null
}

function share(sub: readonly Respondent[], spec: NetSpec, weighted: boolean) {
  let ub = 0
  let wb = 0
  let hit = 0
  for (const r of sub) {
    let valid = false
    let isHit = false
    if (spec.kind === 'range') {
      const v = numeric(r, spec.item ?? spec.variable)
      valid = v !== null && v !== spec.missing
      isHit = valid && spec.range !== null && v! >= spec.range[0] && v! <= spec.range[1]
    } else if (spec.multi) {
      valid = true
      isHit = spec.memberColumns.some((c) => r[c] === 1)
    } else {
      const v = numeric(r, spec.variable)
      valid = v !== null
      isHit = valid && spec.members.includes(v!)
    }
    if (!valid) continue
    const w = weighted ? r.wt : 1
    ub++
    wb += w
    if (isHit) hit += w
  }
  const raw = wb > 0 ? (hit / wb) * 100 : 0
  return { raw, ub, wb }
}

function runCells(spec: NetSpec, col: string, filtered: readonly Respondent[], weighted: boolean): Record<string, CellResult> {
  const cells: Record<string, CellResult> = {}
  for (const id of columnIds(col)) {
    const sub = id === 'TOTAL' ? filtered : col === 'WAVE' ? filtered.filter((r) => r.wave === id) : filtered.filter((r) => String(r[col]) === id)
    const s = share(sub, spec, weighted)
    cells[id] = { value: Math.round(s.raw), rawValue: s.raw, unweightedBase: s.ub, weightedBase: s.wb, hidden: s.ub < 30, significance: 0 }
  }
  if (col === 'WAVE') {
    for (let i = 1; i < WAVES.length; i++) {
      const a = cells[WAVES[i]!]
      const b = cells[WAVES[i - 1]!]
      if (a && b) a.significance = twoProportionZTest(a.rawValue / 100, a.unweightedBase, b.rawValue / 100, b.unweightedBase)
    }
  } else {
    const t = cells['TOTAL']
    if (t) for (const [id, c] of Object.entries(cells)) if (id !== 'TOTAL') c.significance = twoProportionZTest(c.rawValue / 100, c.unweightedBase, t.rawValue / 100, t.unweightedBase)
  }
  return cells
}

/**
 * Cells of one net row, keyed exactly like the Cross-tabs page keys its merged columns:
 * 'TOTAL' and `${columnGroup}:${columnId}`.
 */
export function netCells(spec: NetSpec, cols: readonly string[], filters: readonly Filter[], weighted: boolean, data: readonly Respondent[] = respondents): Record<string, CellResult> {
  const filtered = data.filter((r) => matches(r, filters))
  const runs = cols.length ? cols : ['TOTAL']
  const out: Record<string, CellResult> = {}
  runs.forEach((col, i) => {
    const cells = runCells(spec, col, filtered, weighted)
    for (const [id, c] of Object.entries(cells)) {
      if (id === 'TOTAL') {
        if (i === 0) out.TOTAL = c
      } else out[`${col}:${id}`] = c
    }
  })
  return out
}

function makeSpec(base: { id: string; label: string; variable: string; kind: 'options' | 'range'; members: number[]; range: [number, number] | null; item?: string }): NetSpec {
  const d = q(base.variable)
  const multi = d?.type === 'multi'
  const memberColumns = multi && d?.options && d.columns ? base.members.map((c) => d.columns![d.options!.findIndex((o) => o.code === c)]).filter((x): x is string => !!x) : []
  return { ...base, missing: d?.missingCode ?? null, memberColumns, multi }
}

/** The answer options on `variable` that no group of a classification covers (plus unknown codes seen in the data). */
export function unclassifiedCodes(def: GroupingDef, variable: string, data: readonly Respondent[] = respondents): number[] {
  const mapped = new Set(def.groups.flatMap((g) => g.members))
  const fromOptions = (q(variable)?.options ?? []).map((o) => o.code).filter((c) => !mapped.has(c))
  const unknown = unknownCodes(variable, data).map((u) => u.code).filter((c) => !mapped.has(c))
  return [...fromOptions, ...unknown]
}

export function specsForDef(def: GroupingDef, variable: string, data: readonly Respondent[] = respondents): NetSpec[] {
  if (def.type === 'classification') {
    const specs = def.groups.map((g) => makeSpec({ id: `cls:${def.id}:${g.id}`, label: g.label, variable, kind: 'options', members: g.members, range: null }))
    const un = unclassifiedCodes(def, variable, data)
    if (un.length) specs.push(makeSpec({ id: `cls:${def.id}:unclassified`, label: 'Unclassified', variable, kind: 'options', members: un, range: null }))
    return specs
  }
  if (def.kind === 'range') {
    const d = q(variable)
    if (d?.type === 'grid' && d.gridStatements) {
      return d.gridStatements.map((s) => makeSpec({ id: `net:${def.id}:${s.id}`, label: `${def.name} · ${s.label}`, variable, kind: 'range', members: [], range: def.range, item: s.id }))
    }
    return [makeSpec({ id: `net:${def.id}`, label: def.name, variable, kind: 'range', members: [], range: def.range })]
  }
  return [makeSpec({ id: `net:${def.id}`, label: def.name, variable, kind: 'options', members: def.members, range: null })]
}

export function buildGroupedRows(args: {
  rowVar: string
  baseRows: { id: string | number; label: string; cells: Record<string, CellResult> }[]
  defs: readonly GroupingDef[]
  applied: Applied
  cols: readonly string[]
  filters: readonly Filter[]
  weighted: boolean
}): { rows: DisplayRow[]; active: string[] } {
  const { rowVar, baseRows, defs, applied, cols, filters, weighted } = args
  const basePct = !isRangeQuestion(rowVar)
  const active: string[] = []
  const rows: DisplayRow[] = []

  const cls = basePct && applied.classification ? defs.find((d) => d.id === applied.classification && d.type === 'classification' && d.variables.includes(rowVar)) : undefined
  const baseFor = (code: number) => baseRows.find((r) => String(r.id) === String(code))

  if (cls) {
    active.push(cls.name)
    for (const spec of specsForDef(cls, rowVar)) {
      const isUn = spec.id.endsWith(':unclassified')
      rows.push({ id: spec.id, label: spec.label, cells: netCells(spec, cols, filters, weighted), kind: isUn ? 'unclassified' : 'parent', pct: true, note: isUn ? 'Options not in any group' : undefined })
      if (applied.showMembers) {
        for (const code of spec.members) {
          const b = baseFor(code)
          if (b) rows.push({ id: `m:${spec.id}:${b.id}`, label: b.label, cells: b.cells, kind: 'member', pct: true })
        }
      }
    }
  } else {
    for (const b of baseRows) rows.push({ id: String(b.id), label: b.label, cells: b.cells, kind: 'base', pct: basePct })
  }

  for (const id of applied.nets) {
    const def = defs.find((d) => d.id === id && d.type === 'net' && d.variables.includes(rowVar))
    if (!def) continue
    active.push(def.name)
    for (const spec of specsForDef(def, rowVar)) {
      rows.push({ id: spec.id, label: spec.label, cells: netCells(spec, cols, filters, weighted), kind: 'net', pct: true, note: describeDef(def) })
    }
  }
  return { rows, active }
}

// ---------------------------------------------------------------------------
// Data checks (per wave)
// ---------------------------------------------------------------------------
export interface DefCheck {
  items: { variable: string; label: string; waves: { wave: string; value: number; base: number; hidden: boolean }[] }[]
  warnings: string[]
}

export function checkDefinition(def: GroupingDef, data: readonly Respondent[] = respondents): DefCheck {
  const items: DefCheck['items'] = []
  const warnings: string[] = []
  for (const variable of def.variables) {
    for (const spec of specsForDef(def, variable, data)) {
      const cells = netCells(spec, ['WAVE'], [], true, data)
      const waves = WAVES.map((w) => {
        const c = cells[`WAVE:${w}`]
        return { wave: w, value: c?.rawValue ?? 0, base: c?.unweightedBase ?? 0, hidden: c?.hidden ?? true }
      })
      items.push({ variable, label: def.variables.length > 1 ? `${spec.label} · ${questionLabel(variable)}` : spec.label, waves })
      const where = def.variables.length > 1 ? ` on ${questionLabel(variable)}` : ''
      const empty = waves.filter((w) => w.base > 0 && w.value === 0).map((w) => w.wave)
      if (empty.length === waves.filter((w) => w.base > 0).length && empty.length > 0) warnings.push(`${spec.label}${where}: nobody matches in any wave.`)
      else if (empty.length) warnings.push(`${spec.label}${where}: nobody matches in ${empty.join(', ')}.`)
      const small = waves.filter((w) => w.hidden && w.base > 0).map((w) => w.wave)
      if (small.length) warnings.push(`${spec.label}${where}: base under 30 in ${small.join(', ')}, so those cells are hidden.`)
    }
    for (const u of unknownCodes(variable, data)) {
      const where = u.waves.join(', ')
      warnings.push(def.type === 'classification' ? `Code ${u.code} appears in ${questionLabel(variable)} (${where}) but is not a defined option: it is counted as Unclassified.` : `Code ${u.code} appears in ${questionLabel(variable)} (${where}) but is not a defined option: this net ignores it.`)
    }
  }
  return { items, warnings: [...new Set(warnings)] }
}

// ---------------------------------------------------------------------------
// Storage (browser) with versioning
// ---------------------------------------------------------------------------
const KEY = 'lens-groupings-v1'
const APPLIED_KEY = 'lens-groupings-applied-v1'
const memory: Record<string, string> = {}
const listeners = new Set<() => void>()
let defsCache: GroupingDef[] | null = null
let appliedCache: Applied | null = null

function readRaw(key: string): string | null {
  try {
    if (typeof localStorage !== 'undefined') return localStorage.getItem(key)
  } catch {
    /* fall through */
  }
  return memory[key] ?? null
}
function writeRaw(key: string, value: string) {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(key, value)
      return
    }
  } catch {
    /* fall through to memory */
  }
  memory[key] = value
}
const emit = () => listeners.forEach((l) => l())

function cleanDef(x: unknown): GroupingDef | null {
  if (typeof x !== 'object' || x === null) return null
  const o = x as Record<string, unknown>
  if (typeof o.id !== 'string' || typeof o.name !== 'string' || (o.type !== 'net' && o.type !== 'classification')) return null
  const nums = (v: unknown) => (Array.isArray(v) ? v.filter((n): n is number => typeof n === 'number') : [])
  const groups = Array.isArray(o.groups)
    ? o.groups.flatMap((g): ClassGroup[] => {
        const go = g as Record<string, unknown>
        return typeof go?.id === 'string' && typeof go.label === 'string' ? [{ id: go.id, label: go.label, members: nums(go.members) }] : []
      })
    : []
  const range = Array.isArray(o.range) && o.range.length === 2 && typeof o.range[0] === 'number' && typeof o.range[1] === 'number' ? ([o.range[0], o.range[1]] as [number, number]) : null
  const history = Array.isArray(o.history)
    ? o.history.flatMap((h) => {
        const ho = h as Record<string, unknown>
        return typeof ho?.version === 'number' && typeof ho.updatedAt === 'string' && typeof ho.summary === 'string' ? [{ version: ho.version, updatedAt: ho.updatedAt, summary: ho.summary }] : []
      })
    : []
  return {
    id: o.id,
    type: o.type,
    name: o.name,
    variables: Array.isArray(o.variables) ? o.variables.filter((v): v is string => typeof v === 'string') : [],
    kind: o.kind === 'range' ? 'range' : 'options',
    members: nums(o.members),
    range,
    groups,
    version: typeof o.version === 'number' ? o.version : 1,
    createdAt: typeof o.createdAt === 'string' ? o.createdAt : new Date().toISOString(),
    updatedAt: typeof o.updatedAt === 'string' ? o.updatedAt : new Date().toISOString(),
    history,
  }
}

export function getDefs(): GroupingDef[] {
  if (defsCache) return defsCache
  let list: GroupingDef[] = []
  try {
    const raw = readRaw(KEY)
    const parsed: unknown = raw ? JSON.parse(raw) : []
    if (Array.isArray(parsed)) list = parsed.map(cleanDef).filter((d): d is GroupingDef => d !== null)
  } catch {
    list = []
  }
  defsCache = list
  return list
}
function setDefs(list: GroupingDef[]) {
  defsCache = list
  writeRaw(KEY, JSON.stringify(list))
  emit()
}

const DEFAULT_APPLIED: Applied = { nets: [], classification: null, showMembers: true }
export function getApplied(): Applied {
  if (appliedCache) return appliedCache
  let a = DEFAULT_APPLIED
  try {
    const raw = readRaw(APPLIED_KEY)
    const o = raw ? (JSON.parse(raw) as Partial<Applied>) : {}
    a = {
      nets: Array.isArray(o.nets) ? o.nets.filter((n): n is string => typeof n === 'string') : [],
      classification: typeof o.classification === 'string' ? o.classification : null,
      showMembers: o.showMembers !== false,
    }
  } catch {
    a = DEFAULT_APPLIED
  }
  appliedCache = a
  return a
}
export function setApplied(patch: Partial<Applied>) {
  appliedCache = { ...getApplied(), ...patch }
  writeRaw(APPLIED_KEY, JSON.stringify(appliedCache))
  emit()
}

function subscribe(fn: () => void) {
  listeners.add(fn)
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY || e.key === APPLIED_KEY) {
      defsCache = null
      appliedCache = null
      fn()
    }
  }
  if (typeof window !== 'undefined') window.addEventListener('storage', onStorage)
  return () => {
    listeners.delete(fn)
    if (typeof window !== 'undefined') window.removeEventListener('storage', onStorage)
  }
}
export const useGroupings = (): GroupingDef[] => useSyncExternalStore(subscribe, getDefs, getDefs)
export const useApplied = (): Applied => useSyncExternalStore(subscribe, getApplied, getApplied)

const newId = () => `g_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
export const newGroupId = () => `c_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`

/** Create (new id) or update (new version) a definition. Returns the saved definition. */
export function saveDef(def: GroupingDef): GroupingDef {
  const list = getDefs()
  const now = new Date().toISOString()
  const existing = list.find((d) => d.id === def.id)
  const saved: GroupingDef = existing
    ? { ...def, name: def.name.trim(), version: existing.version + 1, createdAt: existing.createdAt, updatedAt: now, history: [...existing.history, { version: existing.version + 1, updatedAt: now, summary: describeDef(def) }].slice(-10) }
    : { ...def, id: def.id || newId(), name: def.name.trim(), version: 1, createdAt: now, updatedAt: now, history: [{ version: 1, updatedAt: now, summary: describeDef(def) }] }
  setDefs(existing ? list.map((d) => (d.id === saved.id ? saved : d)) : [...list, saved])
  return saved
}

export function deleteDef(id: string) {
  setDefs(getDefs().filter((d) => d.id !== id))
  const a = getApplied()
  if (a.nets.includes(id) || a.classification === id) setApplied({ nets: a.nets.filter((n) => n !== id), classification: a.classification === id ? null : a.classification })
}

// ---------------------------------------------------------------------------
// Starter templates (opened in the editor for review, never saved silently)
// ---------------------------------------------------------------------------
const brandCode = (label: string) => BRANDS.find((b) => b.label === label)?.code ?? 0

export interface Template {
  id: string
  title: string
  description: string
  build: () => Omit<GroupingDef, 'id' | 'version' | 'createdAt' | 'updatedAt' | 'history'>
}

const blank = { kind: 'options' as const, members: [] as number[], range: null as [number, number] | null, groups: [] as ClassGroup[] }

export const TEMPLATES: Template[] = [
  { id: 't-top2', title: 'Top 2 box', description: 'Brand attitudes rated 4 or 5', build: () => ({ ...blank, type: 'net', name: 'Top 2 box', variables: ['Q4'], kind: 'range', range: [4, 5] }) },
  { id: 't-bottom2', title: 'Bottom 2 box', description: 'Brand attitudes rated 1 or 2', build: () => ({ ...blank, type: 'net', name: 'Bottom 2 box', variables: ['Q4'], kind: 'range', range: [1, 2] }) },
  { id: 't-promoters', title: 'Promoters', description: 'Likelihood to recommend 9–10', build: () => ({ ...blank, type: 'net', name: 'Promoters (9–10)', variables: ['Q6'], kind: 'range', range: [9, 10] }) },
  { id: 't-detractors', title: 'Detractors', description: 'Likelihood to recommend 0–6', build: () => ({ ...blank, type: 'net', name: 'Detractors (0–6)', variables: ['Q6'], kind: 'range', range: [0, 6] }) },
  {
    id: 't-cola',
    title: 'Any cola brand',
    description: 'Campa, Thums Up, Coca-Cola or Pepsi',
    build: () => ({ ...blank, type: 'net', name: 'Any cola brand', variables: compatibleVariables('Q1'), members: ['Campa', 'Thums Up', 'Coca-Cola', 'Pepsi'].map(brandCode) }),
  },
  {
    id: 't-manufacturer',
    title: 'Manufacturer → brand',
    description: 'Starter mapping. Confirm ownership before reporting',
    build: () => ({
      ...blank,
      type: 'classification',
      name: 'Manufacturer',
      variables: compatibleVariables('Q1'),
      groups: [
        { id: newGroupId(), label: 'Reliance Consumer Products', members: [brandCode('Campa')] },
        { id: newGroupId(), label: 'The Coca-Cola Company', members: ['Thums Up', 'Coca-Cola', 'Sprite'].map(brandCode) },
        { id: newGroupId(), label: 'PepsiCo', members: [brandCode('Pepsi')] },
      ],
    }),
  },
]
