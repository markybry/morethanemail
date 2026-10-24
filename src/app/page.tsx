import { redirect } from "next/navigation";
import { getCurrentUser, isDemoAvailable } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function Home({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const user = await getCurrentUser();
  if (user) redirect("/l/INBOX");

  const { error } = await searchParams;
  const googleEnabled = !!process.env.GOOGLE_CLIENT_ID;

  return (
    <main className="felt relative flex min-h-full items-center justify-center overflow-hidden p-6">
      {/* A few woodland friends wandering about. */}
      <span className="animate-float pointer-events-none absolute top-[12%] left-[10%] text-5xl opacity-80">🦔</span>
      <span className="animate-float pointer-events-none absolute right-[12%] bottom-[14%] text-6xl opacity-80 [animation-delay:-6s]">🦉</span>
      <span className="animate-float pointer-events-none absolute right-[22%] top-[18%] text-4xl opacity-70 [animation-delay:-10s]">🍂</span>
      <span className="animate-float pointer-events-none absolute bottom-[20%] left-[18%] text-4xl opacity-70 [animation-delay:-3s]">🌿</span>
      <div className="paper animate-rise relative w-full max-w-md rounded-3xl border border-[#e3d5bf] p-8 shadow-[0_4px_0_#d9c6a6,0_30px_60px_-20px_rgb(0_0_0/0.5)]">
        <div className="animate-pop mb-2 text-5xl hover:animate-wiggle">🦊</div>
        <h1 className="text-3xl font-semibold tracking-tight text-walnut">More Than Email</h1>
        <p className="mt-2 text-bark">
          Every Gmail label is a workspace. Sort its emails into lanes, and add notes and tasks to them. The email is
          the ticket.
        </p>
        {error && <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        <div className="mt-6 space-y-3">
          {googleEnabled && (
            <a
              href="/api/auth/google"
              className="btn-press block rounded-2xl bg-terracotta px-4 py-2.5 text-center font-bold text-cream"
            >
              Sign in with Google
            </a>
          )}
          {isDemoAvailable() && (
            <form action="/api/auth/demo" method="post">
              <button className="btn-press w-full rounded-2xl bg-oat px-4 py-2.5 font-bold text-bark">
                Try the demo (sample emails)
              </button>
            </form>
          )}
        </div>
      </div>
    </main>
  );
}
