import OpenAI from "openai";
import {
  ensureChartHeader,
  parseChordPro,
  parseTempoBpm,
  stripLyricsFromChordPro,
} from "@/lib/chordpro";

const MODEL = process.env.OPENAI_MODEL?.trim() || "gpt-4o-mini";

const SYSTEM = `You write unofficial harmonic SKETCHES in ChordPro.
Return ONLY ChordPro text. No markdown fences. No lyrics. No verse text.

Allowed:
- {title} {artist} {key} {tempo} {capo} {comment} {start_of_verse} {end_of_verse} {start_of_chorus} {end_of_chorus} {start_of_bridge} {end_of_bridge}
- Lines that are only chord tokens in brackets, e.g. [Bm] [A] [G]
- [N.C.]

Forbidden:
- Any sung words, syllables, or quoted lyrics
- Copying a published tab/chart
- URLs

This is a guess: typical key, section order (intro / verse / chorus / bridge), and a plausible progression. Always include {tempo: N} with an integer BPM. Keep it short (intro + 2 verses + chorus + optional bridge).`;

export async function generateChartSkeleton(input: {
  title: string;
  artist: string;
  tempo?: number | null;
}): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("Falta OPENAI_API_KEY en el servidor");
  }

  const title = input.title.trim().slice(0, 160);
  const artist = input.artist.trim().slice(0, 160);
  const tempo = parseTempoBpm(input.tempo);
  if (!title) throw new Error("Falta el título");

  const openai = new OpenAI({ apiKey });
  const tempoHint =
    tempo != null
      ? ` Use exactly {tempo: ${tempo}} (measured BPM).`
      : " Include a plausible {tempo: N} integer BPM.";
  const completion = await openai.chat.completions.create({
    model: MODEL,
    temperature: 0.4,
    max_tokens: 900,
    messages: [
      { role: "system", content: SYSTEM },
      {
        role: "user",
        content: `Sketch chords only for "${title}"${artist ? ` by ${artist}` : ""}.${tempoHint}`,
      },
    ],
  });

  const raw = completion.choices[0]?.message?.content?.trim() ?? "";
  const cleaned = stripLyricsFromChordPro(
    raw.replace(/^```(?:chordpro|cho)?\s*/i, "").replace(/```$/i, ""),
  );
  if (!cleaned || !/\[[A-G]/.test(cleaned)) {
    throw new Error("No se pudo armar un esqueleto de acordes");
  }

  const withHeader = ensureChartHeader(cleaned, { title, artist, tempo });
  const parsed = parseChordPro(withHeader);
  const banner =
    "{comment: Esqueleto tentativo — sin letra. Completalo vos.}";
  if (parsed.lines.some((l) => l.kind === "comment" && /esqueleto/i.test(l.text))) {
    return withHeader;
  }
  return `${banner}\n${withHeader}`;
}
