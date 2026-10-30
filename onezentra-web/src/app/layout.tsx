import type { Metadata } from "next";
import { headers } from "next/headers";
import { Roboto } from "next/font/google";
import { ThemeProvider } from "next-themes";
import "./globals.css";

const roboto = Roboto({
  variable: "--font-roboto",
  subsets: ["latin"],
  weight: ["300", "400", "500", "700"],
  display: "swap",
  preload: false,
});

export const metadata: Metadata = {
  title: "ONEZENTRA - Warehouse Management System",
  description: "Sistem manajemen gudang ONEZENTRA",
};

// CSP nonce dibuat per-request di proxy.ts. Next hanya menyisipkan nonce ke
// script hydration pada render dinamis; halaman yang di-prerender statis akan
// memakai HTML tanpa nonce dan diblokir browser. Karena itu semua halaman app
// dirender dinamis (data operasional memang selalu butuh sesi terbaru).
export const dynamic = "force-dynamic";

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // next-themes menyuntikkan script inline untuk mencegah flash tema. Script
  // itu juga harus memakai nonce request ini, bukan hanya script milik Next.
  const nonce = (await headers()).get("x-nonce") ?? undefined;

  // The theme script mutates <html> before React hydrates, so the
  // server-rendered markup intentionally disagrees with the first client
  // render. suppressHydrationWarning tells React that is expected.
  //
  // attribute="data-theme" is deliberate: globals.css keys the whole palette
  // off [data-theme='dark'], so the library writes exactly the attribute the
  // tokens already expect — no CSS rewrite needed. enableSystem gives the
  // "Sistem" option; disableTransitionOnChange stops the repaint from being
  // animated on every switch.
  //
  // Comments live here rather than inside the returned JSX: a `//` comment
  // placed after `return (` is legal, but some editors' TS services mis-parse
  // it and report phantom syntax errors.
  return (
    <html lang="id" className={`${roboto.variable} h-full`} suppressHydrationWarning>
      <body className="min-h-full bg-background text-foreground font-sans antialiased">
        <ThemeProvider
          attribute="data-theme"
          defaultTheme="light"
          disableTransitionOnChange
          nonce={nonce}
        >
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}