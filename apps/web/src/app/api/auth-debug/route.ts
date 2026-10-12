// TEMPORARY diagnostic for the sign-in loop on the Claude test deployment. Remove after diagnosis.
import { auth, clerkClient } from "@clerk/nextjs/server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const session = await auth();
  const client = await clerkClient();
  const state = await client.authenticateRequest(request, {
    publishableKey: process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
  });
  const cookieNames = (request.headers.get("cookie") ?? "")
    .split(";")
    .map((c) => c.trim().split("=")[0])
    .filter((name) => name.startsWith("__"));
  const pk = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ?? "";
  const sk = process.env.CLERK_SECRET_KEY ?? "";
  return Response.json({
    middlewareUserId: session.userId ? "present" : null,
    requestStatus: state.status,
    reason: state.reason ?? null,
    message: state.message ?? null,
    publishableKeyPrefix: pk.slice(0, 8),
    publishableKeyLength: pk.length,
    secretKeyPrefix: sk.slice(0, 8),
    secretKeyLength: sk.length,
    secretKeyHasWhitespace: /\s/.test(sk),
    cookieNames,
  });
}
