import { notFound } from "next/navigation";
import { cardThreadIdOf, loadLaneTemplates, loadWorkspace, resolveLabelView } from "@/lib/board";
import { mailErrorMessage } from "@/lib/mail";
import { requireUser } from "@/lib/session";
import { LabelBoard } from "@/components/LabelBoard";

// A label's view: the workflow seen through that label (Inbox shows it unfiltered).
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

  let view;
  try {
    view = await resolveLabelView(user, labelId);
  } catch (e) {
    console.error("resolveLabelView failed", e);
    return <p className="p-6 text-sm text-red-600">{mailErrorMessage(e)}</p>;
  }
  if (!view) notFound();

  // A link to a thread that was added to a card opens that card.
  const [board, templates, openThread] = await Promise.all([
    loadWorkspace(user.id, view.workspaceId, view.lens),
    loadLaneTemplates(user.id),
    thread ? cardThreadIdOf(user.id, thread) : undefined,
  ]);
  return (
    <LabelBoard
      key={labelId}
      workspace={board.workspace}
      initialEmails={board.emails}
      initialThreadId={openThread}
      templates={templates}
      triageFrom={user.triageFrom?.toISOString() ?? null}
    />
  );
}
