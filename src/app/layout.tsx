import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Sidebar } from "@/components/sidebar";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

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
        <main className="min-h-screen bg-spotify-black lg:pl-64">
          <div className="mx-auto max-w-7xl px-4 py-8 pt-16 lg:px-8 lg:pt-8">
            {children}
          </div>
        </main>
      </body>
    </html>
  );
}
