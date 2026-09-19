import { parseTempoBpm } from "@/lib/chordpro";

/** Hoja vacía con tono/BPM medidos. No inventa acordes. */
export function buildChartFrame(input: {
  title: string;
  artist?: string | null;
  key?: string | null;
  tempo?: number | null;
}): string {
  const title = input.title.trim();
  const artist = (input.artist ?? "").trim();
  const tempo = parseTempoBpm(input.tempo);
  const key = input.key?.trim() || null;

  const banner =
    key || tempo != null
      ? "{comment: Tono y BPM de Spotify. Acordes y letra los pegás vos.}"
      : "{comment: Spotify no entregó tono/BPM. Pegá acordes y letra vos.}";

  const header = [
    banner,
    `{title: ${title}}`,
    artist ? `{artist: ${artist}}` : null,
    key ? `{key: ${key}}` : null,
    tempo != null ? `{tempo: ${tempo}}` : null,
  ].filter((line): line is string => Boolean(line));

  return [
    ...header,
    "",
    "{start_of_intro}",
    "",
    "{end_of_intro}",
    "",
    "{start_of_verse}",
    "",
    "{end_of_verse}",
    "",
    "{start_of_chorus}",
    "",
    "{end_of_chorus}",
  ].join("\n");
}
