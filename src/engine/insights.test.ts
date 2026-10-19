import { describe, it, expect } from 'vitest'
import { crosstab } from './crosstab'
import { significantChanges, funnel, latestWave, previousWave } from './insights'

describe('Insights', () => {
  it('derives latest and previous wave from questions.ts', () => {
    expect(latestWave).toBe('Apr-26')
    expect(previousWave).toBe('Jan-26')
  })

  it('significantChanges(Apr-26, Jan-26) returns exactly 3 items', () => {
    const changes = significantChanges('Apr-26', 'Jan-26')
    expect(changes).toHaveLength(3)

    expect(changes[0]).toMatchObject({
      brand: 'Campa',
      questionId: 'Q2',
      change: 12,
      direction: 1,
    })
    expect(changes[0].previous).toBe(34)
    expect(changes[0].current).toBe(47)

    expect(changes[1]).toMatchObject({
      brand: 'Campa',
      questionId: 'Q1',
      change: 11,
      direction: 1,
    })
    expect(changes[1].previous).toBe(66)
    expect(changes[1].current).toBe(77)

    expect(changes[2]).toMatchObject({
      brand: 'Pepsi',
      questionId: 'Q3',
      change: 4,
      direction: 1,
    })
    expect(changes[2].previous).toBe(17)
    expect(changes[2].current).toBe(22)
  })

  it('Campa main-brand change Jan-26 → Apr-26 is +2 and NOT significant', () => {
    const changes = significantChanges('Apr-26', 'Jan-26')
    const campaMain = changes.find((c) => c.questionId === 'Q3' && c.brand === 'Campa')
    expect(campaMain).toBeUndefined()

    const q3Result = crosstab({ row: 'Q3', column: 'WAVE' })
    const campaRow = q3Result.rows.find((r) => r.label === 'Campa')!
    const janCell = campaRow.cells['Jan-26']
    const aprCell = campaRow.cells['Apr-26']
    expect(Math.round(aprCell!.rawValue - janCell!.rawValue)).toBe(2)
    expect(aprCell!.significance).toBe(0)
  })

  it('funnel(Campa, Apr-26): 77 / 47 / 14, ratios 61% and 29%', () => {
    const f = funnel('Campa', 'Apr-26')
    expect(f.awareness).toBe(77)
    expect(f.trial).toBe(47)
    expect(f.main).toBe(14)
    expect(Math.round(f.trialToAwarenessRatio * 100)).toBe(61)
    expect(Math.round(f.mainToTrialRatio * 100)).toBe(29)
  })

  it('funnel(Coca-Cola, Apr-26): 96 / 77 / 28', () => {
    const f = funnel('Coca-Cola', 'Apr-26')
    expect(f.awareness).toBe(96)
    expect(f.trial).toBe(77)
    expect(f.main).toBe(28)
  })
})