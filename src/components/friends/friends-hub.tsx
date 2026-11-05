"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Loader2, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { UserAvatar } from "@/components/friends/user-avatar";
import { FriendAction, friendApi } from "@/components/friends/friend-action";
import type { FriendEntry, PublicProfile, Relation } from "@/lib/friends";

type Lists = { friends: FriendEntry[]; incoming: FriendEntry[]; outgoing: FriendEntry[] };
type SearchResult = PublicProfile & { relation: Relation };

function PersonRow({
  profile,
  children,
}: {
  profile: PublicProfile;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg bg-white/5 p-3">
      <Link href={`/u/${profile.id}`} className="flex min-w-0 items-center gap-3 hover:opacity-90">
        <UserAvatar url={profile.avatar_url} name={profile.display_name} />
        <span className="truncate text-sm font-medium text-white">
          {profile.display_name ?? "Sin nombre"}
        </span>
      </Link>
      <div className="flex shrink-0 items-center gap-2">{children}</div>
    </div>
  );
}

export function FriendsHub() {
  const [lists, setLists] = useState<Lists | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const searchSeq = useRef(0);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/friends", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Error");
      setLists(data);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar");
    }
  }, []);

  const runSearch = useCallback(async (q: string) => {
    const seq = ++searchSeq.current;
    if (q.trim().length < 2) {
      setResults(null);
      setSearching(false);
      return;
    }
    setSearching(true);
    try {
      const res = await fetch(`/api/users/search?q=${encodeURIComponent(q)}`, { cache: "no-store" });
      const data = await res.json();
      if (seq !== searchSeq.current) return;
      if (!res.ok) throw new Error(data.error ?? "Error");
      setResults(data.users);
    } catch (e) {
      if (seq === searchSeq.current) setError(e instanceof Error ? e.message : "Error al buscar");
    } finally {
      if (seq === searchSeq.current) setSearching(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const t = setTimeout(() => runSearch(query), 300);
    return () => clearTimeout(t);
  }, [query, runSearch]);

  const refresh = async () => {
    await Promise.all([load(), runSearch(query)]);
  };

  const respond = async (entry: FriendEntry, accept: boolean) => {
    setBusy(entry.friendshipId);
    try {
      await friendApi.respond(entry.friendshipId, accept);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setBusy(null);
    }
  };

  if (!lists && !error) {
    return (
      <div className="flex items-center gap-2 text-sm text-spotify-light-gray">
        <Loader2 className="h-4 w-4 animate-spin" /> Cargando…
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {error && (
        <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-300" role="alert">
          {error}
        </p>
      )}

      {lists && lists.incoming.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Solicitudes recibidas</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {lists.incoming.map((entry) => (
              <PersonRow key={entry.friendshipId} profile={entry.profile}>
                {busy === entry.friendshipId ? (
                  <Loader2 className="h-4 w-4 animate-spin text-spotify-light-gray" />
                ) : (
                  <>
                    <Button size="sm" onClick={() => respond(entry, true)}>
                      <Check className="mr-1.5 h-4 w-4" /> Aceptar
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label="Rechazar"
                      onClick={() => respond(entry, false)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </>
                )}
              </PersonRow>
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Buscar personas</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-spotify-light-gray" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Nombre en Spotify"
              className="h-10 w-full rounded-full border border-white/10 bg-spotify-black pl-10 pr-4 text-sm text-white placeholder:text-spotify-light-gray/60 focus:border-spotify-green focus:outline-none"
            />
            {searching && (
              <Loader2 className="absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-spotify-light-gray" />
            )}
          </div>
          {results && results.length === 0 && !searching && (
            <p className="text-sm text-spotify-light-gray">No encontré a nadie con ese nombre.</p>
          )}
          {results?.map((u) => (
            <PersonRow key={u.id} profile={u}>
              <FriendAction userId={u.id} relation={u.relation} onChange={refresh} onError={setError} />
            </PersonRow>
          ))}
        </CardContent>
      </Card>

      {lists && (
        <Card>
          <CardHeader>
            <CardTitle>Amigos ({lists.friends.length})</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {lists.friends.length === 0 && (
              <p className="text-sm text-spotify-light-gray">
                Todavía no tienes amigos en Statsify. Búscalos por su nombre de Spotify.
              </p>
            )}
            {lists.friends.map((entry) => (
              <PersonRow key={entry.friendshipId} profile={entry.profile}>
                <FriendAction
                  userId={entry.profile.id}
                  relation="friends"
                  onChange={refresh}
                  onError={setError}
                />
              </PersonRow>
            ))}
          </CardContent>
        </Card>
      )}

      {lists && lists.outgoing.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Solicitudes enviadas</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {lists.outgoing.map((entry) => (
              <PersonRow key={entry.friendshipId} profile={entry.profile}>
                <FriendAction
                  userId={entry.profile.id}
                  relation="outgoing"
                  onChange={refresh}
                  onError={setError}
                />
              </PersonRow>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
