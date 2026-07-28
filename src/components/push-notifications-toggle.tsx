"use client";

import { useCallback, useEffect, useState } from "react";
import { Bell, BellOff, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) out[i] = raw.charCodeAt(i);
  return out;
}

type Status = "loading" | "unsupported" | "disabled" | "prompt" | "subscribed" | "error";

export function PushNotificationsToggle() {
  const [status, setStatus] = useState<Status>("loading");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (
      typeof window === "undefined" ||
      !("serviceWorker" in navigator) ||
      !("PushManager" in window) ||
      !("Notification" in window)
    ) {
      setStatus("unsupported");
      return;
    }

    const vapidRes = await fetch("/api/push/vapid");
    const vapid = await vapidRes.json();
    if (!vapid.configured || !vapid.publicKey) {
      setStatus("disabled");
      setMessage("Configurá las claves VAPID en el servidor.");
      return;
    }

    await navigator.serviceWorker.register("/sw.js");
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (sub) {
      setStatus("subscribed");
      return;
    }
    setStatus(Notification.permission === "denied" ? "error" : "prompt");
    if (Notification.permission === "denied") {
      setMessage("Permiso de notificaciones bloqueado en el navegador.");
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function enable() {
    setBusy(true);
    setMessage(null);
    try {
      const vapidRes = await fetch("/api/push/vapid");
      const vapid = await vapidRes.json();
      if (!vapid.publicKey) throw new Error("Sin clave VAPID");

      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setStatus("error");
        setMessage("No se otorgó permiso para notificaciones.");
        return;
      }

      await navigator.serviceWorker.register("/sw.js");
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(
          vapid.publicKey
        ) as BufferSource,
      });

      const json = sub.toJSON();
      const res = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(json),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Error al suscribir");
      }
      setStatus("subscribed");
    } catch (e) {
      setStatus("error");
      setMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    setMessage(null);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await fetch("/api/push/subscribe", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        });
        await sub.unsubscribe();
      }
      setStatus("prompt");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  if (status === "loading") {
    return (
      <div className="flex items-center gap-2 px-3 py-2 text-xs text-spotify-light-gray">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Notificaciones…
      </div>
    );
  }

  if (status === "unsupported" || status === "disabled") {
    return (
      <p className="px-3 py-2 text-[11px] leading-snug text-spotify-light-gray/60">
        {message || "Push no disponible en este dispositivo."}
      </p>
    );
  }

  return (
    <div className="space-y-1.5 px-2 pb-3 sm:px-3">
      {status === "subscribed" ? (
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="w-full justify-start gap-2"
          disabled={busy}
          onClick={() => void disable()}
        >
          {busy ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <BellOff className="h-4 w-4" />
          )}
          Desactivar pushes
        </Button>
      ) : (
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="w-full justify-start gap-2"
          disabled={busy || status === "error"}
          onClick={() => void enable()}
        >
          {busy ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Bell className="h-4 w-4 text-spotify-green" />
          )}
          Activar notificaciones
        </Button>
      )}
      <p className="px-1 text-[11px] leading-snug text-spotify-light-gray/55">
        Avisos cuando una canción o artista sube en el top 100 (o salta +100
        puestos en un mes).
      </p>
      {message && (
        <p className="px-1 text-[11px] text-rose-400/90">{message}</p>
      )}
    </div>
  );
}
