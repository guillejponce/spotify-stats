"use client";

import { createContext, useContext } from "react";
import type { UserRole } from "@/lib/user-context";

export type ClientSession = {
  userId: string;
  role: UserRole;
  displayName: string | null;
  avatarUrl: string | null;
  email: string | null;
} | null;

const SessionContext = createContext<ClientSession>(null);

export function SessionProvider({
  session,
  children,
}: {
  session: ClientSession;
  children: React.ReactNode;
}) {
  return <SessionContext.Provider value={session}>{children}</SessionContext.Provider>;
}

export function useSession(): ClientSession {
  return useContext(SessionContext);
}

export function useIsAdmin(): boolean {
  return useContext(SessionContext)?.role === "admin";
}
