import type { Metadata, Viewport } from "next";
import { Cormorant_Garamond, EB_Garamond, Fraunces, Nunito, Press_Start_2P, VT323 } from "next/font/google";
import { getCurrentUser } from "@/lib/session";
import { isThemeId } from "@/lib/themes";
import "./globals.css";

// Fonts for every theme; each theme picks its pair in globals.css.
const nunito = Nunito({ variable: "--font-nunito", subsets: ["latin"] });
const fraunces = Fraunces({ variable: "--font-fraunces", subsets: ["latin"] });
const garamond = EB_Garamond({ variable: "--font-garamond", subsets: ["latin"] });
const cormorant = Cormorant_Garamond({ variable: "--font-cormorant", subsets: ["latin"], weight: ["500", "600", "700"] });
const vt323 = VT323({ variable: "--font-vt323", subsets: ["latin"], weight: "400" });
const pressStart = Press_Start_2P({ variable: "--font-press", subsets: ["latin"], weight: "400" });

export const metadata: Metadata = {
  title: "More Than Email",
  description: "Every Gmail label is a workspace; every email is a ticket.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // The saved theme goes on <html> so the first paint is already themed.
  const user = await getCurrentUser().catch(() => null);
  const theme = isThemeId(user?.theme) ? user.theme : "woodland";
  const fonts = [nunito, fraunces, garamond, cormorant, vt323, pressStart].map((f) => f.variable).join(" ");
  return (
    // Font variables sit on <html> too, so each theme's --theme-sans/--theme-display can use them.
    <html lang="en" className={`${fonts} h-full`} data-theme={theme}>
      <body className="h-full antialiased">{children}</body>
    </html>
  );
}
