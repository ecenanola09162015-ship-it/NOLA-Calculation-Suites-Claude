import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse, type NextRequest } from "next/server";

const isPublicRoute = createRouteMatcher(["/", "/login(.*)", "/register(.*)"]);
const authConfigured = Boolean(
  process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY && process.env.CLERK_SECRET_KEY,
);

const protectedMiddleware = clerkMiddleware(async (auth, request) => {
  if (!isPublicRoute(request)) await auth.protect();
});

function configurationBoundary(request: NextRequest) {
  if (isPublicRoute(request)) return NextResponse.next();
  return NextResponse.redirect(new URL("/login", request.url));
}

export const proxy = authConfigured
  ? protectedMiddleware
  : configurationBoundary;

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
