"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

export function SetlistConnect({ username }: { username: string | null }) {
  const router = useRouter();
  const [value, setValue] = useState(username ?? "");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/concerts/account", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: value }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "No se pudo conectar");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo conectar");
    } finally {
      setBusy(false);
    }
  }

  async function disconnect() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/concerts/account", { method: "DELETE" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "No se pudo desconectar");
      setValue("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo desconectar");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={save} className="space-y-3">
      <label className="block text-sm text-spotify-light-gray" htmlFor="setlist-user">
        Usuario de setlist.fm
      </label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          id="setlist-user"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder="tu usuario o el link del perfil"
          className="h-10 w-full rounded-full border border-white/10 bg-spotify-black px-4 text-sm text-white placeholder:text-spotify-light-gray/75 focus:border-spotify-green focus:outline-none"
        />
        <Button type="submit" disabled={busy || !value.trim()}>
          {username ? "Guardar" : "Conectar"}
        </Button>
        {username && (
          <Button type="button" variant="outline" disabled={busy} onClick={disconnect}>
            Desconectar
          </Button>
        )}
      </div>
      {error && <p className="text-sm text-red-300">{error}</p>}
    </form>
  );
}
