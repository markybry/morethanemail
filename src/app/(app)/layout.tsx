import { requireUser } from "@/lib/session";
import { Sidebar } from "@/components/Sidebar";
import { MailProvider } from "@/components/MailContext";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  return (
    <MailProvider>
      <div className="flex h-full">
        <Sidebar user={{ name: user.name ?? user.email, email: user.email, isDemo: user.isDemo }} />
        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </MailProvider>
  );
}
