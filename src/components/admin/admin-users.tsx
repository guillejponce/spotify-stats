"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { UserRole, UserStatus } from "@/lib/user-context";

type AdminUser = {
  id: string;
  email: string | null;
  display_name: string | null;
  avatar_url: string | null;
  role: UserRole;
  status: UserStatus;
  created_at: string;
};

type Invite = { email: string; created_at: string; used_at: string | null };

const STATUS_LABEL: Record<UserStatus, string> = {
  active: "Activo",
  pending: "Pendiente",
  blocked: "Bloqueado",
};

const STATUS_CLASS: Record<UserStatus, string> = {
  active: "bg-spotify-green/15 text-spotify-green",
  pending: "bg-yellow-500/15 text-yellow-300",
  blocked: "bg-red-500/15 text-red-300",
};

export function AdminUsers() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/users", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Error");
      setUsers(data.users);
      setInvites(data.invites);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const run = async (key: string, fn: () => Promise<Response>) => {
    setBusy(key);
    try {
      const res = await fn();
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `Error ${res.status}`);
      }
      await load();
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
      return false;
    } finally {
      setBusy(null);
    }
  };

  const setStatus = (id: string, status: UserStatus) =>
    run(`user:${id}`, () =>
      fetch(`/api/admin/users/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      })
    );

  const invite = async (e: React.FormEvent) => {
    e.preventDefault();
    const ok = await run("invite", () =>
      fetch("/api/admin/invites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      })
    );
    if (ok) setEmail("");
  };

  const removeInvite = (inviteEmail: string) =>
    run(`invite:${inviteEmail}`, () =>
      fetch(`/api/admin/invites?email=${encodeURIComponent(inviteEmail)}`, {
        method: "DELETE",
      })
    );

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-spotify-light-gray">
        <Loader2 className="h-4 w-4 animate-spin" /> Cargando…
      </div>
    );
  }

  const pendingInvites = invites.filter((i) => !i.used_at);

  return (
    <div className="space-y-6">
      {error && (
        <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-300" role="alert">
          {error}
        </p>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Invitar</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <form onSubmit={invite} className="flex flex-col gap-2 sm:flex-row">
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="email de la cuenta de Spotify"
              className="h-10 flex-1 rounded-full border border-white/10 bg-spotify-black px-4 text-sm text-white placeholder:text-spotify-light-gray/60 focus:border-spotify-green focus:outline-none"
            />
            <Button type="submit" disabled={busy === "invite"}>
              {busy === "invite" ? <Loader2 className="h-4 w-4 animate-spin" /> : "Invitar"}
            </Button>
          </form>
          <p className="text-xs text-spotify-light-gray">
            Si la app de Spotify está en modo desarrollo, agrega también ese email en
            User Management del Spotify Developer Dashboard.
          </p>
          {pendingInvites.length > 0 && (
            <ul className="space-y-2">
              {pendingInvites.map((i) => (
                <li
                  key={i.email}
                  className="flex items-center justify-between rounded-lg bg-white/5 px-3 py-2 text-sm text-white"
                >
                  <span className="truncate">{i.email}</span>
                  <button
                    type="button"
                    onClick={() => removeInvite(i.email)}
                    disabled={busy === `invite:${i.email}`}
                    className="text-spotify-light-gray hover:text-red-300"
                    aria-label={`Quitar invitación de ${i.email}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Cuentas</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {users.map((u) => (
            <div
              key={u.id}
              className="flex flex-col gap-3 rounded-lg bg-white/5 p-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="flex min-w-0 items-center gap-3">
                {u.avatar_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={u.avatar_url} alt="" className="h-9 w-9 rounded-full object-cover" />
                ) : (
                  <div className="h-9 w-9 rounded-full bg-white/10" />
                )}
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-white">
                    {u.display_name ?? u.email ?? u.id}
                    {u.role === "admin" && (
                      <span className="ml-2 text-xs text-spotify-green">admin</span>
                    )}
                  </p>
                  <p className="truncate text-xs text-spotify-light-gray">{u.email}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className={`rounded-full px-2 py-0.5 text-xs ${STATUS_CLASS[u.status]}`}>
                  {STATUS_LABEL[u.status]}
                </span>
                {u.role !== "admin" && (
                  <>
                    {u.status !== "active" && (
                      <Button
                        size="sm"
                        disabled={busy === `user:${u.id}`}
                        onClick={() => setStatus(u.id, "active")}
                      >
                        Aprobar
                      </Button>
                    )}
                    {u.status !== "blocked" && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busy === `user:${u.id}`}
                        onClick={() => setStatus(u.id, "blocked")}
                      >
                        Bloquear
                      </Button>
                    )}
                  </>
                )}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
