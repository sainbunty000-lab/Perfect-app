# Workspace

## Overview

pnpm workspace monorepo using TypeScript. Each package manages its own dependencies.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)

## Field Name Pipeline (Critical)
All Gemini schema field names in `parse.ts` now EXACTLY match the app's data structures.
A two-layer normalisation runs on every API response:
1. **`parse.ts` Gemini schema** — instructs Gemini to output the canonical names directly
2. **`lib/fieldMapper.ts` `normalizeFields()`** — safety-net alias resolver (alias → canonical) + inference rules (derives cogs, netProfit, taxDue, etc. if missing)
3. **`lib/parseViaApi.ts`** — applies `normalizeFields` after every API call, so all 4 screens receive pre-normalised data

Canonical field name → app key mappings:
- Balance Sheet: `currentAssets`, `currentLiabilities`, `inventory`, `debtors`, `creditors`, `cash`
- P&L: `sales`, `cogs`, `purchases`, `expenses`, `netProfit`, `grossProfit`, `EBITDA`
- Banking: `totalCredits`, `totalDebits`, `averageBalance`, `chequeReturns`, `openingBalance`, `closingBalance`
- GSTR: `gstin`, `totalTaxableTurnover`, `igstCollected`, `cgstCollected`, `sgstCollected`, `totalItcAvailable`, `totalItcUtilized`, `interestPaid`
- ITR: `taxableIncome`, `totalDeductions`, `netTaxLiability`, `taxDue`, `tdsDeducted`, `advanceTaxPaid`

## Dhanush Enterprises — Financial Intelligence Platform

### Web App (`artifacts/financial-analyzer`)
- **Dashboard** — combined module view, dynamic AI-generated summary paragraph, session aggregation from localStorage, KPI cards, risk distribution chart, recent saved cases table
- **Working Capital** — Balance Sheet + P&L file upload (PDF/Excel/Image OCR/TXT), ratio calculations, eligibility, localStorage session save (`de_wc_session`)
- **Banking Analysis** — bank statement parsing, 35+ Indian bank detection, BankDetectionPanel, drag-and-drop upload, localStorage session save (`de_banking_session`)
- **GST & ITR** — GSTR-3B + ITR document parsing, analysis
- **Multi-Year Analysis** — 1–3 year upload slots, trend engine (Increasing/Decreasing/Fluctuating), weighted + growth-adjusted eligibility, LineChart/BarChart visualizations, localStorage saves (`de_multiyear_session`, `de_multiyear_cases`)
- **Case Storage** — DB cases + localStorage multi-year cases, module type filter badges, view/delete actions

### Key Libraries
- `artifacts/financial-analyzer/src/lib/parser.ts` — `parseFinancialFile()`, `parseBankFileWithInfo()`, `detectBankInfo()`, `extractWorkingCapitalFromText()`
- `artifacts/financial-analyzer/src/lib/multi-year-calculations.ts` — `calculateMultiYear()`, `generateSummaryParagraph()`
- `artifacts/financial-analyzer/src/lib/calculations.ts` — `calculateWorkingCapital()`, `calculateBanking()`
- `artifacts/financial-analyzer/src/lib/gst-itr-parser.ts` — `parseGstItrFile()`, `analyzeGstItr()`

### Mobile App (`artifacts/financial-mobile`)
- Expo React Native app with dark navy/teal glassmorphism theme (PageBackground, GlassCard, UploadZone, GradientButton, MetricTile shared in `components/UI.tsx`)
- **Working Capital** tab — separate Balance Sheet + P&L upload zones, each calls `/api/parse-financial` with `docType=balance_sheet` or `profit_loss`
- **Banking Analysis** tab — single bank statement upload, calls `/api/parse-financial` with `docType=banking`, auto-detects bank name + period
- **GST & ITR** tab — **two separate upload zones**: GSTR section (docType=`gstr`) and ITR section (docType=`itr`) — full extracted fields shown per section before combined analysis
- **Saved Cases** tab — DB-backed case list, displays all 4 case types (working_capital, banking, multi_year, gst_itr) with distinct icons/colors/metrics
- All parsing via server-side `parseFinancialDocument()` in `lib/parseViaApi.ts` — 100% server-side accuracy, no client regex
- Save functionality: all 4 analysis tabs (WC, Banking, Multi-Year, GST & ITR) support saving cases to the database via `useCreateCase` mutation + save modal

### API Server — Financial Parsing (`artifacts/api-server`)
- `POST /api/parse-financial` — accepts `file` + `docType`, auto-detects format (PDF/Excel/Image/CSV), runs OCR if needed, returns `{ text, format, fields }` with fully structured financial data
- `POST /api/parse-document` — legacy raw text extraction endpoint (still used by other tooling)
- `src/lib/financialParser.ts` — position-aware structured extractors for BS, P&L, Banking, GSTR, ITR

## Structure

```text
artifacts-monorepo/
├── artifacts/              # Deployable applications
│   ├── api-server/         # Express API server
│   ├── financial-analyzer/ # React+Vite web app (Dhanush Enterprises)
│   └── financial-mobile/   # Expo React Native mobile app
├── lib/                    # Shared libraries
│   ├── api-spec/           # OpenAPI spec + Orval codegen config
│   ├── api-client-react/   # Generated React Query hooks
│   ├── api-zod/            # Generated Zod schemas from OpenAPI
│   └── db/                 # Drizzle ORM schema + DB connection
├── scripts/                # Utility scripts (single workspace package)
│   └── src/                # Individual .ts scripts, run via `pnpm --filter @workspace/scripts run <script>`
├── pnpm-workspace.yaml     # pnpm workspace (artifacts/*, lib/*, lib/integrations/*, scripts)
├── tsconfig.base.json      # Shared TS options (composite, bundler resolution, es2022)
├── tsconfig.json           # Root TS project references
└── package.json            # Root package with hoisted devDeps
```

## TypeScript & Composite Projects

Every package extends `tsconfig.base.json` which sets `composite: true`. The root `tsconfig.json` lists all packages as project references. This means:

- **Always typecheck from the root** — run `pnpm run typecheck` (which runs `tsc --build --emitDeclarationOnly`). This builds the full dependency graph so that cross-package imports resolve correctly. Running `tsc` inside a single package will fail if its dependencies haven't been built yet.
- **`emitDeclarationOnly`** — we only emit `.d.ts` files during typecheck; actual JS bundling is handled by esbuild/tsx/vite...etc, not `tsc`.
- **Project references** — when package A depends on package B, A's `tsconfig.json` must list B in its `references` array. `tsc --build` uses this to determine build order and skip up-to-date packages.

## Root Scripts

- `pnpm run build` — runs `typecheck` first, then recursively runs `build` in all packages that define it
- `pnpm run typecheck` — runs `tsc --build --emitDeclarationOnly` using project references

## Packages

### `artifacts/api-server` (`@workspace/api-server`)

Express 5 API server. Routes live in `src/routes/` and use `@workspace/api-zod` for request and response validation and `@workspace/db` for persistence.

- Entry: `src/index.ts` — reads `PORT`, starts Express
- App setup: `src/app.ts` — mounts CORS, JSON/urlencoded parsing, routes at `/api`
- Routes: `src/routes/index.ts` mounts sub-routers; `src/routes/health.ts` exposes `GET /health` (full path: `/api/health`)
- Depends on: `@workspace/db`, `@workspace/api-zod`
- `pnpm --filter @workspace/api-server run dev` — run the dev server
- `pnpm --filter @workspace/api-server run build` — production esbuild bundle (`dist/index.cjs`)
- Build bundles an allowlist of deps (express, cors, pg, drizzle-orm, zod, etc.) and externalizes the rest

### `lib/db` (`@workspace/db`)

Database layer using Drizzle ORM with PostgreSQL. Exports a Drizzle client instance and schema models.

- `src/index.ts` — creates a `Pool` + Drizzle instance, exports schema
- `src/schema/index.ts` — barrel re-export of all models
- `src/schema/<modelname>.ts` — table definitions with `drizzle-zod` insert schemas (no models definitions exist right now)
- `drizzle.config.ts` — Drizzle Kit config (requires `DATABASE_URL`, automatically provided by Replit)
- Exports: `.` (pool, db, schema), `./schema` (schema only)

Production migrations are handled by Replit when publishing. In development, we just use `pnpm --filter @workspace/db run push`, and we fallback to `pnpm --filter @workspace/db run push-force`.

### `lib/api-spec` (`@workspace/api-spec`)

Owns the OpenAPI 3.1 spec (`openapi.yaml`) and the Orval config (`orval.config.ts`). Running codegen produces output into two sibling packages:

1. `lib/api-client-react/src/generated/` — React Query hooks + fetch client
2. `lib/api-zod/src/generated/` — Zod schemas

Run codegen: `pnpm --filter @workspace/api-spec run codegen`

### `lib/api-zod` (`@workspace/api-zod`)

Generated Zod schemas from the OpenAPI spec (e.g. `HealthCheckResponse`). Used by `api-server` for response validation.

### `lib/api-client-react` (`@workspace/api-client-react`)

Generated React Query hooks and fetch client from the OpenAPI spec (e.g. `useHealthCheck`, `healthCheck`).

### `scripts` (`@workspace/scripts`)

Utility scripts package. Each script is a `.ts` file in `src/` with a corresponding npm script in `package.json`. Run scripts via `pnpm --filter @workspace/scripts run <script>`. Scripts can import any workspace package (e.g., `@workspace/db`) by adding it as a dependency in `scripts/package.json`.
