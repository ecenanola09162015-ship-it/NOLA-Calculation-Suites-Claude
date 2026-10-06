# Authentication

## Required user journey

1. Open any platform.
2. See the ÑOLA login screen before the launcher.
3. Log in or create an account with email and password.
4. Verify email ownership.
5. Enter the launcher and synchronized project list.
6. Reset password, manage sessions, and log out through the identity provider.

## Implementation rule

Use a managed identity provider. The initial repository uses a provider-neutral contract and is prepared for Clerk because of its Next.js, Expo, and Vercel support. Desktop authentication must complete an approved native OAuth/OIDC proof of concept before the provider decision is locked.

The application must not:

- store passwords
- log access or refresh tokens
- expose provider secrets to browser or mobile code
- trust a client-supplied account identifier
- permit protected routes when the server session is absent

## Acceptance criteria

- Login is the first application route on all platforms.
- Registration requires verified email ownership.
- Password-reset responses do not reveal whether an address exists.
- Protected project and calculation APIs enforce account ownership server-side.
- Sign-out invalidates the local session and clears sensitive cached data.
- Security tests cover expired, revoked, missing, and cross-account sessions.
