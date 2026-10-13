/**
 * Clerk sign-in (incl. Google) renders only when both keys are set for the
 * Vercel environment being built (Production and Preview):
 * NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY (inlined at build) and CLERK_SECRET_KEY.
 * Otherwise /login shows the "Repository preview only" fallback card.
 */
export function isAuthConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY &&
    process.env.CLERK_SECRET_KEY,
  );
}

export function isDatabaseConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL);
}
