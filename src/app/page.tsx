import { redirect } from "next/navigation";
import { getCurrentUser, isDemoAvailable } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function Home({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const user = await getCurrentUser();
  if (user) redirect("/l/INBOX");

  const { error } = await searchParams;
  const googleEnabled = !!process.env.GOOGLE_CLIENT_ID;

  return (
    <main className="relative flex min-h-full items-center justify-center overflow-hidden bg-gradient-to-br from-indigo-950 via-violet-900 to-fuchsia-900 p-6">
      <div className="animate-float pointer-events-none absolute -top-24 -left-24 h-96 w-96 rounded-full bg-pink-500/40 blur-3xl" />
      <div className="animate-float pointer-events-none absolute -right-20 bottom-0 h-[28rem] w-[28rem] rounded-full bg-sky-400/30 blur-3xl [animation-delay:-5s]" />
      <div className="animate-float pointer-events-none absolute top-1/3 left-1/2 h-72 w-72 rounded-full bg-amber-300/30 blur-3xl [animation-delay:-9s]" />
      <div className="animate-rise relative w-full max-w-md rounded-3xl border border-white/20 bg-white/90 p-8 shadow-2xl shadow-fuchsia-900/40 backdrop-blur">
        <div className="animate-pop mb-2 text-4xl">💌</div>
        <h1 className="bg-gradient-to-r from-violet-700 via-fuchsia-600 to-pink-500 bg-clip-text text-3xl font-extrabold tracking-tight text-transparent">
          More Than Email
        </h1>
        <p className="mt-2 text-slate-600">
          Every Gmail label is a workspace. Sort its emails into lanes, and add notes and tasks to them. The email is
          the ticket.
        </p>
        {error && <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        <div className="mt-6 space-y-3">
          {googleEnabled && (
            <a
              href="/api/auth/google"
              className="block rounded-xl bg-gradient-to-r from-violet-600 via-fuchsia-600 to-pink-500 px-4 py-2.5 text-center font-semibold text-white shadow-lg shadow-fuchsia-300/50 transition hover:-translate-y-0.5 hover:shadow-xl active:scale-95"
            >
              Sign in with Google
            </a>
          )}
          {isDemoAvailable() && (
            <form action="/api/auth/demo" method="post">
              <button className="w-full rounded-xl border-2 border-violet-200 px-4 py-2.5 font-semibold text-violet-700 transition hover:-translate-y-0.5 hover:border-fuchsia-300 hover:bg-fuchsia-50 active:scale-95">
                Try the demo (sample emails)
              </button>
            </form>
          )}
        </div>
      </div>
    </main>
  );
}
