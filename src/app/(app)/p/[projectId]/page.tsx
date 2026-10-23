import { notFound } from "next/navigation";
import { loadProject } from "@/lib/board";
import { requireUser } from "@/lib/session";
import { Workspace } from "@/components/Workspace";

export default async function ProjectPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{ case?: string }>;
}) {
  const user = await requireUser();
  const { projectId } = await params;
  const { case: caseId } = await searchParams;
  const project = await loadProject(user.id, projectId);
  if (!project) notFound();
  return <Workspace key={project.id} project={project} initialCaseId={caseId} />;
}
