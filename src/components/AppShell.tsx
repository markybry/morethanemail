"use client";

import { Suspense, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import type { ThemeId } from "@/lib/themes";
import { MailProvider } from "./MailContext";
import { SearchBar } from "./SearchBar";
import { Sidebar } from "./Sidebar";
import { SidebarSlotProvider } from "./SidebarSlot";
import { ThemeProvider } from "./ThemeContext";
import { Logo } from "./Logo";

type User = { name: string; email: string; isDemo: boolean; triageFrom: string | null };

// The signed-in frame: sidebar plus page. Phones get a top bar with a menu button.
export function AppShell({ user, theme, children }: { user: User; theme: ThemeId; children: React.ReactNode }) {
  return (
    <ThemeProvider initial={theme}>
      <MailProvider me={user.email}>
        <Frame user={user}>{children}</Frame>
      </MailProvider>
    </ThemeProvider>
  );
}

function Frame({ user, children }: { user: User; children: React.ReactNode }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const pathname = usePathname();
  const [slot, setSlot] = useState<HTMLElement | null>(null);

  // Navigating (e.g. picking a label) closes the phone menu.
  useEffect(() => setMenuOpen(false), [pathname]);

  return (
    <SidebarSlotProvider value={slot}>
    <div className="flex h-full flex-col md:flex-row">
      <header className="felt flex shrink-0 items-center gap-2 px-3 py-2 text-side-strong md:hidden">
        <button onClick={() => setMenuOpen(true)} className="rounded-lg px-2 py-1 text-xl" aria-label="Open menu">
          ☰
        </button>
        <Logo size={24} className="shrink-0" />
        <Suspense>
          <SearchBar className="min-w-0 flex-1" />
        </Suspense>
      </header>
      <Sidebar user={user} mobileOpen={menuOpen} onClose={() => setMenuOpen(false)} slotRef={setSlot} />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <div className="shrink-0 border-b border-line bg-cream px-4 py-2 max-md:hidden">
          <Suspense>
            <SearchBar className="mx-auto max-w-2xl" />
          </Suspense>
        </div>
        <main className="min-h-0 min-w-0 flex-1">{children}</main>
      </div>
    </div>
    </SidebarSlotProvider>
  );
}
