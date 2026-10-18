# Progress Log: Phase 1 (Foundation)

## 1. Environment Versions
- **Node.js**: v24.8.0 ($\ge 20$)
- **npm**: 11.6.0
- **Operating System**: macOS (Darwin 24.3.0)
- **Vite**: 8.3.4
- **TypeScript**: 6.0.2

## 2. Packages Installed
- **Framework & Routing**:
  - `react`: ^19.2.8
  - `react-dom`: ^19.2.8
  - `react-router-dom`: ^7.18.4
  - `zustand`: ^5.0.15
- **Data & Computation**:
  - `papaparse`: ^5.7.0
  - `@types/papaparse`: ^5.5.2
- **Styling & UI**:
  - `tailwindcss`: ^4.3.3
  - `@tailwindcss/vite`: ^4.3.3
  - `tw-animate-css`: ^1.4.0
  - `shadcn`: ^4.22.0
  - `@base-ui/react`: ^1.9.0
  - `class-variance-authority`: ^0.7.1
  - `clsx`: ^2.1.1
  - `tailwind-merge`: ^3.7.0
  - `lucide-react`: ^1.59.0
  - `recharts`: ^3.10.1
- **Local Fonts (No CDN)**:
  - `@fontsource/inter`: ^5.3.0 (weights 400, 500, 600, 700)
  - `@fontsource/inter-tight`: ^5.3.0 (weights 500, 600)
  - `@fontsource/ibm-plex-mono`: ^5.3.0 (weights 400, 500)
- **Testing & Verification**:
  - `vitest`: ^5.0.5
  - `puppeteer-core`: ^24.40.0 (used with local Chrome for headless browser testing)

## 3. Folder Structure
```text
Lens/
├── .gitignore
├── .oxlintrc.json
├── PRODUCT_SPEC.md
├── README.md
├── components.json
├── data/
│   ├── campa_datamap.xlsx
│   └── campa_tracker_data.csv
├── docs/
│   └── PROGRESS.md
├── index.html
├── package.json
├── public/
├── reference/
│   ├── pulse_ai_lens_ask_ai_research_analyst/
│   ├── pulse_ai_lens_cross_tabs_master_shell/
│   ├── pulse_ai_lens_cross_tabs_workspace_table_chart/
│   └── pulse_ai_lens_waves/
├── src/
│   ├── App.tsx
│   ├── components/
│   │   ├── shell/
│   │   │   ├── AppShell.tsx
│   │   │   ├── Sidebar.tsx
│   │   │   └── TopBar.tsx
│   │   └── ui/
│   │       └── button.tsx
│   ├── engine/
│   │   ├── crosstab.ts
│   │   ├── data.ts
│   │   ├── engine.test.ts
│   │   ├── questions.ts
│   │   ├── stats.ts
│   │   └── weights.ts
│   ├── index.css
│   ├── lib/
│   │   └── utils.ts
│   ├── main.tsx
│   ├── pages/
│   │   ├── AskAI.tsx
│   │   ├── CrossTabs.tsx
│   │   ├── Home.tsx
│   │   ├── Storyboards.tsx
│   │   ├── Waves.tsx
│   │   └── Weights.tsx
│   └── store/
│       └── .gitkeep
├── tsconfig.app.json
├── tsconfig.json
├── tsconfig.node.json
└── vite.config.ts
```

## 4. Commands to Run App and Tests
- **Development Server**: `npm run dev`
- **Unit & Engine Tests**: `npm test` (runs `vitest run`)
- **Type Checking**: `npm run typecheck` (runs `tsc -b`)
- **Production Build**: `npm run build` (runs `tsc -b && vite build`)

## 5. What Phase 1 Delivered
- **File Safety**: Existing files (`data/`, `reference/`, `PRODUCT_SPEC.md`) were verified and committed cleanly into Git (`Initial: spec and data`).
- **Scaffolding & Clean Cleanup**: Scaffolded using `create-vite` in a temporary directory outside `Lens/`, merged `.gitignore`, copied files without touching protected directories, and removed the temporary scaffold.
- **Design Tokens**: Configured Tailwind CSS v4 and mapped all tokens from the spec into CSS custom properties (`index.css`), including backgrounds, borders, primary/secondary colors, statistical significance indicators (green `#15803D`, red `#C0362C`), warning amber, AI blue, and purple chart ramps. Tabular numbers enabled globally.
- **shadcn/ui Configuration**: Initialized non-interactively with neutral base; remapped all `--background`, `--foreground`, `--primary`, `--border`, `--muted`, `--ring`, `--radius` variables to the spec tokens. Created `Button` component and `cn` utility.
- **Fonts**: Loaded `@fontsource/inter` (400, 500, 600, 700), `@fontsource/inter-tight` (500, 600), and `@fontsource/ibm-plex-mono` (400, 500) locally via npm.
- **Data & Question Metadata**:
  - Imported `data/campa_tracker_data.csv` via Vite `?raw` loader with PapaParse (`header: true`).
  - Implemented `src/engine/questions.ts` with exact question definitions, labels, brand ordering (Campa, Thums Up, Coca-Cola, Pepsi, Sprite), wave ordering (Oct-25, Jan-26, Apr-26), and profile options.
- **Analysis Engine**:
  - `src/engine/crosstab.ts`: Pure function calculating cell percentages, unweighted bases, weighted bases, low-base suppression flag (`hidden: unweightedBase < 30`), and significance.
  - `src/engine/stats.ts`: Two-proportion z-test with pooled proportion, testing wave-over-wave for `WAVE` and vs. `TOTAL` for banner columns ($|z| > 1.96$).
  - `src/engine/weights.ts`: Effective base, weighting efficiency percentage, and min/max weight diagnostics.
- **Test Suite**:
  - `src/engine/engine.test.ts`: 11 Vitest tests validating every single benchmark number from the spec independently against the dataset. 100% passing.
- **App Shell & Routing**:
  - 240px full-height Sidebar with logo mark, project switcher ("Campa Beverage Tracker" / "India · 3 waves"), Lucide outline icons, active state styling, and researcher footer.
  - 56px TopBar with dynamic breadcrumb and scope indicator ("Market: India · Waves: All (3)").
  - React Router configuration for `/home`, `/waves`, `/cross-tabs`, `/ask`, `/weights`, `/storyboards`, with automatic redirects from `/` and unknown routes to `/home`. Title-only placeholder page rendering.
- **Browser Verification**:
  - Audited all six pages using headless Chrome: 0 console errors, 0 console warnings.
  - Verified exact rendering of the shell on `/cross-tabs`.

## 6. Decisions & Implementation Notes
- **TypeScript 6.0 compatibility**: Removed deprecated `"baseUrl": "."` in `tsconfig.json` and `tsconfig.app.json` while retaining `@/*` path mapping; utilized `type`-only imports in engine files to conform with `verbatimModuleSyntax`.
- **Vitest configuration**: Configured directly in `vite.config.ts` with `environment: 'node'` and `globals: true` to share path aliases and Vite `?raw` loaders seamlessly between tests and the browser bundle.

## 7. Phase 2A (Store and Scope)
- **index.html**: Page title changed from `temp-scaffold` to `Pulse AI Lens`.
- **New `src/store/useLensStore.ts`**: Zustand store with `persist` middleware (localStorage) holding:
  - `waveScope`: `"All" | "Oct-25" | "Jan-26" | "Apr-26"` (default `"All"`)
  - `weighted`: boolean (default `true`)
  - `savedResults`: array (empty for now)
  - Setters: `setWaveScope`, `setWeighted`, `addSavedResult`
- **TopBar.tsx**: Scope text changed from `font-mono` to `font-sans` (Inter). Wave scope turned into a dropdown (`Waves: All (3)`, `Oct-25`, `Jan-26`, `Apr-26`) wired to the store; `Market: India` remains display-only.
- **Verification**: `npm run typecheck`, `npm test` (11/11 passing), `npm run build` all pass.
- **Persistence**: Selecting a wave scope (e.g. `Apr-26`) persists across page reloads via localStorage.

## 8. Phase 2B (Cross-tabs Table)
- **New `src/store/useLensStore.ts`**: Added `crossTab` state with `row`, `column`, `filters`, `stat` (`colpct`/`counts`), `decimals` (0/1) plus `setCrossTab` setter. All persisted via localStorage.
- **New `src/pages/CrossTabs.tsx`**: Full cross-tabs table page:
  - Left panel (260px card): search box, questions grouped by section (Profile, Brand funnel, Consumption, Attitudes, Advocacy) with per-section counts, fixed-width type tags (SINGLE/MULTI/NUMERIC/GRID/SCALE), click to set row.
  - Layout bar: Rows dropdown, Columns dropdown (Total + Wave/Age group/Gender/City type/SEC), filter chips with remove, "+ Add filter" (disabled stub), Column % | Counts toggle, Weighted switch (uses store.weighted), Decimals 0/1. Wraps if narrow.
  - Wave scope from store applies as filter except when Columns = Wave (shows "Wave columns show all waves" note).
  - Definition line: always matches state (e.g. "Showing Brand awareness by Wave · all respondents · weighted · column % · significance vs previous wave at 95%").
  - Table card: Total column first, question wording as header, Campa row highlighted with "Focus brand" tag for brand questions, ▲ green / ▼ red from engine significance, hidden cells show "–", base rows (unweighted/weighted) in monospace, right-aligned numbers, horizontal scroll for wide tables.
  - Footnote: wording, base, weighting, significance rule, "cells with a base under 30 are hidden".
  - All numbers computed exclusively by `src/engine/crosstab.ts` — no hard-coded numbers.
- **Verification values** (all match engine tests):
  - Default Q1 × Wave: Campa 67/58/66▲/77▲, Pepsi 90/92/88▼/91, bases 1,860/600/620/640
  - Scope Apr-26, Q1 × Age: Campa 80/77/73/78, bases 171/221/157/91
  - Scope Apr-26, Q3 × Total: Coca-Cola 28, Thums Up 26, Pepsi 22, Campa 14, Sprite 12
  - Q5 × Wave: 5.5/5.4/5.8, no arrows
  - Weighted off: definition line shows "unweighted", numbers change
- **Checks**: `npm run typecheck`, `npm test` (11/11 passing), `npm run build` all pass.
