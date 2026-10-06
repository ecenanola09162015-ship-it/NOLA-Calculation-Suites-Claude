# Deployment

## Web

Connect `apps/web` to Vercel with the repository root set to `apps/web`. Configure the Clerk keys and Neon `DATABASE_URL` through protected environment variables. Preview deployments are for interface, account, project-isolation, and draft-storage testing. Production promotion requires CI and engineering-review gates.

Required variables:

- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
- `CLERK_SECRET_KEY`
- `NEXT_PUBLIC_CLERK_SIGN_IN_URL=/login`
- `NEXT_PUBLIC_CLERK_SIGN_UP_URL=/register`
- `DATABASE_URL`

The Next.js build succeeds without service keys so pull requests remain testable, but protected routes fail closed and the sign-in page displays a configuration notice. Do not treat that state as a usable beta.

## Desktop

Use Tauri 2 to package the React application. Windows releases require code-signing credentials, installer testing, update-channel policy, and a GitHub Actions release workflow. Signing credentials must remain in repository secrets.

## Mobile

Use Expo application services for reproducible iOS and Android builds. Begin with internal/closed testing, then TestFlight and Google Play tracks. App-store developer accounts, signing, privacy declarations, and review lead times are external prerequisites.

## Database and files

Use account-scoped PostgreSQL records for projects and versioned object storage for generated reports/exports. Define retention, deletion, backup, restore, and conflict-resolution policies before public beta.
