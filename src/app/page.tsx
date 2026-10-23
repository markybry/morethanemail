import { redirect } from "next/navigation";
import { getCurrentUser, isDemoAvailable } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function Home({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const user = await getCurrentUser();
  if (user) redirect("/l/INBOX");

  const { error } = await searchParams;
  const googleEnabled = !!process.env.GOOGLE_CLIENT_ID;

  return (
    <main className="flex min-h-full items-center justify-center p-6">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <h1 className="text-2xl font-bold">More Than Email</h1>
        <p className="mt-2 text-slate-600">
          Every Gmail label is a workspace. Sort its emails into lanes, and add notes and tasks to them. The email is
          the ticket.
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
