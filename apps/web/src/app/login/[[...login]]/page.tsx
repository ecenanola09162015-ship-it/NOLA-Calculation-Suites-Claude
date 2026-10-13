import { SignIn } from "@clerk/nextjs";

import { AuthCard } from "@/components/auth-card";
import { AuthShell } from "@/components/auth-shell";
import { isAuthConfigured } from "@/lib/env";

// Render per request: whether Clerk is configured is a runtime fact. A static
// prerender would bake in the fallback card if keys were absent at build time.
export const dynamic = "force-dynamic";

export default function LoginPage() {
  if (isAuthConfigured()) {
    return (
      <AuthShell eyebrow="SECURE ACCOUNT ACCESS" title="Welcome back">
        <SignIn
          routing="path"
          path="/login"
          signUpUrl="/register"
          fallbackRedirectUrl="/launcher"
        />
      </AuthShell>
    );
  }
  return <AuthCard mode="login" />;
}
