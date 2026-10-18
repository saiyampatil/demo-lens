import { type Respondent, respondents as defaultData } from './data'
import { QUESTIONS, WAVES, BRANDS } from './questions'
import { twoProportionZTest } from './stats'

export interface Filter {
  variable: string
  codes: (number | string)[]
}

export interface CrosstabOptions {
  row: string
  column: 'TOTAL' | 'WAVE' | string
  filters?: Filter[]
  weighted?: boolean
  data?: readonly Respondent[]
}

export interface CellResult {
  value: number
  rawValue: number
  unweightedBase: number
  weightedBase: number
  hidden: boolean
  significance: -1 | 0 | 1
}

export interface CrosstabColumn {
  id: string
  label: string
}

export interface CrosstabRow {
  id: string | number
  label: string
  cells: Record<string, CellResult>
}

export interface CrosstabResult {
  rowId: string
  columnId: string
  columns: CrosstabColumn[]
  rows: CrosstabRow[]
  getCell: (rowId: string | number, columnId: string) => CellResult | undefined
}

function matchesFilters(r: Respondent, filters?: Filter[]): boolean {
  if (!filters || filters.length === 0) return true
  for (const f of filters) {
    const val = r[f.variable]
    if (val === null || val === undefined) return false
    const match = f.codes.some((code) => String(code) === String(val))
    if (!match) return false
  }
  return true
}

export function crosstab(options: CrosstabOptions): CrosstabResult {
  const {
    row: rowId,
    column: colId,
    filters = [],
    weighted = true,
    data = defaultData,
  } = options

  // 1. Filter overall respondent base
  const filteredData = data.filter((r) => matchesFilters(r, filters))

  // 2. Define Columns
  let columns: CrosstabColumn[] = []
  if (colId === 'TOTAL') {
    columns = [{ id: 'TOTAL', label: 'Total' }]
  } else if (colId === 'WAVE') {
    columns = [
      ...WAVES.map((w) => ({ id: w, label: w })),
      { id: 'TOTAL', label: 'Total' },
    ]
  } else {
    // Column is a profile question, e.g. AGE, GENDER, CITY, SEC
    const colQ = QUESTIONS[colId]
    if (colQ && colQ.options) {
      columns = [
        ...colQ.options.map((opt) => ({
          id: String(opt.code),
          label: opt.label,
        })),
        { id: 'TOTAL', label: 'Total' },
      ]
    } else {
      columns = [{ id: 'TOTAL', label: 'Total' }]
    }
  }

  // 3. Define Rows based on question definition
  interface RowDef {
    id: string | number
    label: string
    isMean: boolean
    calculate: (
      subRespondents: readonly Respondent[],
      isWeighted: boolean
    ) => { value: number; rawValue: number; unweightedBase: number; weightedBase: number }
  }

  const rowDefs: RowDef[] = []
  const question = QUESTIONS[rowId]

  if (rowId === 'Q1' || rowId === 'Q2') {
    // Multi-response question: one row per brand
    BRANDS.forEach((brand, idx) => {
      const colName = `${rowId}_${idx + 1}`
      rowDefs.push({
        id: brand.code,
        label: brand.label,
        isMean: false,
        calculate: (sub, isWeighted) => {
          // Base: all respondents in the column
          const unweightedBase = sub.length
          let weightedBase = 0
          let positiveWt = 0
          let positiveCount = 0

          for (const r of sub) {
            const w = isWeighted ? r.wt : 1
            weightedBase += w
            if (r[colName] === 1) {
              positiveWt += w
              positiveCount++
            }
          }

          const rawPct = weightedBase > 0 ? (positiveWt / weightedBase) * 100 : 0
          return {
            value: Math.round(rawPct),
            rawValue: rawPct,
            unweightedBase,
            weightedBase,
          }
        },
      })
    })
  } else if (rowId === 'Q3') {
    // Single-response: Main brand (one row per brand, codes 1-5)
    BRANDS.forEach((brand) => {
      rowDefs.push({
        id: brand.code,
        label: brand.label,
        isMean: false,
        calculate: (sub, isWeighted) => {
          // Base: respondents with non-blank Q3
          const validRespondents = sub.filter((r) => r.Q3 !== null)
          const unweightedBase = validRespondents.length
          let weightedBase = 0
          let positiveWt = 0

          for (const r of validRespondents) {
            const w = isWeighted ? r.wt : 1
            weightedBase += w
            if (r.Q3 === brand.code) {
              positiveWt += w
            }
          }

          const rawPct = weightedBase > 0 ? (positiveWt / weightedBase) * 100 : 0
          return {
            value: Math.round(rawPct),
            rawValue: rawPct,
            unweightedBase,
            weightedBase,
          }
        },
      })
    })
  } else if (rowId === 'Q4') {
    // Grid: Brand attitudes (one mean row per statement)
    const statements = question?.gridStatements || [
      { id: 'Q4_1', label: 'Good value for money' },
      { id: 'Q4_2', label: 'A brand for people like me' },
      { id: 'Q4_3', label: 'A taste I enjoy' },
    ]

    statements.forEach((stmt) => {
      rowDefs.push({
        id: stmt.id,
        label: stmt.label,
        isMean: true,
        calculate: (sub, isWeighted) => {
          // Base: respondents with non-blank value for this statement
          const validRespondents = sub.filter((r) => r[stmt.id] !== null)
          const unweightedBase = validRespondents.length
          let weightedBase = 0
          let sumWeightedVal = 0

          for (const r of validRespondents) {
            const w = isWeighted ? r.wt : 1
            const val = r[stmt.id] as number
            weightedBase += w
            sumWeightedVal += w * val
          }

          const rawMean = weightedBase > 0 ? sumWeightedVal / weightedBase : 0
          return {
            value: Math.round(rawMean * 10) / 10,
            rawValue: rawMean,
            unweightedBase,
            weightedBase,
          }
        },
      })
    })
  } else if (rowId === 'Q5') {
    // Numeric: Servings per week (one mean row, 99 excluded)
    rowDefs.push({
      id: 'mean',
      label: question?.label || 'Servings per week',
      isMean: true,
      calculate: (sub, isWeighted) => {
        // Base: respondents whose value is not 99 and not null
        const validRespondents = sub.filter(
          (r) => r.Q5 !== null && r.Q5 !== 99
        )
        const unweightedBase = validRespondents.length
        let weightedBase = 0
        let sumWeightedVal = 0

        for (const r of validRespondents) {
          const w = isWeighted ? r.wt : 1
          const val = r.Q5 as number
          weightedBase += w
          sumWeightedVal += w * val
        }

        const rawMean = weightedBase > 0 ? sumWeightedVal / weightedBase : 0
        return {
          value: Math.round(rawMean * 10) / 10,
          rawValue: rawMean,
          unweightedBase,
          weightedBase,
        }
      },
    })
  } else if (rowId === 'Q6') {
    // Scale: Likelihood to recommend (one mean row)
    rowDefs.push({
      id: 'mean',
      label: question?.label || 'Likelihood to recommend',
      isMean: true,
      calculate: (sub, isWeighted) => {
        // Base: respondents with non-blank value
        const validRespondents = sub.filter((r) => r.Q6 !== null)
        const unweightedBase = validRespondents.length
        let weightedBase = 0
        let sumWeightedVal = 0

        for (const r of validRespondents) {
          const w = isWeighted ? r.wt : 1
          const val = r.Q6 as number
          weightedBase += w
          sumWeightedVal += w * val
        }

        const rawMean = weightedBase > 0 ? sumWeightedVal / weightedBase : 0
        return {
          value: Math.round(rawMean * 10) / 10,
          rawValue: rawMean,
          unweightedBase,
          weightedBase,
        }
      },
    })
  } else if (question && question.type === 'single' && question.options) {
    // Single profile question as row (e.g. AGE, GENDER, CITY, SEC)
    question.options.forEach((opt) => {
      rowDefs.push({
        id: opt.code,
        label: opt.label,
        isMean: false,
        calculate: (sub, isWeighted) => {
          const validRespondents = sub.filter((r) => r[rowId] !== null)
          const unweightedBase = validRespondents.length
          let weightedBase = 0
          let positiveWt = 0

          for (const r of validRespondents) {
            const w = isWeighted ? r.wt : 1
            weightedBase += w
            if (r[rowId] === opt.code) {
              positiveWt += w
            }
          }

          const rawPct = weightedBase > 0 ? (positiveWt / weightedBase) * 100 : 0
          return {
            value: Math.round(rawPct),
            rawValue: rawPct,
            unweightedBase,
            weightedBase,
          }
        },
      })
    })
  }

  // 4. Compute cells for each row and column
  const rows: CrosstabRow[] = rowDefs.map((rowDef) => {
    const cells: Record<string, CellResult> = {}

    // First pass: compute values and bases for all columns
    for (const col of columns) {
      let subRespondents: Respondent[] = []
      if (col.id === 'TOTAL') {
        subRespondents = filteredData
      } else if (colId === 'WAVE') {
        subRespondents = filteredData.filter((r) => r.wave === col.id)
      } else {
        // Profile variable
        subRespondents = filteredData.filter(
          (r) => String(r[colId]) === col.id
        )
      }

      const { value, rawValue, unweightedBase, weightedBase } = rowDef.calculate(
        subRespondents,
        weighted
      )

      cells[col.id] = {
        value,
        rawValue,
        unweightedBase,
        weightedBase,
        hidden: unweightedBase < 30,
        significance: 0,
      }
    }

    // Second pass: compute significance testing
    // Only percentages are tested; means are not tested in this phase
    if (!rowDef.isMean) {
      if (colId === 'WAVE') {
        // Compare each wave with the previous wave (first wave has no test)
        // WAVE columns: Oct-25 (0), Jan-26 (1), Apr-26 (2)
        for (let i = 1; i < WAVES.length; i++) {
          const currWave = WAVES[i]
          const prevWave = WAVES[i - 1]
          const currCell = cells[currWave]
          const prevCell = cells[prevWave]

          if (currCell && prevCell) {
            const p1 = currCell.rawValue / 100
            const n1 = currCell.unweightedBase
            const p2 = prevCell.rawValue / 100
            const n2 = prevCell.unweightedBase

            currCell.significance = twoProportionZTest(p1, n1, p2, n2)
          }
        }
      } else {
        // Non-wave columns compare each column with TOTAL
        const totalCell = cells['TOTAL']
        if (totalCell) {
          const p2 = totalCell.rawValue / 100
          const n2 = totalCell.unweightedBase

          for (const col of columns) {
            if (col.id !== 'TOTAL') {
              const cell = cells[col.id]
              if (cell) {
                const p1 = cell.rawValue / 100
                const n1 = cell.unweightedBase
                cell.significance = twoProportionZTest(p1, n1, p2, n2)
              }
            }
          }
        }
      }
    }

    return {
      id: rowDef.id,
      label: rowDef.label,
      cells,
    }
  })

  return {
    rowId,
    columnId: colId,
    columns,
    rows,
    getCell: (rId: string | number, cId: string) => {
      const foundRow = rows.find((r) => String(r.id) === String(rId))
      return foundRow?.cells[cId]
    },
  }
}
