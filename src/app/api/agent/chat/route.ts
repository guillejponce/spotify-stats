import { NextRequest } from "next/server";
import { normalizeHistory, runAgent } from "@/lib/agent/run";

export const dynamic = "force-dynamic";
export const maxDuration = 60;
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  if (!process.env.OPENAI_API_KEY?.trim()) {
    return Response.json(
      {
        error:
          "Falta OPENAI_API_KEY. Ponela en .env.local (API de platform.openai.com, no ChatGPT Plus).",
      },
      { status: 503 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "JSON inválido" }, { status: 400 });
  }

  const history = normalizeHistory(
    body && typeof body === "object"
      ? (body as { messages?: unknown }).messages
      : [],
  );

  if (history.length === 0) {
    return Response.json({ error: "Manda al menos un mensaje" }, { status: 400 });
  }
  if (history[history.length - 1]?.role !== "user") {
    return Response.json({ error: "El último mensaje tiene que ser tuyo" }, { status: 400 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (payload: unknown) => {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify(payload)}\n\n`),
        );
      };
      try {
        await runAgent(history, send);
        send({ type: "done" });
      } catch (err) {
        const message =
          err instanceof Error && err.message === "MISSING_OPENAI_KEY"
            ? "Falta OPENAI_API_KEY"
            : err instanceof Error
              ? err.message
              : "El agente falló";
        console.error("[agent/chat]", err);
        send({ type: "error", message });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
