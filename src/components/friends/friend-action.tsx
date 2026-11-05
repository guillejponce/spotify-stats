"use client";

import { useState } from "react";
import { Check, Loader2, UserMinus, UserPlus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Relation } from "@/lib/friends";

async function call(input: string, init?: RequestInit): Promise<void> {
  const res = await fetch(input, init);
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error ?? `Error ${res.status}`);
  }
}

export const friendApi = {
  request: (userId: string) =>
    call("/api/friends", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId }),
    }),
  respond: (friendshipId: string, accept: boolean) =>
    call(`/api/friends/${friendshipId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accept }),
    }),
  remove: (userId: string) =>
    call(`/api/friends?userId=${encodeURIComponent(userId)}`, { method: "DELETE" }),
};

/** Botón según la relación; `onChange` recarga la vista que lo contiene. */
export function FriendAction({
  userId,
  relation,
  onChange,
  onError,
}: {
  userId: string;
  relation: Relation;
  onChange: () => void | Promise<void>;
  onError?: (message: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
      await onChange();
    } catch (e) {
      onError?.(e instanceof Error ? e.message : "Error");
    } finally {
      setBusy(false);
      setConfirmRemove(false);
    }
  };

  if (relation === "self") return null;
  if (busy) {
    return (
      <Button size="sm" variant="secondary" disabled>
        <Loader2 className="h-4 w-4 animate-spin" />
      </Button>
    );
  }

  if (relation === "none") {
    return (
      <Button size="sm" onClick={() => run(() => friendApi.request(userId))}>
        <UserPlus className="mr-1.5 h-4 w-4" /> Agregar
      </Button>
    );
  }
  if (relation === "incoming") {
    return (
      <Button size="sm" onClick={() => run(() => friendApi.request(userId))}>
        <Check className="mr-1.5 h-4 w-4" /> Aceptar
      </Button>
    );
  }
  if (relation === "outgoing") {
    return (
      <Button size="sm" variant="outline" onClick={() => run(() => friendApi.remove(userId))}>
        <X className="mr-1.5 h-4 w-4" /> Cancelar solicitud
      </Button>
    );
  }
  return confirmRemove ? (
    <div className="flex items-center gap-2">
      <Button size="sm" variant="destructive" onClick={() => run(() => friendApi.remove(userId))}>
        Eliminar
      </Button>
      <Button size="sm" variant="ghost" onClick={() => setConfirmRemove(false)}>
        No
      </Button>
    </div>
  ) : (
    <Button size="sm" variant="outline" onClick={() => setConfirmRemove(true)}>
      <UserMinus className="mr-1.5 h-4 w-4" /> Amigos
    </Button>
  );
}
