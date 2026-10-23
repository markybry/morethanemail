import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getCurrentUser, isDemoAvailable } from "@/lib/session";
import { newProject } from "@/lib/board";

export const dynamic = "force-dynamic";

export default async function Home({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const user = await getCurrentUser();
  if (user) {
    const first = await db.project.findFirst({ where: { userId: user.id }, orderBy: { position: "asc" } });
    redirect(`/p/${first?.id ?? (await newProject(user.id, "Inbox triage")).id}`);
  }

  const { error } = await searchParams;
  const googleEnabled = !!process.env.GOOGLE_CLIENT_ID;

  return (
    <main className="flex min-h-full items-center justify-center p-6">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <h1 className="text-2xl font-bold">More Than Email</h1>
        <p className="mt-2 text-slate-600">
          Drag emails onto boards. Each one becomes a <b>ticket</b> you can grow with notes, tasks and more emails, and
          promote into its own <b>workspace</b> when it gets big: a project, a case, an investigation.
        </p>
        {error && <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        <div className="mt-6 space-y-3">
          {googleEnabled && (
            <a
              href="/api/auth/google"
              className="block rounded-lg bg-slate-900 px-4 py-2.5 text-center font-medium text-white hover:bg-slate-800"
            >
              Sign in with Google
            </a>
          )}
          {isDemoAvailable() && (
            <form action="/api/auth/demo" method="post">
              <button className="w-full rounded-lg border border-slate-300 px-4 py-2.5 font-medium text-slate-700 hover:bg-slate-50">
                Try the demo (sample emails)
              </button>
            </form>
          )}
        </div>
      </div>
    </main>
  );
}
