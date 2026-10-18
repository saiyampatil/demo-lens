import { describe, it, expect } from 'vitest'
import { crosstab } from './crosstab'
import { respondents } from './data'
import { calculateWeightDiagnostics } from './weights'

describe('Analysis Engine', () => {
  it('computes unweighted bases by wave: 600, 620, 640; total 1,860', () => {
    const res = crosstab({ row: 'Q1', column: 'WAVE' })
    const campaRow = res.rows.find((r) => r.label === 'Campa')!

    expect(campaRow.cells['Oct-25'].unweightedBase).toBe(600)
    expect(campaRow.cells['Jan-26'].unweightedBase).toBe(620)
    expect(campaRow.cells['Apr-26'].unweightedBase).toBe(640)
    expect(campaRow.cells['TOTAL'].unweightedBase).toBe(1860)
  })

  it('computes Q1 Campa awareness by Wave: Oct-25 58, Jan-26 66, Apr-26 77; Total 67', () => {
    const res = crosstab({ row: 'Q1', column: 'WAVE' })
    const campaRow = res.rows.find((r) => r.label === 'Campa')!

    expect(campaRow.cells['Oct-25'].value).toBe(58)
    expect(campaRow.cells['Jan-26'].value).toBe(66)
    expect(campaRow.cells['Apr-26'].value).toBe(77)
    expect(campaRow.cells['TOTAL'].value).toBe(67)
  })

  it('computes Q1 Campa significance: Jan-26 +1, Apr-26 +1', () => {
    const res = crosstab({ row: 'Q1', column: 'WAVE' })
    const campaRow = res.rows.find((r) => r.label === 'Campa')!

    expect(campaRow.cells['Oct-25'].significance).toBe(0)
    expect(campaRow.cells['Jan-26'].significance).toBe(1)
    expect(campaRow.cells['Apr-26'].significance).toBe(1)
  })

  it('computes Q1 Pepsi by Wave: Oct-25 92, Jan-26 88 (significance -1), Apr-26 91', () => {
    const res = crosstab({ row: 'Q1', column: 'WAVE' })
    const pepsiRow = res.rows.find((r) => r.label === 'Pepsi')!

    expect(pepsiRow.cells['Oct-25'].value).toBe(92)
    expect(pepsiRow.cells['Jan-26'].value).toBe(88)
    expect(pepsiRow.cells['Jan-26'].significance).toBe(-1)
    expect(pepsiRow.cells['Apr-26'].value).toBe(91)
    expect(pepsiRow.cells['Apr-26'].significance).toBe(0)
  })

  it('computes Q2 Campa trial by Wave: 26, 34, 47', () => {
    const res = crosstab({ row: 'Q2', column: 'WAVE' })
    const campaRow = res.rows.find((r) => r.label === 'Campa')!

    expect(campaRow.cells['Oct-25'].value).toBe(26)
    expect(campaRow.cells['Jan-26'].value).toBe(34)
    expect(campaRow.cells['Apr-26'].value).toBe(47)
  })

  it('computes Q3 Main brand = Campa by Wave: 9, 11, 14', () => {
    const res = crosstab({ row: 'Q3', column: 'WAVE' })
    const campaRow = res.rows.find((r) => r.label === 'Campa')!

    expect(campaRow.cells['Oct-25'].value).toBe(9)
    expect(campaRow.cells['Jan-26'].value).toBe(11)
    expect(campaRow.cells['Apr-26'].value).toBe(14)
  })

  it('computes Q3 Apr-26 brand distribution: Coca-Cola 28, Thums Up 26, Pepsi 22, Campa 14, Sprite 12', () => {
    const res = crosstab({
      row: 'Q3',
      column: 'TOTAL',
      filters: [{ variable: 'wave', codes: ['Apr-26'] }],
    })

    const cocaCola = res.rows.find((r) => r.label === 'Coca-Cola')!.cells['TOTAL'].value
    const thumsUp = res.rows.find((r) => r.label === 'Thums Up')!.cells['TOTAL'].value
    const pepsi = res.rows.find((r) => r.label === 'Pepsi')!.cells['TOTAL'].value
    const campa = res.rows.find((r) => r.label === 'Campa')!.cells['TOTAL'].value
    const sprite = res.rows.find((r) => r.label === 'Sprite')!.cells['TOTAL'].value

    expect(cocaCola).toBe(28)
    expect(thumsUp).toBe(26)
    expect(pepsi).toBe(22)
    expect(campa).toBe(14)
    expect(sprite).toBe(12)
  })

  it('computes Q1 Campa, Apr-26 by Age group: 80, 77, 73, 78; unweighted bases 171, 221, 157, 91', () => {
    const res = crosstab({
      row: 'Q1',
      column: 'AGE',
      filters: [{ variable: 'wave', codes: ['Apr-26'] }],
    })
    const campaRow = res.rows.find((r) => r.label === 'Campa')!

    // Age groups: 1 (18-24), 2 (25-34), 3 (35-44), 4 (45+)
    expect(campaRow.cells['1'].value).toBe(80)
    expect(campaRow.cells['1'].unweightedBase).toBe(171)

    expect(campaRow.cells['2'].value).toBe(77)
    expect(campaRow.cells['2'].unweightedBase).toBe(221)

    expect(campaRow.cells['3'].value).toBe(73)
    expect(campaRow.cells['3'].unweightedBase).toBe(157)

    expect(campaRow.cells['4'].value).toBe(78)
    expect(campaRow.cells['4'].unweightedBase).toBe(91)
  })

  it('computes Q5 mean by Wave: 5.5, 5.4, 5.8', () => {
    const res = crosstab({ row: 'Q5', column: 'WAVE' })
    const meanRow = res.rows[0]

    expect(meanRow.cells['Oct-25'].value).toBe(5.5)
    expect(meanRow.cells['Jan-26'].value).toBe(5.4)
    expect(meanRow.cells['Apr-26'].value).toBe(5.8)
  })

  it('computes Q6 mean, filter wave = Apr-26 and Q3 = 1 (Campa): 7.8, unweighted base 86', () => {
    const res = crosstab({
      row: 'Q6',
      column: 'TOTAL',
      filters: [
        { variable: 'wave', codes: ['Apr-26'] },
        { variable: 'Q3', codes: [1] },
      ],
    })
    const meanRow = res.rows[0]

    expect(meanRow.cells['TOTAL'].value).toBe(7.8)
    expect(meanRow.cells['TOTAL'].unweightedBase).toBe(86)
  })

  it('computes weight diagnostics, all rows: effective base 1,818, efficiency 98%, min 0.79, max 1.54', () => {
    const diag = calculateWeightDiagnostics(respondents)

    expect(Math.round(diag.effectiveBase)).toBe(1818)
    expect(Math.round(diag.efficiency)).toBe(98)
    expect(Number(diag.minWeight.toFixed(2))).toBe(0.79)
    expect(Number(diag.maxWeight.toFixed(2))).toBe(1.54)
  })
})
