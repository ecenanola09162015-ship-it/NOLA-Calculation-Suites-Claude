import { NextResponse } from "next/server";

// Configuration diagnostics. Reports presence and key type only, never values.
export const dynamic = "force-dynamic";

const describe = (value: string | undefined) =>
  value
    ? {
        present: true,
        prefix: value.split("_").slice(0, 2).join("_"),
        length: value.length,
      }
    : { present: false };

export function GET() {
  return NextResponse.json({
    clerkPublishableKey: describe(
      process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
    ),
    clerkSecretKey: describe(process.env.CLERK_SECRET_KEY),
    databaseUrl: { present: Boolean(process.env.DATABASE_URL) },
    vercelEnv: process.env.VERCEL_ENV ?? "local",
    commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? null,
  });
}
