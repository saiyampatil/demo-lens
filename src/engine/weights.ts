import type { Respondent } from './data'

export interface WeightDiagnostics {
  effectiveBase: number
  efficiency: number
  minWeight: number
  maxWeight: number
  respondentCount: number
  sumWeight: number
}

/**
 * Calculates weight diagnostics for a given set of respondents.
 * effective base = (sum of wt)² / (sum of wt²)
 * efficiency = effective base / number of respondents
 */
export function calculateWeightDiagnostics(data: readonly Respondent[]): WeightDiagnostics {
  const respondentCount = data.length
  if (respondentCount === 0) {
    return {
      effectiveBase: 0,
      efficiency: 0,
      minWeight: 0,
      maxWeight: 0,
      respondentCount: 0,
      sumWeight: 0,
    }
  }

  let sumWt = 0
  let sumWtSq = 0
  let minWeight = Infinity
  let maxWeight = -Infinity

  for (const r of data) {
    const w = r.wt
    sumWt += w
    sumWtSq += w * w
    if (w < minWeight) minWeight = w
    if (w > maxWeight) maxWeight = w
  }

  const effectiveBase = sumWtSq > 0 ? (sumWt * sumWt) / sumWtSq : 0
  const efficiency = respondentCount > 0 ? (effectiveBase / respondentCount) * 100 : 0

  return {
    effectiveBase,
    efficiency,
    minWeight,
    maxWeight,
    respondentCount,
    sumWeight: sumWt,
  }
}
