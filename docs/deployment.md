# Deployment

## Web

Connect `apps/web` to Vercel. Configure managed-authentication keys, the project API URL, database credentials, and approved domains through protected environment variables. Preview deployments are for testing; production promotion requires CI and engineering-review gates.

## Desktop

Use Tauri 2 to package the React application. Windows releases require code-signing credentials, installer testing, update-channel policy, and a GitHub Actions release workflow. Signing credentials must remain in repository secrets.

## Mobile

Use Expo application services for reproducible iOS and Android builds. Begin with internal/closed testing, then TestFlight and Google Play tracks. App-store developer accounts, signing, privacy declarations, and review lead times are external prerequisites.

## Database and files

Use account-scoped PostgreSQL records for projects and versioned object storage for generated reports/exports. Define retention, deletion, backup, restore, and conflict-resolution policies before public beta.
