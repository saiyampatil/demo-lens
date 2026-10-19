import { crosstab } from './crosstab'
import { QUESTIONS, WAVES, BRANDS } from './questions'

export const latestWave: string = WAVES[WAVES.length - 1]
export const previousWave: string = WAVES[WAVES.length - 2]

export interface SignificantChange {
  questionId: string
  questionLabel: string
  brand: string
  brandCode: number
  current: number
  previous: number
  change: number
  direction: 1 | -1
}

export function significantChanges(current: string, previous: string): SignificantChange[] {
  const items: SignificantChange[] = []

  for (const questionId of ['Q1', 'Q2', 'Q3']) {
    const result = crosstab({
      row: questionId,
      column: 'WAVE',
    })

    for (const brand of BRANDS) {
      const row = result.rows.find((r) => r.label === brand.label)
      if (!row) continue

      const currentCell = row.cells[current]
      const previousCell = row.cells[previous]

      if (!currentCell || !previousCell) continue
      if (currentCell.significance === 0) continue

      const change = Math.round(currentCell.rawValue - previousCell.rawValue)
      const direction = currentCell.significance

      items.push({
        questionId,
        questionLabel: QUESTIONS[questionId]!.label,
        brand: brand.label,
        brandCode: brand.code,
        current: Math.round(currentCell.rawValue),
        previous: Math.round(previousCell.rawValue),
        change,
        direction,
      })
    }
  }

  items.sort((a, b) => Math.abs(b.change) - Math.abs(a.change))
  return items
}

export interface FunnelResult {
  awareness: number
  trial: number
  main: number
  trialToAwarenessRatio: number
  mainToTrialRatio: number
}

export function funnel(brand: string, wave: string): FunnelResult {
  const awarenessResult = crosstab({ row: 'Q1', column: 'WAVE' })
  const trialResult = crosstab({ row: 'Q2', column: 'WAVE' })
  const mainResult = crosstab({ row: 'Q3', column: 'WAVE' })

  const awarenessRow = awarenessResult.rows.find((r) => r.label === brand)!
  const trialRow = trialResult.rows.find((r) => r.label === brand)!
  const mainRow = mainResult.rows.find((r) => r.label === brand)!

  const awarenessCell = awarenessRow.cells[wave]
  const trialCell = trialRow.cells[wave]
  const mainCell = mainRow.cells[wave]

  const awareness = Math.round(awarenessCell!.rawValue)
  const trial = Math.round(trialCell!.rawValue)
  const main = Math.round(mainCell!.rawValue)

  return {
    awareness,
    trial,
    main,
    trialToAwarenessRatio: trialCell!.rawValue / awarenessCell!.rawValue,
    mainToTrialRatio: mainCell!.rawValue / trialCell!.rawValue,
  }
}