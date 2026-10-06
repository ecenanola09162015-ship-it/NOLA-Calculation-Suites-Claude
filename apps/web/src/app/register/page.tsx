import { SignUp } from "@clerk/nextjs";

import { AuthCard } from "@/components/auth-card";
import { AuthShell } from "@/components/auth-shell";
import { isAuthConfigured } from "@/lib/env";

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
