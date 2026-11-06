import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { AppChrome } from "@/components/app-chrome";
import { SessionProvider, type ClientSession } from "@/components/session-provider";
import { getProfile, getSessionUserId } from "@/lib/auth";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  viewportFit: "cover",
  themeColor: "#121212",
};

export const metadata: Metadata = {
  title: "Statsify · Tu escucha en Spotify",
  description:
    "Dashboard personal de Spotify con tu escucha en vivo e histórica.",
  manifest: "/manifest.json",
  icons: {
    icon: [
      { url: "/icons/icon-32x32.png", sizes: "32x32", type: "image/png" },
      { url: "/icons/icon-16x16.png", sizes: "16x16", type: "image/png" },
    ],
    apple: [
      { url: "/icons/icon-180x180.png", sizes: "180x180", type: "image/png" },
    ],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Statsify",
  },
};

async function loadClientSession(): Promise<ClientSession> {
  const userId = await getSessionUserId();
  if (!userId) return null;
  const profile = await getProfile(userId);
  if (!profile || profile.status !== "active") return null;
  return {
    userId,
    role: profile.role,
    displayName: profile.display_name,
    avatarUrl: profile.avatar_url,
    email: profile.email,
  };
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await loadClientSession();
  return (
    <html lang="es" className="dark">
      <body className={`${inter.variable} font-sans antialiased`}>
        <SessionProvider session={session}>
          <AppChrome>{children}</AppChrome>
        </SessionProvider>
      </body>
    </html>
  );
}
