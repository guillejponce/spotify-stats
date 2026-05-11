"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { HistoryPlay, HistoryApiResponse } from "@/types/history";

const POLL_MS = 10_000;

type HookOptions = {
  /** Tamaño de página (servidor puede pedir +1 para `has_more` exacto). */
  limit?: number;
};

export function useHistoryPlays(opts: HookOptions = {}) {
  const limit = opts.limit ?? 50;

  const [page, setPage] = useState(0);
  const [plays, setPlays] = useState<HistoryPlay[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  /** Refresco silencioso (no tapa lista con skeleton). */
  const [silentBusy, setSilentBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [generatedAt, setGeneratedAt] = useState<Date | null>(null);
  const [freshBatch, setFreshBatch] = useState(false);

  const abortRef = useRef<AbortController | null>(null);
  const newestIdRef = useRef<string | null>(null);
  const freshHideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const runFetch = useCallback(
    async (mode: "full" | "silent") => {
      abortRef.current?.abort();
      const ac = new AbortController();
      abortRef.current = ac;

      if (mode === "full") {
        setLoading(true);
      } else {
        setSilentBusy(true);
      }
      setError(null);

      try {
        const offset = page * limit;
        const params = new URLSearchParams({
          offset: String(offset),
          limit: String(limit),
          _t: String(Date.now()),
        });

        const res = await fetch(`/api/history?${params}`, {
          cache: "no-store",
          signal: ac.signal,
          headers: { Accept: "application/json" },
        });

        if (!res.ok) {
          const msg =
            res.status === 504 || res.status === 502
              ? "Sin respuesta del servidor. Reintentá en un momento."
              : `No pudimos cargar el historial (${res.status}).`;
          throw new Error(msg);
        }

        const payload = (await res.json()) as HistoryApiResponse;
        const list = payload.plays ?? [];

        setPlays(list);
        setHasMore(Boolean(payload.has_more));
        setGeneratedAt(
          payload.generated_at ? new Date(payload.generated_at) : new Date(),
        );

        /* Señalar nuevos registros sólo en la primera página durante refrescos en segundo plano. */
        if (mode === "silent" && page === 0) {
          if (list.length > 0) {
            const top = list[0]!.id;
            if (newestIdRef.current && newestIdRef.current !== top) {
              const prev = freshHideTimerRef.current;
              if (prev != null) clearTimeout(prev);
              setFreshBatch(true);
              freshHideTimerRef.current = setTimeout(() => {
                freshHideTimerRef.current = null;
                setFreshBatch(false);
              }, 5_000);
            }
            newestIdRef.current = top;
          }
        } else if (mode === "full" && list.length > 0) {
          newestIdRef.current = list[0]!.id;
        }
      } catch (e) {
        if (e instanceof DOMException && e.name === "AbortError") return;
        const msg = e instanceof Error ? e.message : "Error al cargar historial";
        setError(msg);
      } finally {
        if (mode === "full") setLoading(false);
        setSilentBusy(false);
      }
    },
    [page, limit],
  );

  const refresh = useCallback(() => {
    const t = freshHideTimerRef.current;
    if (t != null) clearTimeout(t);
    freshHideTimerRef.current = null;
    setFreshBatch(false);
    void runFetch("full");
  }, [runFetch]);

  useEffect(() => {
    newestIdRef.current = null;
    const t = freshHideTimerRef.current;
    if (t != null) clearTimeout(t);
    freshHideTimerRef.current = null;
    setFreshBatch(false);
  }, [page]);

  useEffect(() => {
    void runFetch("full");
    return () => abortRef.current?.abort();
  }, [runFetch]);

  /* Polling en primera página: historial “vivo” sin depender del cron del usuario. */
  useEffect(() => {
    if (page !== 0) return;

    const tick = () => {
      if (document.visibilityState !== "visible") return;
      void runFetch("silent");
    };

    const id = window.setInterval(tick, POLL_MS);
    const onVis = () => {
      if (document.visibilityState === "visible") tick();
    };
    const onFocus = () => tick();
    const onOnline = () => tick();

    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("focus", onFocus);
    window.addEventListener("online", onOnline);

    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("online", onOnline);
    };
  }, [page, runFetch]);

  useEffect(
    () => () => {
      const t = freshHideTimerRef.current;
      if (t != null) clearTimeout(t);
      freshHideTimerRef.current = null;
    },
    [],
  );

  return {
    page,
    setPage,
    plays,
    hasMore,
    loading,
    silentBusy,
    error,
    generatedAt,
    freshBatch,
    clearFreshBadge: () => {
      const t = freshHideTimerRef.current;
      if (t != null) clearTimeout(t);
      freshHideTimerRef.current = null;
      setFreshBatch(false);
    },
    refresh,
    limit,
  };
}
