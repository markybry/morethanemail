import { notFound } from "next/navigation";
import { ensureWorkspace, loadLaneTemplates, loadWorkspace } from "@/lib/board";
import { mailErrorMessage } from "@/lib/mail";
import { requireUser } from "@/lib/session";
import { LabelBoard } from "@/components/LabelBoard";

// A Gmail label's workspace. Opening a label for the first time creates it.
export default async function LabelPage({
  params,
  searchParams,
}: {
  params: Promise<{ labelId: string }>;
  searchParams: Promise<{ thread?: string }>;
}) {
  const user = await requireUser();
  const labelId = decodeURIComponent((await params).labelId);
  const { thread } = await searchParams;

  let workspace;
  try {
    workspace = await ensureWorkspace(user, labelId);
  } catch (e) {
    console.error("ensureWorkspace failed", e);
    return <p className="p-6 text-sm text-red-600">{mailErrorMessage(e)}</p>;
  }
  if (!workspace) notFound();

  const [board, templates] = await Promise.all([loadWorkspace(user.id, workspace.id), loadLaneTemplates(user.id)]);
  return (
    <LabelBoard
      key={workspace.id}
      workspace={board.workspace}
      initialEmails={board.emails}
      initialThreadId={thread}
      templates={templates}
    />
  );
}
