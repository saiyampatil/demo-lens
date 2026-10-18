# Pulse AI Lens: product spec (MVP)

## What it is
Pulse AI Lens is an analytics workspace for brand research teams. Researchers
query survey data across waves in plain language or with cross-tabs, and export
findings to storyboards. It is NOT a survey builder, NOT a data-ingestion tool
and NOT a campaign dashboard.

## Users
- Researcher (primary): explores data, builds cross-tabs, asks questions, saves findings.
- Viewer (later): opens published dashboards. Out of MVP scope.

## Screens (exactly these, in this sidebar order)
1. Home
2. Waves
3. Cross-tabs      <- the core screen
4. Ask AI
5. Weights
6. Storyboards

Do NOT build: Visualize as a separate page (charts live inside Cross-tabs),
Import/Review/Project Tree/Decision log, Norms, landing page, login.

## Shell (identical on every screen)
- Left sidebar, 240px, white, full height, right border.
- Top: logo mark (purple square with a small "L" or icon) + "Pulse AI Lens".
- Project switcher: "Campa Beverage Tracker" with "India · 3 waves" underneath.
- Nav items with outline icons. Exactly one active item (light purple background, purple text).
- Bottom: avatar "R", "Researcher", "Insights team".
- Top bar, 56px: breadcrumb "Campa Beverage Tracker / [page name]" on the left;
  right side shows "Market: India · Waves: All (3)".
- Fluid layout. No fixed page width or height. Nothing cut off at 1280px or 1440px.

## Design tokens
- Fonts: Inter Tight (headings), Inter (body/UI), IBM Plex Mono (question codes, result IDs, bases only).
- Background #F7F7F5 (warm, not blue). Cards #FFFFFF. Border #E8E6EE.
- Text #1A1A1A. Muted text #717680. Subtle #9A9AA5.
- Primary #6B47D6. Primary hover #5A3AC0. Light purple #F1ECFE.
- Significantly higher: green #15803D. Significantly lower: red #C0362C.
- Warnings/caveats: amber #B45309 on #FEF4E6.
- AI-generated content only: AI blue #2F5BEA on #F3F6FF, dashed border.
- Chart ramp (purple): #4E2FB8, #6B47D6, #9E77ED, #C4ADF6, #E6DCFD. Other brands in grey #C9C6D3.
- Cards: 14px radius, 1px border #E8E6EE, very soft shadow.
- Buttons and inputs: 10px radius, 32-36px tall.
- No gradients, no emoji, no decorative backgrounds. Tabular numbers everywhere.

## Data (the only source of numbers)
- File: data/campa_tracker_data.csv (1,860 rows, one row per respondent).
- Codebook: data/campa_datamap.xlsx.
- Waves: labelled ONLY by month: Oct-25 (n=600), Jan-26 (n=620), Apr-26 (n=640).
  Never use W1-W8, "Wave 6/7/8", or any other label.
- Every number on screen is computed from the CSV by the analysis engine.
  No hard-coded results anywhere in the UI.
- Columns: resp_id, wave, wt (weight), AGE (1-4), GENDER (1-2), CITY (1-3), SEC (1-3),
  Q1_1..Q1_5 brand awareness (0/1), Q2_1..Q2_5 brand trial (0/1),
  Q3 main brand (1-5, blank = not asked), Q4_1..Q4_3 attitude grid (1-5, blank = not asked),
  Q5 servings per week (99 = don't know, treat as missing), Q6 recommend 0-10 (blank = not asked).
- Brands in order: Campa, Thums Up, Coca-Cola, Pepsi, Sprite.
- Age groups: 18-24, 25-34, 35-44, 45+.

## Analysis rules
- Weighted by wt by default; a toggle switches to unweighted.
- Column % = weighted count in cell / weighted base of column.
- Significance: two-proportion z-test, 95% (|z| > 1.96), tested vs the previous
  wave (for Wave columns) or vs Total (for banner columns). Mark ▲ higher, ▼ lower.
- Cells with unweighted base < 30 are hidden (show "–").
- Multi-response questions (Q1, Q2): base = all respondents.
- Routed questions (Q3, Q4, Q6): base = respondents who were asked (non-blank).
- Q5: exclude 99 from the mean.

## Language rules
- Plain research language. Never use: "SQL", "R", "engine", "checksum", "hash",
  "taxonomy", "harmonization", "imputation", "ingestion", model or vendor names.
- Never invent numbers, confidence intervals, p-values, causes, comparisons or claims
  not computed from the data.

## Out of scope for MVP
Real AI/LLM calls (Ask AI uses scripted question matching on top of the analysis),
login, backend, database, export to PowerPoint file (show as a button that downloads
a placeholder or is disabled), publishing dashboards, RIM weight creation, Norms.

## Done when
Each screen renders with no console errors, every number matches the CSV analysis,
and the sidebar shows exactly one active item on every page.
