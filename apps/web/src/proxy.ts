import { NextResponse, type NextRequest } from "next/server";

const publicPaths = new Set(["/", "/login", "/register"]);

export function proxy(request: NextRequest) {
  if (publicPaths.has(request.nextUrl.pathname)) return NextResponse.next();

  // Fail closed until the managed identity provider verifies the server session.
  // Replace this redirect with the selected provider's official middleware in milestone 0.2.
  return NextResponse.redirect(new URL("/login", request.url));
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
