import { afterEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
afterEach(() => vi.unstubAllEnvs());
it("serves the shared logo publicly while keeping projects and calculations protected", async () => {
  vi.resetModules();
  vi.stubEnv("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", "");
  vi.stubEnv("CLERK_SECRET_KEY", "");
  const { proxy } = await import("../src/proxy");
  const check = proxy as (request: NextRequest) => Response;
  for (const path of ["/brand/nola-logo.png", "/login"])
    expect(check(new NextRequest("https://nola.example" + path)).status).toBe(
      200,
    );
  for (const path of [
    "/launcher",
    "/api/calculations",
    "/brand/private-logo.png",
  ])
    expect(
      check(new NextRequest("https://nola.example" + path)).headers.get(
        "location",
      ),
    ).toBe("https://nola.example/login");
});
