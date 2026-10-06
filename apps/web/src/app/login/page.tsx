import { SignIn } from "@clerk/nextjs";

import { AuthCard } from "@/components/auth-card";
import { AuthShell } from "@/components/auth-shell";
import { isAuthConfigured } from "@/lib/env";

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
