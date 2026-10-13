import { SignUp } from "@clerk/nextjs";

import { AuthCard } from "@/components/auth-card";
import { AuthShell } from "@/components/auth-shell";
import { isAuthConfigured } from "@/lib/env";

// Render per request: whether Clerk is configured is a runtime fact. A static
// prerender would bake in the fallback card if keys were absent at build time.
export const dynamic = "force-dynamic";

export default function RegisterPage() {
  if (isAuthConfigured()) {
    return (
      <AuthShell eyebrow="VERIFIED EMAIL REQUIRED" title="Create your account">
        <SignUp
          routing="path"
          path="/register"
          signInUrl="/login"
          fallbackRedirectUrl="/launcher"
        />
      </AuthShell>
    );
  }
  return <AuthCard mode="register" />;
}
