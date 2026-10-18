import Papa from 'papaparse'
import rawCsv from '../../data/campa_tracker_data.csv?raw'

export interface Respondent {
  resp_id: number
  wave: string
  wt: number
  AGE: number
  GENDER: number
  CITY: number
  SEC: number
  Q1_1: number
  Q1_2: number
  Q1_3: number
  Q1_4: number
  Q1_5: number
  Q2_1: number
  Q2_2: number
  Q2_3: number
  Q2_4: number
  Q2_5: number
  Q3: number | null
  Q4_1: number | null
  Q4_2: number | null
  Q4_3: number | null
  Q5: number | null
  Q6: number | null
  [key: string]: string | number | null
}

function parseCell(val: unknown): number | null {
  if (val === null || val === undefined) return null
  const str = String(val).trim()
  if (str === '') return null
  const num = Number(str)
  return isNaN(num) ? null : num
}

export function parseData(csv: string = rawCsv): Respondent[] {
  const result = Papa.parse<Record<string, string>>(csv, {
    header: true,
    skipEmptyLines: true,
  })

  return result.data.map((row) => ({
    resp_id: Number(row.resp_id),
    wave: (row.wave || '').trim(),
    wt: Number(row.wt),
    AGE: Number(row.AGE),
    GENDER: Number(row.GENDER),
    CITY: Number(row.CITY),
    SEC: Number(row.SEC),
    Q1_1: Number(row.Q1_1),
    Q1_2: Number(row.Q1_2),
    Q1_3: Number(row.Q1_3),
    Q1_4: Number(row.Q1_4),
    Q1_5: Number(row.Q1_5),
    Q2_1: Number(row.Q2_1),
    Q2_2: Number(row.Q2_2),
    Q2_3: Number(row.Q2_3),
    Q2_4: Number(row.Q2_4),
    Q2_5: Number(row.Q2_5),
    Q3: parseCell(row.Q3),
    Q4_1: parseCell(row.Q4_1),
    Q4_2: parseCell(row.Q4_2),
    Q4_3: parseCell(row.Q4_3),
    Q5: parseCell(row.Q5),
    Q6: parseCell(row.Q6),
  }))
}

export const respondents: Respondent[] = parseData(rawCsv)
