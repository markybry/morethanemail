import { listProjects } from "@/lib/board";
import { requireUser } from "@/lib/session";
import { Sidebar } from "@/components/Sidebar";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const projects = await listProjects(user.id);
  return (
    <div className="flex h-full">
      <Sidebar projects={projects} user={{ name: user.name ?? user.email, email: user.email, isDemo: user.isDemo }} />
      <main className="min-w-0 flex-1">{children}</main>
    </div>
  );
}
