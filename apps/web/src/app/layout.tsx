import type { Metadata } from "next";
import type { ReactNode } from "react";
import { ClerkProvider } from "@clerk/nextjs";

import localFont from "next/font/local";
import "./globals.css";
import { isAuthConfigured } from "@/lib/env";

// Launcher theme fonts, self-hosted (SIL OFL 1.1, see ./fonts/LICENSES.md).
const archivo = localFont({
  src: "./fonts/archivo-variable.woff2",
  variable: "--font-archivo",
  weight: "100 900",
  display: "swap",
  declarations: [{ prop: "font-stretch", value: "62% 125%" }],
});
const sora = localFont({
  src: "./fonts/sora-variable.woff2",
  variable: "--font-sora",
  weight: "100 800",
  display: "swap",
});
const manrope = localFont({
  src: "./fonts/manrope-variable.woff2",
  variable: "--font-manrope",
  weight: "200 800",
  display: "swap",
});
const plexMono = localFont({
  src: "./fonts/ibm-plex-mono-500.woff2",
  variable: "--font-plex-mono",
  weight: "500",
  display: "swap",
});

export const metadata: Metadata = {
  title: "ÑOLA Calculation Suites",
  description:
    "Structural and geotechnical calculations across web, desktop, and mobile.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return (
    <html
      lang="en"
      className={`${archivo.variable} ${sora.variable} ${manrope.variable} ${plexMono.variable}`}
    >
      <body>
        {isAuthConfigured() ? (
          <ClerkProvider
            signInUrl="/login"
            signUpUrl="/register"
            signInFallbackRedirectUrl="/launcher"
            signUpFallbackRedirectUrl="/launcher"
            afterSignOutUrl="/login"
          >
            {children}
          </ClerkProvider>
        ) : (
          children
        )}
      </body>
    </html>
  );
}
