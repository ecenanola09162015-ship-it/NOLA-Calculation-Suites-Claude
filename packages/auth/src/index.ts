export interface NolaUser {
  id: string;
  email: string;
  emailVerified: boolean;
  displayName?: string;
}

export interface AuthSession {
  user: NolaUser;
  expiresAt: string;
}

export interface AuthAdapter {
  getSession(): Promise<AuthSession | null>;
  startEmailSignIn(email: string): Promise<void>;
  startRegistration(email: string): Promise<void>;
  signOut(): Promise<void>;
}

export const authenticationRequirements = {
  firstScreen: "login",
  verifiedEmailRequired: true,
  passwordStorage: "managed-provider-only",
  protectedPlatforms: ["web", "desktop", "ios", "android"],
} as const;
