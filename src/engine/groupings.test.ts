import { beforeEach, describe, expect, it } from 'vitest'
import { crosstab } from './crosstab'
import {
  buildGroupedRows, checkDefinition, deleteDef, getDefs, netCells, saveDef, setApplied, specsForDef, validateDef,
  type Applied, type GroupingDef,
} from './groupings'

const NOW = '2026-01-01T00:00:00.000Z'
const blank = { kind: 'options' as const, members: [] as number[], range: null as [number, number] | null, groups: [] as GroupingDef['groups'], version: 1, createdAt: NOW, updatedAt: NOW, history: [] as GroupingDef['history'] }
const net = (over: Partial<GroupingDef>): GroupingDef => ({ ...blank, id: 'n1', type: 'net', name: 'Net', variables: ['Q1'], ...over })
const cls = (over: Partial<GroupingDef>): GroupingDef => ({ ...blank, id: 'c1', type: 'classification', name: 'Manufacturer', variables: ['Q3'], ...over })
const first = (d: GroupingDef, v: string) => specsForDef(d, v)[0]!
const apply = (nets: string[], classification: string | null, showMembers = true): Applied => ({ nets, classification, showMembers })

describe('Groupings engine', () => {
  it('a one-member net equals the plain cross-tab row (values, bases and significance)', () => {
    const spec = first(net({ variables: ['Q1'], members: [1] }), 'Q1')
    const cells = netCells(spec, ['WAVE'], [], true)
    const plain = crosstab({ row: 'Q1', column: 'WAVE' }).rows.find((r) => r.label === 'Campa')!
    for (const id of ['Oct-25', 'Jan-26', 'Apr-26']) {
      const a = cells[`WAVE:${id}`]!
      const b = plain.cells[id]!
      expect(a.rawValue).toBeCloseTo(b.rawValue, 9)
      expect(a.unweightedBase).toBe(b.unweightedBase)
      expect(a.significance).toBe(b.significance)
    }
    expect(cells.TOTAL!.rawValue).toBeCloseTo(plain.cells.TOTAL!.rawValue, 9)

    const spec3 = first(net({ variables: ['Q3'], members: [1] }), 'Q3')
    const byAge = netCells(spec3, ['AGE'], [], true)
    const plain3 = crosstab({ row: 'Q3', column: 'AGE' }).rows.find((r) => r.label === 'Campa')!
    for (const id of ['1', '2', '3', '4']) {
      expect(byAge[`AGE:${id}`]!.rawValue).toBeCloseTo(plain3.cells[id]!.rawValue, 9)
      expect(byAge[`AGE:${id}`]!.significance).toBe(plain3.cells[id]!.significance)
      expect(byAge[`AGE:${id}`]!.unweightedBase).toBe(plain3.cells[id]!.unweightedBase)
    }
  })

  it('multi-response net counts respondents who chose ANY member', () => {
    const t = netCells(first(net({ members: [2, 3, 5] }), 'Q1'), ['TOTAL'], [], true).TOTAL!
    expect(t.rawValue).toBeCloseTo(99.9175, 3)
    expect(t.unweightedBase).toBe(1860)
  })

  it('Top 2 box on a grid statement', () => {
    const d = net({ variables: ['Q4'], kind: 'range', range: [4, 5] })
    const spec = specsForDef(d, 'Q4')[0]!
    expect(spec.label).toContain('Good value for money')
    expect(specsForDef(d, 'Q4')).toHaveLength(3)
    const total = netCells(spec, ['TOTAL'], [], true).TOTAL!
    expect(total.rawValue).toBeCloseTo(53.0127, 3)
    expect(total.unweightedBase).toBe(1846)
    const apr = netCells(spec, ['TOTAL'], [{ variable: 'wave', codes: ['Apr-26'] }], true).TOTAL!
    expect(apr.rawValue).toBeCloseTo(52.1064, 3)
    expect(apr.unweightedBase).toBe(635)
  })

  it('promoters and detractors on the recommend scale', () => {
    const p = netCells(first(net({ variables: ['Q6'], kind: 'range', range: [9, 10] }), 'Q6'), ['TOTAL'], [], true).TOTAL!
    const dt = netCells(first(net({ variables: ['Q6'], kind: 'range', range: [0, 6] }), 'Q6'), ['TOTAL'], [], true).TOTAL!
    expect(p.rawValue).toBeCloseTo(22.8095, 3)
    expect(dt.rawValue).toBeCloseTo(41.5299, 3)
  })

  it("numeric range excludes the don't-know code 99", () => {
    const t = netCells(first(net({ variables: ['Q5'], kind: 'range', range: [8, 98] }), 'Q5'), ['TOTAL'], [], true).TOTAL!
    expect(t.rawValue).toBeCloseTo(24.9932, 3)
    expect(t.unweightedBase).toBe(1765)
  })

  it('classification: parent rows, indented members and an Unclassified bucket', () => {
    const def = cls({ groups: [{ id: 'a', label: 'Coca-Cola Company', members: [2, 3] }, { id: 'b', label: 'PepsiCo', members: [4] }, { id: 'c', label: 'Reliance', members: [1] }] })
    const filters = [{ variable: 'wave', codes: ['Apr-26'] }]
    const base = crosstab({ row: 'Q3', column: 'TOTAL', filters })
    const { rows } = buildGroupedRows({ rowVar: 'Q3', baseRows: base.rows, defs: [def], applied: apply([], 'c1'), cols: [], filters, weighted: true })
    const labels = rows.map((r) => `${r.kind}:${r.label}`)
    expect(labels).toEqual(['parent:Coca-Cola Company', 'member:Thums Up', 'member:Coca-Cola', 'parent:PepsiCo', 'member:Pepsi', 'parent:Reliance', 'member:Campa', 'unclassified:Unclassified', 'member:Sprite'])
    const un = rows.find((r) => r.kind === 'unclassified')!
    expect(un.cells.TOTAL!.rawValue).toBeCloseTo(11.5133, 3)
    const ccc = buildGroupedRows({ rowVar: 'Q3', baseRows: base.rows, defs: [{ ...def, groups: [{ id: 'a', label: 'Coca-Cola Company', members: [2, 3, 5] }, ...def.groups.slice(1)] }], applied: apply([], 'c1', false), cols: [], filters, weighted: true }).rows
    expect(ccc.find((r) => r.label === 'Coca-Cola Company')!.cells.TOTAL!.rawValue).toBeCloseTo(64.9003, 3)
    expect(ccc.every((r) => r.kind !== 'member')).toBe(true)
    expect(ccc.some((r) => r.kind === 'unclassified')).toBe(false)
  })

  it('nets are appended after the base rows, and ignored on other questions', () => {
    const d = net({ members: [2, 3] })
    const base = crosstab({ row: 'Q1', column: 'TOTAL' })
    const a = buildGroupedRows({ rowVar: 'Q1', baseRows: base.rows, defs: [d], applied: apply(['n1'], null), cols: [], filters: [], weighted: true }).rows
    expect(a.map((r) => r.kind)).toEqual(['base', 'base', 'base', 'base', 'base', 'net'])
    const other = crosstab({ row: 'AGE', column: 'TOTAL' })
    const b = buildGroupedRows({ rowVar: 'AGE', baseRows: other.rows, defs: [d], applied: apply(['n1'], null), cols: [], filters: [], weighted: true }).rows
    expect(b.every((r) => r.kind === 'base')).toBe(true)
  })

  it('validation catches bad definitions', () => {
    expect(validateDef(net({ name: ' ' }), [])).toContain('Give the grouping a name.')
    expect(validateDef(net({ members: [] }), [])).toContain('Choose at least one answer option.')
    expect(validateDef(net({ name: 'x', members: [1] }), [net({ id: 'other', name: 'X' })])[0]).toMatch(/already exists/)
    expect(validateDef(net({ variables: ['Q4'], kind: 'range', range: [4, 9] }), []).join(' ')).toMatch(/run from 1 to 5/)
    expect(validateDef(net({ variables: ['Q4'], kind: 'range', range: [5, 4] }), []).join(' ')).toMatch(/minimum is higher/)
    const dup = cls({ groups: [{ id: 'a', label: 'A', members: [1, 2] }, { id: 'b', label: 'B', members: [2] }] })
    expect(validateDef(dup, []).join(' ')).toMatch(/more than one group/)
    expect(validateDef(cls({ groups: [{ id: 'a', label: 'Unclassified', members: [1] }] }), []).join(' ')).toMatch(/reserved/)
    expect(validateDef(net({ name: 'ok', members: [1, 2] }), [])).toEqual([])
  })

  it('per-wave check reports bases and flags small or empty cells', () => {
    const ok = checkDefinition(net({ members: [2, 3] }))
    expect(ok.items[0]!.waves.map((w) => w.base)).toEqual([600, 620, 640])
    expect(ok.warnings).toEqual([])
    const small = checkDefinition(cls({ variables: ['Q3'], groups: [{ id: 'a', label: 'Everyone', members: [1, 2, 3, 4, 5] }] }))
    expect(small.warnings).toEqual([])
  })

  it('definitions are versioned on edit, and deleting clears applied state', () => {
    const saved = saveDef(net({ id: '', name: 'Cola', members: [2, 3] }))
    expect(saved.version).toBe(1)
    expect(getDefs().some((d) => d.id === saved.id)).toBe(true)
    const v2 = saveDef({ ...saved, members: [2, 3, 4] })
    expect(v2.version).toBe(2)
    expect(v2.history.map((h) => h.version)).toEqual([1, 2])
    setApplied({ nets: [saved.id] })
    deleteDef(saved.id)
    expect(getDefs().some((d) => d.id === saved.id)).toBe(false)
  })

  beforeEach(() => setApplied({ nets: [], classification: null, showMembers: true }))
})
