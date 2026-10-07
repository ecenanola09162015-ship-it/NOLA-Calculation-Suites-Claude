import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { AccountControl } from "@/components/account-control";
import { SuiteWorkspace } from "@/components/suite-workspace";
import { isAuthConfigured, isDatabaseConfigured } from "@/lib/env";
import { listProjects, listCalculationDrafts } from "@/lib/projects";
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
  return (
    <SuiteWorkspace
      initialModule={
        (await searchParams).module === "rc-column" ? "rc-column" : undefined
      }
      initialProjects={projects}
      initialDrafts={drafts}
      cloudReady={ready}
      account={<AccountControl />}
    />
  );
}
