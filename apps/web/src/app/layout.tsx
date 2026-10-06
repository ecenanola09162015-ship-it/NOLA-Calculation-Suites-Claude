import type { Metadata } from "next";
import type { ReactNode } from "react";
import { ClerkProvider } from "@clerk/nextjs";

import "./globals.css";
import { isAuthConfigured } from "@/lib/env";

export const metadata: Metadata = {
  title: "ÑOLA Calculation Suites",
  description:
    "Structural and geotechnical calculations across web, desktop, and mobile.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <body>
        {isAuthConfigured() ? (
          <ClerkProvider afterSignOutUrl="/login">{children}</ClerkProvider>
        ) : (
          children
        )}
      </body>
    </html>
  );
}
