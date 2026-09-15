"use client";

import { useCallback, useEffect, useState } from "react";
import { Bell, BellOff, Loader2, Send } from "lucide-react";
import { Button } from "@/components/ui/button";

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) out[i] = raw.charCodeAt(i);
  return out;
}

function isIosSafari(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  const iOS = /iPad|iPhone|iPod/.test(ua);
  const webkit = /WebKit/.test(ua);
  const crios = /CriOS|FxiOS/.test(ua);
  return iOS && webkit && !crios;
}

function isStandalonePwa(): boolean {
  if (typeof window === "undefined") return false;
  const media = window.matchMedia("(display-mode: standalone)").matches;
  const nav = window.navigator as Navigator & { standalone?: boolean };
  return media || Boolean(nav.standalone);
}

type Status =
  | "loading"
  | "unsupported"
  | "disabled"
  | "prompt"
  | "subscribed"
  | "error";

async function registerSw(): Promise<ServiceWorkerRegistration> {
  const reg = await navigator.serviceWorker.register("/sw.js", {
    scope: "/",
    updateViaCache: "none",
  });
  await reg.update();
  return navigator.serviceWorker.ready;
}

export function PushNotificationsToggle({
  compact = false,
}: {
  compact?: boolean;
}) {
  const [status, setStatus] = useState<Status>("loading");
  const [busy, setBusy] = useState(false);
  const [testing, setTesting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [okMessage, setOkMessage] = useState<string | null>(null);
  const [iosHint, setIosHint] = useState(false);

  const refresh = useCallback(async () => {
    if (
      typeof window === "undefined" ||
      !("serviceWorker" in navigator) ||
      !("PushManager" in window) ||
      !("Notification" in window)
    ) {
      setStatus("unsupported");
      if (isIosSafari() && !isStandalonePwa()) {
        setIosHint(true);
        setMessage(
          "En iPhone: Compartir → Agregar a inicio, y abre Statsify desde el ícono. Safari en pestaña no recibe push.",
        );
      }
      return;
    }

    const vapidRes = await fetch("/api/push/vapid");
    const vapid = await vapidRes.json();
    if (!vapid.configured || !vapid.publicKey) {
      setStatus("disabled");
      setMessage("Configura las claves VAPID en el servidor (Vercel).");
      return;
    }

    if (isIosSafari() && !isStandalonePwa()) {
      setIosHint(true);
    }

    await registerSw();
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

  async function sendTest(endpoint?: string) {
    const res = await fetch("/api/push/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        endpoint,
        title: "Kurt CubAIn de prueba",
        body: "Si ves esto, las amenazas van a llegar. Un día sin música y me disparo.",
      }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || json.ok === false) {
      throw new Error(json.error || "No se pudo enviar la prueba");
    }
  }

  async function enable() {
    setBusy(true);
    setMessage(null);
    setOkMessage(null);
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

      const reg = await registerSw();
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(
          vapid.publicKey,
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
      try {
        await sendTest(json.endpoint);
        setOkMessage("Suscrito. Debería haberte llegado una prueba ahora.");
      } catch (e) {
        setMessage(
          e instanceof Error
            ? `Suscrito, pero la prueba falló: ${e.message}`
            : "Suscrito, pero la prueba falló.",
        );
      }
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
    setOkMessage(null);
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

  async function testNow() {
    setTesting(true);
    setMessage(null);
    setOkMessage(null);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      await sendTest(sub?.endpoint);
      setOkMessage("Prueba enviada. Si no llega, revisa el permiso y el SW.");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setTesting(false);
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
    <div className={compact ? "space-y-1.5" : "space-y-1.5 px-2 pb-3 sm:px-3"}>
      {status === "subscribed" ? (
        <div className="space-y-1.5">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="w-full justify-start gap-2"
            disabled={testing}
            onClick={() => void testNow()}
          >
            {testing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4 text-spotify-green" />
            )}
            Probar notificación
          </Button>
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
        </div>
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
        Kurt te amenaza si un día no escuchas (y también avisa subidas de ranking).
      </p>
      {iosHint && (
        <p className="px-1 text-[11px] leading-snug text-amber-300/80">
          iPhone: agrega la app a inicio y ábrela desde ahí, o Safari no entrega
          el push.
        </p>
      )}
      {okMessage && (
        <p className="px-1 text-[11px] text-spotify-green">{okMessage}</p>
      )}
      {message && (
        <p className="px-1 text-[11px] text-rose-400/90">{message}</p>
      )}
    </div>
  );
}
