# Security Policy

Report suspected vulnerabilities privately to the repository owner. Do not place credentials, customer data, proprietary calculation workbooks, signing certificates, or production datasets in an issue or pull request.

## Baseline requirements

- Authentication must use a managed identity provider.
- Passwords must never be stored by ÑOLA Calculation Suites.
- Every protected API request must validate the server-side session.
- Project records must be scoped to the authenticated account.
- Secrets belong in platform secret stores, never in Git.
- Calculation and audit records must preserve code family, code edition, units, assumptions, and calculation-engine version.
