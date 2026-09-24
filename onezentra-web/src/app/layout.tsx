import type { Metadata } from "next";
import { Roboto } from "next/font/google";
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

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id" className={`${roboto.variable} h-full`}>
      <body className="min-h-full bg-surface text-foreground font-sans antialiased">
        {children}
      </body>
    </html>
  );
}