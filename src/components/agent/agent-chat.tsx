"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Bot, Loader2, Send, Sparkles, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";

type ChatRole = "user" | "assistant";

type ChatMessage = {
  id: string;
  role: ChatRole;
  content: string;
};

const STORAGE_KEY = "statsify-agent-chat-v1";

const SUGGESTIONS = [
  "¿Qué tanto escuché este año?",
  "Un día como hoy, ¿qué ponía?",
  "¿Hace cuánto que no escucho nada?",
  "Mis temas mejor valorados",
  "Ármame algo nostálgico con mi data",
];

function uid(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function parseSseBuffer(buffer: string): { events: unknown[]; rest: string } {
  const parts = buffer.split("\n\n");
  const rest = parts.pop() ?? "";
  const events: unknown[] = [];
  for (const part of parts) {
    const line = part
      .split("\n")
      .filter((l) => l.startsWith("data:"))
      .map((l) => l.slice(5).trim())
      .join("");
    if (!line) continue;
    try {
      events.push(JSON.parse(line));
    } catch {
      /* ignore incomplete json */
    }
  }
  return { events, rest };
}

function AgentMarkdown({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return (
    <>
      {parts.map((part, i) =>
        part.startsWith("**") && part.endsWith("**") ? (
          <strong key={i} className="font-semibold">
            {part.slice(2, -2)}
          </strong>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </>
  );
}

export function AgentChat({
  variant = "page",
  onClose,
}: {
  variant?: "page" | "dock";
  onClose?: () => void;
}) {
  const dock = variant === "dock";
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [supabaseOk, setSupabaseOk] = useState<boolean | null>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    void fetch("/api/agent/status")
      .then((r) => r.json())
      .then((d: { supabase?: boolean }) => setSupabaseOk(Boolean(d.supabase)))
      .catch(() => setSupabaseOk(null));
  }, []);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as ChatMessage[];
        if (Array.isArray(parsed)) setMessages(parsed.slice(-40));
      }
    } catch {
      /* ignore */
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(messages.slice(-40)));
  }, [messages, hydrated]);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages, status, busy]);

  async function send(text: string) {
    const content = text.trim();
    if (!content || busy) return;

    const userMsg: ChatMessage = { id: uid(), role: "user", content };
    const assistantId = uid();
    const nextHistory = [...messages, userMsg];

    setInput("");
    setError(null);
    setStatus("Pensando…");
    setBusy(true);
    setMessages([
      ...nextHistory,
      { id: assistantId, role: "assistant", content: "" },
    ]);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch("/api/agent/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: nextHistory.map((m) => ({
            role: m.role,
            content: m.content,
          })),
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const payload = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(payload?.error || `Error ${res.status}`);
      }
      if (!res.body) throw new Error("Sin respuesta del agente");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let assembled = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parsed = parseSseBuffer(buffer);
        buffer = parsed.rest;
        for (const event of parsed.events) {
          if (!event || typeof event !== "object") continue;
          const e = event as {
            type?: string;
            delta?: string;
            label?: string;
            message?: string;
          };
          if (e.type === "tool" && e.label) {
            setStatus(e.label);
          } else if (e.type === "text" && e.delta) {
            assembled += e.delta;
            setStatus(null);
            const snapshot = assembled;
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId ? { ...m, content: snapshot } : m,
              ),
            );
          } else if (e.type === "error") {
            throw new Error(e.message || "El agente falló");
          }
        }
      }

      if (!assembled.trim()) {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? {
                  ...m,
                  content: "No salió nada útil. Inténtalo de nuevo.",
                }
              : m,
          ),
        );
      }
    } catch (err) {
      if ((err as { name?: string }).name === "AbortError") return;
      const message = err instanceof Error ? err.message : "Falló el chat";
      setError(message);
      setMessages((prev) =>
        prev.filter((m) => m.id !== assistantId || m.content.trim()),
      );
    } finally {
      setBusy(false);
      setStatus(null);
      abortRef.current = null;
    }
  }

  function clearChat() {
    abortRef.current?.abort();
    setMessages([]);
    setError(null);
    setStatus(null);
    sessionStorage.removeItem(STORAGE_KEY);
  }

  const empty = hydrated && messages.length === 0;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className={cn("mb-3 flex items-start justify-between gap-3", dock && "mb-2")}>
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-spotify-green text-black">
            <Bot className="h-5 w-5" />
          </div>
          <div>
            <h1 className={cn("font-bold text-white", dock ? "text-base" : "text-2xl")}>
              DJ
            </h1>
            {!dock ? (
              <p className="text-sm text-spotify-light-gray">
                Historial, ratings, calendario y lo que está sonando.
              </p>
            ) : (
              <p className="text-[11px] text-spotify-light-gray">
                Tu asistente musical
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={clearChat}
            className="text-spotify-light-gray"
          >
            <Trash2 className="mr-2 h-4 w-4" />
            {dock ? "" : "Limpiar"}
          </Button>
          {onClose ? (
            <Button type="button" variant="ghost" size="sm" onClick={onClose}>
              Cerrar
            </Button>
          ) : null}
        </div>
      </div>

      {supabaseOk === false ? (
        <div className="mb-3 flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
          <p>
            El cerebro funciona, pero no ve tu historial: en{" "}
            <code className="text-amber-50">.env.local</code> faltan las keys de
            Supabase. Cópialas y reinicia el server.
          </p>
        </div>
      ) : null}

      <div
        ref={scrollerRef}
        className="min-h-0 flex-1 space-y-3 overflow-y-auto rounded-2xl border border-white/5 bg-black/30 p-3 sm:p-4"
      >
        {empty && (
          <div className="flex h-full min-h-[10rem] flex-col items-center justify-center gap-3 text-center">
            <Sparkles className="h-7 w-7 text-spotify-green" />
            <p className="max-w-md text-sm text-spotify-light-gray">
              Pregúntame por tus stats, un día como hoy, o que te arme algo nostálgico.
            </p>
            <div className="flex flex-wrap justify-center gap-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => send(s)}
                  className="rounded-full border border-white/10 bg-black/30 px-3 py-1.5 text-xs text-white hover:border-spotify-green/50 hover:bg-white/5"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m) => (
          <div
            key={m.id}
            className={cn(
              "flex",
              m.role === "user" ? "justify-end" : "justify-start",
            )}
          >
            <div
              className={cn(
                "max-w-[min(100%,40rem)] whitespace-pre-wrap rounded-2xl px-4 py-3 text-sm leading-relaxed",
                m.role === "user"
                  ? "bg-spotify-green text-black"
                  : "bg-spotify-medium-gray text-white",
              )}
            >
              {m.content ? (
                <AgentMarkdown text={m.content} />
              ) : (
                <span className="inline-flex items-center gap-2 text-spotify-light-gray">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {status ?? "…"}
                </span>
              )}
            </div>
          </div>
        ))}

        {busy && status && messages[messages.length - 1]?.content ? (
          <p className="text-xs text-spotify-light-gray/70">{status}</p>
        ) : null}
      </div>

      {error ? (
        <p className="mt-2 text-sm text-red-400">{error}</p>
      ) : null}

      <form
        className="mt-3 flex items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void send(input);
        }}
      >
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void send(input);
            }
          }}
          rows={dock ? 1 : 2}
          placeholder="Pregunta por stats, nostalgia o lo que está sonando…"
          disabled={busy}
          className="min-h-[2.75rem] flex-1 resize-none rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-sm text-white outline-none placeholder:text-spotify-light-gray/50 focus:border-spotify-green focus:ring-2 focus:ring-spotify-green/30 disabled:opacity-60"
        />
        <Button type="submit" disabled={busy || !input.trim()} className="h-11 px-4">
          {busy ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Send className="h-4 w-4" />
          )}
        </Button>
      </form>
    </div>
  );
}
