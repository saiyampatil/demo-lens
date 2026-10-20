import { uploadedWaveNames } from './uploads'

export const BRANDS = [
  { code: 1, label: 'Campa' },
  { code: 2, label: 'Thums Up' },
  { code: 3, label: 'Coca-Cola' },
  { code: 4, label: 'Pepsi' },
  { code: 5, label: 'Sprite' },
] as const

const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
]

function waveRank(label: string): number | null {
  const m = /^([A-Za-z]{3})-(\d{2})$/.exec(label)
  if (!m) return null
  const mi = MONTHS.indexOf(m[1])
  if (mi < 0) return null
  return Number(m[2]) * 12 + mi
}

export type BrandCode = (typeof BRANDS)[number]['code']
export type BrandName = (typeof BRANDS)[number]['label']

const BUNDLED_WAVES: string[] = ['Oct-25', 'Jan-26', 'Apr-26']

export const WAVES: readonly string[] = (() => {
  const uploaded = uploadedWaveNames().filter((w) => !BUNDLED_WAVES.includes(w))
  const dated = uploaded.filter((w) => waveRank(w) !== null)
  const undated = uploaded.filter((w) => waveRank(w) === null)
  dated.sort((a, b) => (waveRank(a)! - waveRank(b)!))
  return [...BUNDLED_WAVES, ...dated, ...undated]
})()

export type Wave = string

export interface Option {
  code: number
  label: string
}

export type QuestionType = 'single' | 'multi' | 'numeric' | 'scale' | 'grid'

export interface QuestionDef {
  id: string
  label: string
  type: QuestionType
  category: 'Profile' | 'Brand funnel' | 'Consumption' | 'Attitudes' | 'Advocacy'
  wording?: string
  options?: readonly Option[]
  gridStatements?: readonly { id: string; label: string }[]
  columns?: readonly string[]
  missingCode?: number
}

export const QUESTIONS: Record<string, QuestionDef> = {
  AGE: {
    id: 'AGE',
    label: 'Age group',
    type: 'single',
    category: 'Profile',
    options: [
      { code: 1, label: '18-24' },
      { code: 2, label: '25-34' },
      { code: 3, label: '35-44' },
      { code: 4, label: '45+' },
    ],
  },
  GENDER: {
    id: 'GENDER',
    label: 'Gender',
    type: 'single',
    category: 'Profile',
    options: [
      { code: 1, label: 'Male' },
      { code: 2, label: 'Female' },
    ],
  },
  CITY: {
    id: 'CITY',
    label: 'City type',
    type: 'single',
    category: 'Profile',
    options: [
      { code: 1, label: 'Metro' },
      { code: 2, label: 'Tier 1' },
      { code: 3, label: 'Tier 2' },
    ],
  },
  SEC: {
    id: 'SEC',
    label: 'Socio-economic class',
    type: 'single',
    category: 'Profile',
    options: [
      { code: 1, label: 'SEC A' },
      { code: 2, label: 'SEC B' },
      { code: 3, label: 'SEC C' },
    ],
  },
  Q1: {
    id: 'Q1',
    label: 'Brand awareness',
    type: 'multi',
    category: 'Brand funnel',
    wording: 'Which of these soft-drink brands have you heard of?',
    columns: ['Q1_1', 'Q1_2', 'Q1_3', 'Q1_4', 'Q1_5'],
    options: BRANDS.map((b) => ({ code: b.code, label: b.label })),
  },
  Q2: {
    id: 'Q2',
    label: 'Brand trial, past 3 months',
    type: 'multi',
    category: 'Brand funnel',
    columns: ['Q2_1', 'Q2_2', 'Q2_3', 'Q2_4', 'Q2_5'],
    options: BRANDS.map((b) => ({ code: b.code, label: b.label })),
  },
  Q3: {
    id: 'Q3',
    label: 'Main brand',
    type: 'single',
    category: 'Brand funnel',
    options: BRANDS.map((b) => ({ code: b.code, label: b.label })),
  },
  Q4: {
    id: 'Q4',
    label: 'Brand attitudes',
    type: 'grid',
    category: 'Attitudes',
    gridStatements: [
      { id: 'Q4_1', label: 'Good value for money' },
      { id: 'Q4_2', label: 'A brand for people like me' },
      { id: 'Q4_3', label: 'A taste I enjoy' },
    ],
  },
  Q5: {
    id: 'Q5',
    label: 'Servings per week',
    type: 'numeric',
    category: 'Consumption',
    missingCode: 99,
  },
  Q6: {
    id: 'Q6',
    label: 'Likelihood to recommend',
    type: 'scale',
    category: 'Advocacy',
  },
} as const
