# Enterprise Foundation Architecture

## Hierarchy

Enterprise > Brand (workspace in code) > Study > Wave.
A wave is another measurement of the same study when the research stays comparable; a different objective or materially different questionnaire needs a new study. Products and flavours never automatically become brands, studies or waves.

## Two meanings of "brand"

- Company-level brand workspace: the organisation unit shown to users (e.g. "Campa", "Independence").
- Answer-option brands inside a study's config: the brands respondents answer about (e.g. Campa, Coca-Cola) stored in `StudyConfig.brands`.

## People and access

Users belong to the company. Access to a brand comes only from a membership with a role.

Roles:
- Company admin: creates brands and manages people; no research data by default.
- Company insights: reads and analyses all brands; changes nothing.
- Brand admin: full access to their own brand.
- Researcher: analyses and edits within their brand.
- Viewer: reads storyboards only.

Brand users never see brands they are not a member of. Access is per brand for now.

## One permission check

Every page asks `src/domain/permissions.ts`; no page decides access on its own.

## Login

Company single sign-on (plus email links for agencies) arrives with the backend. Until then a clearly labelled "Viewing as (demo)" choice stands in. It is not security.

## Storage

The seeded Campa study keeps its original storage keys (`lens-storage`, `lens-wave-uploads-v2`, `lens-storyboard-v1`). Every other study gets prefixed keys. Nothing is shared between brands or studies unless explicitly promoted later.

## Template rule

New studies follow the Lens data-map template.

## No real client data

No real client data in the browser-only version.