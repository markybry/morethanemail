import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getCurrentUser, isDemoAvailable } from "@/lib/session";
import { THEMES, isThemeId } from "@/lib/themes";
import { Logo } from "@/components/Logo";
import { ThemeIcon } from "@/components/ThemeContext";

export const dynamic = "force-dynamic";

export default async function Home({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const user = await getCurrentUser();
  if (user) redirect("/l/INBOX");

  const { error } = await searchParams;
  const googleEnabled = !!process.env.GOOGLE_CLIENT_ID;
  const remembered = (await cookies()).get("mte.theme")?.value;
  const theme = THEMES[isThemeId(remembered) ? remembered : "woodland"];
  const [a, b, c, d] = theme.icons.lanes;

  return (
    <main className="felt relative flex min-h-full items-center justify-center overflow-hidden p-6">
      {/* A few of the theme's friends wandering about. */}
      <ThemeIcon icon={a} size={48} className="animate-float pointer-events-none absolute top-[12%] left-[10%] text-5xl opacity-80" />
      <ThemeIcon icon={b} size={56} className="animate-float pointer-events-none absolute right-[12%] bottom-[14%] text-6xl opacity-80 [animation-delay:-6s]" />
      <ThemeIcon icon={c} size={36} className="animate-float pointer-events-none absolute top-[18%] right-[22%] text-4xl opacity-70 [animation-delay:-10s]" />
      <ThemeIcon icon={d} size={36} className="animate-float pointer-events-none absolute bottom-[20%] left-[18%] text-4xl opacity-70 [animation-delay:-3s]" />
      <div className="paper animate-rise relative w-full max-w-md rounded-3xl border border-line p-8 shadow-[0_4px_0_var(--color-card-edge),0_30px_60px_-20px_rgb(0_0_0/0.5)]">
        <Logo size={56} className="animate-pop mb-3 hover:animate-wiggle" />
        <h1 className="text-3xl font-semibold tracking-tight text-walnut">More Than Email</h1>
        <p className="mt-2 text-bark">
          One workflow for your email. Move each piece of work through your statuses, keep notes and tasks on it, and
          use your Gmail labels to see just one client or project.
        </p>
        {error && <p className="mt-4 rounded-xl bg-bad-bg px-3 py-2 text-sm text-bad-ink">{error}</p>}
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
