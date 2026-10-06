# ADR 0002: Authentication-first product boundary

- Status: Accepted
- Date: 2026-10-06

## Decision

Login or account creation is the first screen on web, desktop, and mobile. A managed identity provider owns password storage, verification, reset, and secure sessions.

## Consequences

- Protected routes and APIs require a valid server-verified session.
- Provider-specific code stays behind adapters.
- Offline capability is limited until secure cached-session behavior is designed and tested.
