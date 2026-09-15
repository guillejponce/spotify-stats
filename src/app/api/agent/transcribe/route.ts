import OpenAI, { toFile } from "openai";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 30;

const MAX_BYTES = 8 * 1024 * 1024;

export async function POST(request: Request) {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    return Response.json({ error: "Falta OPENAI_API_KEY" }, { status: 503 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return Response.json({ error: "Audio inválido" }, { status: 400 });
  }

  const audio = form.get("audio");
  if (!(audio instanceof Blob) || audio.size < 400) {
    return Response.json(
      { error: "No se escuchó nada. Prueba de nuevo." },
      { status: 400 },
    );
  }
  if (audio.size > MAX_BYTES) {
    return Response.json({ error: "El audio es demasiado largo" }, { status: 413 });
  }

  const mime = audio.type || "audio/webm";
  const ext = mime.includes("mp4") || mime.includes("aac") ? "m4a" : "webm";
  const openai = new OpenAI({ apiKey });

  try {
    const file = await toFile(Buffer.from(await audio.arrayBuffer()), `clip.${ext}`, {
      type: mime,
    });
    const result = await openai.audio.transcriptions.create({
      file,
      model: "whisper-1",
      language: "es",
    });
    const text = (result.text ?? "").trim();
    if (!text) {
      return Response.json(
        { error: "No entendí. Prueba hablar un poco más cerca." },
        { status: 422 },
      );
    }
    return Response.json({ text });
  } catch (err) {
    console.error("[agent/transcribe]", err);
    return Response.json(
      { error: "No se pudo transcribir el audio" },
      { status: 502 },
    );
  }
}
