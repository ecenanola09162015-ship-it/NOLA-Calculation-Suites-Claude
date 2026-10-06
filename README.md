# ÑOLA Calculation Suites

ÑOLA Calculation Suites is an independent, account-based structural and geotechnical calculation product for the web, Windows desktop, iOS, and Android. It is separate from ÑOLA CAD and has no CAD dependency.

## Current milestone

This repository is the verified development foundation for version `0.2.0`. The web vertical slice now includes Clerk authentication, account-scoped Neon project and calculation-draft storage, the launcher catalogue, and an interactive RC Column input workspace. The desktop and mobile shells share the same product contracts. Engineering formulas remain locked behind a verification gate until approved references and benchmark cases are entered and independently reviewed.

### Pilot modules

1. RC Column
2. Steel Column
3. Seismic Loads
4. Soil Bearing Capacity

Slope Stability Analysis is included in the catalogue for Phase 2.

### Code roadmap

- Initial: American/international standards and NSCP, with the exact edition recorded per calculation.
- Later: Eurocode and Australian Standards.

## Repository structure

```text
apps/
  web/              Next.js web application for Vercel
  desktop/          React/Vite application packaged with Tauri 2
  mobile/           React Native application built with Expo
packages/
  calc-core/        Shared calculation contracts, module registry, and verified formulas
  auth/             Cross-platform authentication contracts
  design-tokens/    Shared colors, typography, spacing, and status semantics
docs/               Product, architecture, security, deployment, and verification guidance
```

## Local setup

Requirements: Node.js 22 or newer, pnpm, and—only for desktop packaging—the Tauri 2 prerequisites and Rust toolchain.

```bash
pnpm install
cp .env.example .env.local
pnpm check
pnpm dev
```

Run a single application:

```bash
pnpm --filter @nola/web dev
pnpm --filter @nola/desktop dev
pnpm --filter @nola/mobile dev
```

## Authentication

Login or registration is the first screen on all platforms. The web app uses Clerk and never stores passwords. Without valid Clerk keys, all protected routes fail closed. Provider keys and hosted services are intentionally not committed.

## Web test deployment

The deployable web milestone requires a Clerk application and a Neon Postgres database. Add the keys in `.env.local` for development or as protected Vercel environment variables. The first authenticated request creates the two prototype tables; move this bootstrap to reviewed migrations before production.

```bash
pnpm --filter @nola/web dev
```

The RC Column workspace can validate its input contract and save drafts. Capacity, utilization, pass/fail, and professional reports remain intentionally unavailable until the benchmark and independent-review gate is complete.

## Safety status

The current calculation entries are marked `verification-required`. They are not approved for professional design work until the verification checklist in `docs/calculation-verification.md` is complete.
