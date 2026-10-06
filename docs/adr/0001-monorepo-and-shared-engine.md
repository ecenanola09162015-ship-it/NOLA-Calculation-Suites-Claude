# ADR 0001: Monorepo and shared calculation engine

- Status: Accepted
- Date: 2026-10-06

## Decision

Use one private Turborepo with pnpm workspaces. Web, desktop, and mobile applications import a shared TypeScript calculation package.

## Consequences

- A formula change is implemented once and tested for all platforms.
- Platform shells may differ, but input/output schemas and calculation results must not.
- CI can detect affected packages while still running complete engineering regression suites before release.
