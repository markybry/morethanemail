"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import type { ThemeId } from "@/lib/themes";
import { MailProvider } from "./MailContext";
import { Sidebar } from "./Sidebar";
import { ThemeIcon, ThemeProvider, useTheme } from "./ThemeContext";

type User = { name: string; email: string; isDemo: boolean };

// The signed-in frame: sidebar plus page. Phones get a top bar with a menu button.
export function AppShell({ user, theme, children }: { user: User; theme: ThemeId; children: React.ReactNode }) {
  return (
    <ThemeProvider initial={theme}>
      <MailProvider>
        <Frame user={user}>{children}</Frame>
      </MailProvider>
    </ThemeProvider>
  );
}

function Frame({ user, children }: { user: User; children: React.ReactNode }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const pathname = usePathname();
  const { theme } = useTheme();

  // Navigating (e.g. picking a label) closes the phone menu.
  useEffect(() => setMenuOpen(false), [pathname]);

  return (
    <div className="flex h-full flex-col md:flex-row">
      <header className="felt flex shrink-0 items-center gap-2 px-3 py-2 text-side-strong md:hidden">
        <button onClick={() => setMenuOpen(true)} className="rounded-lg px-2 py-1 text-xl" aria-label="Open menu">
          ☰
        </button>
        <ThemeIcon icon={theme.icons.logo} size={22} className="text-xl" />
        <span className="font-display text-base font-semibold">More Than Email</span>
      </header>
      <Sidebar user={user} mobileOpen={menuOpen} onClose={() => setMenuOpen(false)} />
      <main className="min-h-0 min-w-0 flex-1">{children}</main>
    </div>
  );
}
