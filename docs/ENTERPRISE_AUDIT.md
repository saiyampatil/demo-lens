# Enterprise Foundation Audit

Audit of `src/` (excluding `*.test.ts`, `*.test.tsx`, and `src/domain/`).

## A. Hard-coded study content

| File | Line | Matching text |
|------|------|---------------|
| `src/engine/questions.ts` | 4-8 | `BRANDS = [{code:1,label:'Campa'},{code:2,label:'Thums Up'},{code:3,label:'Coca-Cola'},{code:4,label:'Pepsi'},{code:5,label:'Sprite'}]` |
| `src/pages/Home.tsx` | 13 | `const FOCUS = 'Campa'` |
| `src/pages/Home.tsx` | 14 | `const COMPARE = 'Coca-Cola'` |
| `src/pages/Home.tsx` | 336 | `BRANDS.map((b) => ...)` |
| `src/pages/Storyboards.tsx` | 53 | `const FOCUS = 'Campa'` |
| `src/pages/CrossTabs.tsx` | 30 | `const BRAND_FOCUS = 'Campa'` |
| `src/pages/CrossTabs.tsx` | 407 | `r.label === BRAND_FOCUS` |
| `src/pages/AskAI.tsx` | 442 | `const brand = mentioned[0] ?? 'Campa'` |
| `src/pages/AskAI.tsx` | 444 | `(brand === 'Coca-Cola' ? 'Thums Up' : 'Coca-Cola')` |
| `src/pages/Weights.tsx` | 108 | `rows.find((r) => r.label === 'Campa')` |
| `src/engine/groupings.ts` | 543 | `['Campa', 'Thums Up', 'Coca-Cola', 'Pepsi']` |
| `src/engine/groupings.ts` | 555-557 | `'Reliance Consumer Products'`, `'The Coca-Cola Company'`, `'PepsiCo'` |

## B. Hard-coded question IDs Q1–Q6 (count per file)

| File | Q1 | Q2 | Q3 | Q4 | Q5 | Q6 | Total |
|------|----|----|----|----|----|----|-------|
| `src/engine/crosstab.ts` | 1 | 1 | 1 | 1 | 1 | 1 | 6 |
| `src/engine/insights.ts` | 1 | 2 | 1 | 0 | 0 | 0 | 4 |
| `src/engine/uploads.ts` | 0 | 0 | 0 | 0 | 1 | 0 | 1 |
| `src/pages/AskAI.tsx` | 3 | 6 | 3 | 1 | 0 | 4 | 17 |
| `src/pages/CrossTabs.tsx` | 1 | 1 | 3 | 2 | 1 | 1 | 9 |
| `src/pages/Groupings.tsx` | 2 | 0 | 0 | 1 | 0 | 0 | 3 |
| `src/pages/Home.tsx` | 5 | 3 | 4 | 0 | 0 | 1 | 13 |
| `src/pages/Storyboards.tsx` | 1 | 0 | 2 | 0 | 1 | 2 | 6 |
| `src/pages/Waves.tsx` | 1 | 0 | 0 | 0 | 0 | 0 | 1 |
| `src/pages/Weights.tsx` | 1 | 1 | 1 | 0 | 0 | 1 | 4 |
## C. Browser storage

| File | Line | Key / Usage |
|------|------|-------------|
| `src/store/useLensStore.ts` | 58-59 | Zustand `persist` middleware, key `'lens-storage'`, `createJSONStorage(() => localStorage)` |
| `src/engine/groupings.ts` | 385 | `localStorage.getItem(key)` |
| `src/engine/groupings.ts` | 394 | `localStorage.setItem(key, value)` |
| `src/engine/uploads.ts` | 46 | `localStorage.getItem('lens-wave-uploads-v2')` |
| `src/engine/uploads.ts` | 57 | `localStorage.setItem('lens-wave-uploads-v2', ...)` |
| `src/pages/Home.tsx` | 66 | `localStorage.getItem('lens-storyboard-v1')` |
| `src/pages/Storyboards.tsx` | 95 | `localStorage.getItem(BOARD_KEY)` where `BOARD_KEY = 'lens-storyboard-v1'` |
| `src/pages/Storyboards.tsx` | 468 | `localStorage.setItem(BOARD_KEY, ...)` |

No `sessionStorage` found.

## D. Files reading the CSV or data map directly

| File | Line | Import |
|------|------|--------|
| `src/engine/data.ts` | 2 | `import rawCsv from '../../data/campa_tracker_data.csv?raw'` |
| `src/engine/uploads.ts` | 2 | `import rawCsv from '../../data/campa_tracker_data.csv?raw'` |
| `src/pages/Home.tsx` | 8 | `import rawCsv from '../../data/campa_tracker_data.csv?raw'` |
| `src/pages/Weights.tsx` | 7 | `import rawCsv from '../../data/campa_tracker_data.csv?raw'` |
| `src/pages/Waves.tsx` | 8 | `import datamapUrl from '../../data/campa_datamap.xlsx?url'` |
## E. Values computed at import time from data or study content

| File | Constant |
|------|----------|
| `src/engine/data.ts` | `respondents = parseData(rawCsv)` |
| `src/engine/insights.ts` | `latestWave = WAVES[WAVES.length - 1]` |
| `src/engine/insights.ts` | `previousWave = WAVES[WAVES.length - 2]` |
| `src/engine/questions.ts` | `WAVES = ['Oct-25', 'Jan-26', 'Apr-26'] as const` |
| `src/engine/uploads.ts` | `BASE_HEADER`, `BASE_BODY`, `BASE_CELLS`, `RULES` — all derived from `rawCsv` |

## F. Routes

**Route list in `src/App.tsx`** (all inside `<Route element={<AppShell />}>` except redirects):
- `/home` → Home
- `/waves` → Waves
- `/cross-tabs` → CrossTabs
- `/ask` → AskAI
- `/weights` → Weights
- `/storyboards` → Storyboards
- `/groupings` → Groupings
- `/` → Navigate to `/home`
- `*` → Navigate to `/home`

**Literal `navigate('...')` calls:**
- `src/pages/AskAI.tsx`: `/ask`, `/storyboards`
- `src/pages/CrossTabs.tsx`: `/groupings`, `/storyboards`
- `src/pages/Groupings.tsx`: `/cross-tabs`
- `src/pages/Home.tsx`: `/weights`, `/ask`, `/cross-tabs`, `/storyboards`
- `src/pages/Storyboards.tsx`: `/cross-tabs`
- `src/pages/Weights.tsx`: `/cross-tabs`

**NavLink** — `src/components/shell/Sidebar.tsx` (lines 69-82): `to={item.path}` for all sidebar items.

**Link** — `src/pages/EnterpriseHome.tsx` (line 43): `<Link to="/home">Open →</Link>`

## G. Page-name mapping for top bar breadcrumb

**File:** `src/components/shell/TopBar.tsx`, lines 3-10:

```ts
const pageTitles: Record<string, string> = {
  '/home': 'Home',
  '/waves': 'Waves',
  '/cross-tabs': 'Cross-tabs',
  '/ask': 'Ask AI',
  '/weights': 'Weights',
  '/storyboards': 'Storyboards',
}
```

Missing entries: `/groupings` and `/enterprise` are not mapped (fall back to `'Home'`).
## H. Actions needing a permission check later

| File | Line | Action |
|------|------|--------|
| `src/pages/Waves.tsx` | ~435 | Upload a wave (+ Add wave button, CSV upload) |
| `src/pages/Weights.tsx` | ~193 | Change weights/weighting |
| `src/pages/Groupings.tsx` | ~169 | Create/edit/delete groupings |
| `src/pages/AskAI.tsx` | 641 | Save to storyboard |
| `src/pages/CrossTabs.tsx` | 640 | Save to storyboard |
| `src/pages/Home.tsx` | 547 | Save to storyboard (nudge) |
| `src/pages/Storyboards.tsx` | 545 | Edit storyboards (navigate to Cross-tabs with saved view) |
| `src/pages/Storyboards.tsx` | 762 | Export to PowerPoint (notes placeholder) |
| `src/pages/CrossTabs.tsx` | 636-637 | Export CSV |

## Risks

- Every page hard-codes `FOCUS = 'Campa'` and/or `BRANDS`, so a second study or brand cannot run alongside Campa without rewriting every page that references them.
- Q1–Q6 question IDs are embedded directly in `crosstab()` calls across `Home`, `AskAI`, `CrossTabs`, `Weights`, `Storyboards`, `Waves`, and `useLensStore`; a new study with different question IDs would break these pages.
- `respondents` in `data.ts` is computed at import time from `campa_tracker_data.csv`; there is no mechanism to load a different study's CSV.
- `latestWave` and `previousWave` are computed once at import time from `WAVES`; they are not scoped to a workspace or study.
- All localStorage keys (`lens-storage`, `lens-wave-uploads-v2`, `lens-storyboard-v1`) are unscoped, so a second brand/study would collide with Campa's persisted data.
- `BRAND_FOCUS` in `CrossTabs.tsx` controls focus-brand highlighting and is not configurable per brand.
- The breadcrumb mapping in `TopBar.tsx` lacks `/groupings` and `/enterprise`, which would show as `'Home'`.
- No permission checks exist on any page action today; `src/domain/permissions.ts` defines rules but nothing enforces them.
| `src/store/useLensStore.ts` | 1 | 0 | 0 | 0 | 0 | 0 | 1 |