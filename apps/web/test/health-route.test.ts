import { afterEach, describe, expect, it, vi } from "vitest";
import { GET } from "../src/app/api/health/route";

describe("/api/health configuration diagnostics", () => {
  afterEach(() => vi.unstubAllEnvs());
  it("reports presence and key type only, never values", async () => {
    vi.stubEnv("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", "pk_test_publicvalue123");
    vi.stubEnv("CLERK_SECRET_KEY", "sk_test_supersecretvalue456");
    vi.stubEnv("DATABASE_URL", "postgres://user:pass@host/db");
    const body = await GET().json();
    expect(body.clerkPublishableKey).toEqual({
      present: true,
      prefix: "pk_test",
      length: 22,
    });
    expect(body.clerkSecretKey).toMatchObject({
      present: true,
      prefix: "sk_test",
    });
    expect(body.databaseUrl).toEqual({ present: true });
    const text = JSON.stringify(body);
    expect(text).not.toContain("supersecretvalue");
    expect(text).not.toContain("publicvalue");
    expect(text).not.toContain("pass@host");
  });
  it("flags a missing key", async () => {
    vi.stubEnv("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", "");
    expect((await GET().json()).clerkPublishableKey).toEqual({
      present: false,
    });
  });
});
