import OpenAI from "openai";
import { textForSpeech } from "@/lib/agent/voice";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 30;

const TTS1_VOICES = new Set([
  "alloy",
  "echo",
  "fable",
  "onyx",
  "nova",
  "shimmer",
]);

export async function POST(request: Request) {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    return Response.json({ error: "Falta OPENAI_API_KEY" }, { status: 503 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "JSON inválido" }, { status: 400 });
  }

  const raw =
    body && typeof body === "object"
      ? String((body as { text?: unknown }).text ?? "")
      : "";
  const text = textForSpeech(raw);
  if (!text) {
    return Response.json({ error: "Nada para leer" }, { status: 400 });
  }

  const preferred = process.env.OPENAI_TTS_VOICE?.trim().toLowerCase() ?? "nova";
  const voice = (TTS1_VOICES.has(preferred) ? preferred : "nova") as
    | "alloy"
    | "echo"
    | "fable"
    | "onyx"
    | "nova"
    | "shimmer";
  const openai = new OpenAI({ apiKey });

  try {
    const speech = await openai.audio.speech.create({
      model: "tts-1",
      voice,
      input: text,
      response_format: "mp3",
      speed: 1.05,
    });
    const bytes = Buffer.from(await speech.arrayBuffer());
    return new Response(bytes, {
      headers: {
        "Content-Type": "audio/mpeg",
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    console.error("[agent/speech]", err);
    return Response.json(
      { error: "No se pudo generar la voz" },
      { status: 502 },
    );
  }
}
