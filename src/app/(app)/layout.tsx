import { requireUser } from "@/lib/session";
import { isThemeId } from "@/lib/themes";
import { AppShell } from "@/components/AppShell";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  return (
    <AppShell
      user={{ name: user.name ?? user.email, email: user.email, isDemo: user.isDemo }}
      theme={isThemeId(user.theme) ? user.theme : "woodland"}
    >
      {children}
    </AppShell>
  );
}
