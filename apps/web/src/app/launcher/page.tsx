import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { AccountControl } from "@/components/account-control";
import { SuiteWorkspace } from "@/components/suite-workspace";
import { isAuthConfigured, isDatabaseConfigured } from "@/lib/env";
import { listProjects, listCalculationDrafts } from "@/lib/projects";
// Always render per request: auth configuration and the session are runtime
// facts. If a secret key is unavailable at build time, a static prerender would
// bake in the redirect to /login and cause a sign-in loop.
export const dynamic = "force-dynamic";
export default async function LauncherPage({
  searchParams,
}: {
  searchParams: Promise<{ module?: string }>;
}) {
  if (!isAuthConfigured()) redirect("/login");
  const { userId } = await auth();
  if (!userId) redirect("/login");
  const ready = isDatabaseConfigured();
  const [projects, drafts] = ready
    ? await Promise.all([listProjects(userId), listCalculationDrafts(userId)])
    : [[], []];
  const requested = (await searchParams).module;
  const workspaceModule = requested === "retaining-wall" || requested === "underground-tank" ? requested : undefined;
  return (
    <SuiteWorkspace
      initialModule={
        requested === "rc-column" ||
        requested === "slab" ||
        requested === "stairs"
          ? requested
          : workspaceModule
      }
      initialProjects={projects}
      initialDrafts={drafts}
      cloudReady={ready}
      account={<AccountControl />}
    />
  );
}
