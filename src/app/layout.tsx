import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Sidebar } from "@/components/sidebar";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  viewportFit: "cover",
  themeColor: "#121212",
};

export const metadata: Metadata = {
  title: "Spotify Stats - Your Music Dashboard",
  description:
    "Personal Spotify companion dashboard showing live and historical listening data.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className={`${inter.variable} font-sans antialiased`}>
        <Sidebar />
        <main className="min-h-[100dvh] bg-spotify-black pb-[max(1.25rem,env(safe-area-inset-bottom))] lg:pl-64">
          <div className="mx-auto max-w-7xl px-3 py-6 pt-[max(4.25rem,env(safe-area-inset-top)+3rem)] sm:px-4 sm:py-8 lg:px-8 lg:pt-8">
            {children}
          </div>
        </main>
      </body>
    </html>
  );
}
