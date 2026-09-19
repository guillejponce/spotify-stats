export type ChartChord = { text: string; index: number };

export type ChartLine =
  | { kind: "music"; chords: ChartChord[]; lyric: string }
  | { kind: "comment"; text: string }
  | { kind: "blank" };

export type ParsedChart = {
  title: string | null;
  artist: string | null;
  key: string | null;
  capo: number | null;
  tempo: number | null;
  lines: ChartLine[];
};

const NOTE_SHARPS = [
  "C",
  "C#",
  "D",
  "D#",
  "E",
  "F",
  "F#",
  "G",
  "G#",
  "A",
  "A#",
  "B",
] as const;

const FLAT_TO_SHARP: Record<string, string> = {
  Db: "C#",
  Eb: "D#",
  Fb: "E",
  Gb: "F#",
  Ab: "G#",
  Bb: "A#",
  Cb: "B",
};

const CHORD_TOKEN =
  /^(N\.?C\.?|N\/C|[-xX]|[A-G](?:#|b|♯|♭)?(?:(?:maj|min|dim|aug|sus|add|m|M)?[0-9]*)*(?:sus[24]|add[0-9]+)?(?:\/[A-G](?:#|b|♯|♭)?)?)$/;

export function looksLikeChordToken(token: string): boolean {
  return CHORD_TOKEN.test(token.trim());
}

function expandInlineDirectives(line: string): string[] {
  const parts = line.match(/\{[^{}]+\}/g);
  if (!parts || parts.length < 2) return [line];
  if (line.replace(/\{[^{}]+\}/g, "").trim() !== "") return [line];
  return parts;
}

/** Quita verso/letra y deja solo directivas + acordes. */
export function stripLyricsFromChordPro(source: string): string {
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  const out: string[] = [];
  for (const rawLine of lines) {
    for (const raw of expandInlineDirectives(rawLine)) {
    const trimmed = raw.trim();
    if (!trimmed) {
      out.push("");
      continue;
    }
    if (trimmed.startsWith("#")) continue;
    if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
      out.push(trimmed);
      continue;
    }

    const chords: string[] = [];
    let leftover = "";
    let i = 0;
    while (i < raw.length) {
      if (raw[i] === "[") {
        const end = raw.indexOf("]", i + 1);
        if (end === -1) {
          leftover += raw[i];
          i += 1;
          continue;
        }
        const tok = raw.slice(i + 1, end).trim();
        if (looksLikeChordToken(tok)) chords.push(`[${tok}]`);
        i = end + 1;
        continue;
      }
      leftover += raw[i];
      i += 1;
    }

    const words = leftover.replace(/\s+/g, " ").trim();
    if (chords.length > 0) {
      out.push(chords.join(" "));
      continue;
    }
    if (!words) continue;
    if (words.split(/\s+/).every(looksLikeChordToken)) {
      out.push(words.split(/\s+/).map((t) => `[${t}]`).join(" "));
    }
    }
  }
  return out.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

export function looksLikeChordPro(text: string): boolean {
  return (
    /\{(?:title|t|artist|subtitle|st|key|capo)\s*:/i.test(text) ||
    /\[[A-G](?:#|b)?[^\]]{0,12}\]/.test(text)
  );
}

function normalizeNote(raw: string): { note: string; usedFlat: boolean } | null {
  const t = raw.replace("♯", "#").replace("♭", "b");
  if (NOTE_SHARPS.includes(t as (typeof NOTE_SHARPS)[number])) {
    return { note: t, usedFlat: false };
  }
  if (FLAT_TO_SHARP[t]) return { note: FLAT_TO_SHARP[t]!, usedFlat: true };
  return null;
}

export function transposeChord(chord: string, semitones: number): string {
  const trimmed = chord.trim();
  if (!trimmed || /^(N\.?C\.?|N\/C|[-xX])$/i.test(trimmed)) return trimmed;
  const steps = ((semitones % 12) + 12) % 12;
  if (steps === 0) return trimmed;

  const slash = trimmed.indexOf("/");
  const main = slash === -1 ? trimmed : trimmed.slice(0, slash);
  const bass = slash === -1 ? null : trimmed.slice(slash + 1);

  const shift = (part: string): string => {
    const m = part.match(/^([A-G](?:#|b|♯|♭)?)(.*)$/);
    if (!m) return part;
    const parsed = normalizeNote(m[1]!);
    if (!parsed) return part;
    const idx = NOTE_SHARPS.indexOf(parsed.note as (typeof NOTE_SHARPS)[number]);
    const next = NOTE_SHARPS[(idx + steps) % 12]!;
    return `${next}${m[2] ?? ""}`;
  };

  return bass ? `${shift(main)}/${shift(bass)}` : shift(main);
}

export function transposeKey(key: string | null, semitones: number): string | null {
  if (!key) return null;
  return transposeChord(key, semitones);
}

function parseDirective(line: string): { name: string; value: string } | null {
  const m = line.trim().match(/^\{([a-zA-Z_]+)(?::\s*(.*))?\}$/);
  if (!m) return null;
  return { name: m[1]!.toLowerCase(), value: (m[2] ?? "").trim() };
}

export function parseTempoBpm(value: string | number | null | undefined): number | null {
  if (typeof value === "number") {
    if (!Number.isFinite(value) || value < 40 || value > 240) return null;
    return Math.round(value);
  }
  if (!value) return null;
  const n = Number(String(value).replace(/[^\d.]/g, ""));
  if (!Number.isFinite(n) || n < 40 || n > 240) return null;
  return Math.round(n);
}

function parseMusicLine(raw: string): ChartLine {
  const chords: ChartChord[] = [];
  let lyric = "";
  let i = 0;
  while (i < raw.length) {
    if (raw[i] === "[") {
      const end = raw.indexOf("]", i + 1);
      if (end === -1) {
        lyric += raw[i];
        i += 1;
        continue;
      }
      const text = raw.slice(i + 1, end).trim();
      if (text) chords.push({ text, index: lyric.length });
      i = end + 1;
      continue;
    }
    lyric += raw[i];
    i += 1;
  }
  return { kind: "music", chords, lyric };
}

export function parseChordPro(source: string): ParsedChart {
  const parsed: ParsedChart = {
    title: null,
    artist: null,
    key: null,
    capo: null,
    tempo: null,
    lines: [],
  };

  const text = source.replace(/\r\n/g, "\n");
  for (const rawLine of text.split("\n")) {
    for (const raw of expandInlineDirectives(rawLine)) {
    const dir = parseDirective(raw);
    if (dir) {
      if (dir.name === "title" || dir.name === "t") parsed.title = dir.value || parsed.title;
      else if (dir.name === "artist" || dir.name === "subtitle" || dir.name === "st") {
        parsed.artist = dir.value || parsed.artist;
      } else if (dir.name === "key") parsed.key = dir.value || parsed.key;
      else if (dir.name === "tempo" || dir.name === "bpm") {
        parsed.tempo = parseTempoBpm(dir.value) ?? parsed.tempo;
      } else if (dir.name === "capo") {
        const n = Number(dir.value);
        if (Number.isFinite(n)) parsed.capo = Math.max(0, Math.min(12, Math.floor(n)));
      } else if (dir.name === "comment" || dir.name === "c" || dir.name === "comment_italic") {
        parsed.lines.push({ kind: "comment", text: dir.value });
      } else if (
        dir.name.startsWith("start_of_") ||
        dir.name.startsWith("end_of_") ||
        dir.name === "soc" ||
        dir.name === "eoc" ||
        dir.name === "sov" ||
        dir.name === "eov"
      ) {
        const label = dir.value || dir.name.replace(/_/g, " ");
        parsed.lines.push({ kind: "comment", text: label });
      }
      continue;
    }

    if (raw.trim() === "") {
      parsed.lines.push({ kind: "blank" });
      continue;
    }

    parsed.lines.push(parseMusicLine(raw));
    }
  }

  return parsed;
}

export function transposeParsed(chart: ParsedChart, semitones: number): ParsedChart {
  if (semitones === 0) return chart;
  return {
    ...chart,
    key: transposeKey(chart.key, semitones),
    lines: chart.lines.map((line) => {
      if (line.kind !== "music") return line;
      return {
        ...line,
        chords: line.chords.map((c) => ({
          ...c,
          text: transposeChord(c.text, semitones),
        })),
      };
    }),
  };
}

export function buildChordLine(lyric: string, chords: ChartChord[]): string {
  let out = "";
  for (const chord of chords) {
    const at = Math.max(chord.index, 0);
    if (out.length < at) out += " ".repeat(at - out.length);
    else if (out.length > 0 && !out.endsWith(" ")) out += " ";
    out += chord.text;
  }
  if (!out && lyric) return "";
  return out;
}

function isChordOnlyLine(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("{") || trimmed.includes("[")) return false;
  const tokens = trimmed.split(/\s+/);
  if (tokens.length === 0) return false;
  return tokens.every(looksLikeChordToken);
}

function mergeChordLyric(chordLine: string, lyricLine: string): string {
  const chords: ChartChord[] = [];
  const re = /\S+/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(chordLine))) {
    if (looksLikeChordToken(m[0])) chords.push({ text: m[0], index: m.index });
  }
  if (chords.length === 0) return lyricLine;

  let out = lyricLine;
  for (const chord of [...chords].reverse()) {
    const i = Math.min(Math.max(chord.index, 0), out.length);
    out = `${out.slice(0, i)}[${chord.text}]${out.slice(i)}`;
  }
  return out;
}

/** Convierte cifra web (acordes arriba / letra abajo) a ChordPro. */
export function webFormatToChordPro(text: string): string {
  const src = text.replace(/\r\n/g, "\n");
  const lines = src.split("\n");
  const out: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (isChordOnlyLine(line) && i + 1 < lines.length && !isChordOnlyLine(lines[i + 1]!)) {
      const next = lines[i + 1]!;
      if (next.trim() === "") {
        const tokens = line.trim().split(/\s+/).filter(looksLikeChordToken);
        out.push(tokens.map((t) => `[${t}]`).join(" "));
      } else {
        out.push(mergeChordLyric(line, next));
        i += 1;
      }
      continue;
    }
    if (isChordOnlyLine(line)) {
      const tokens = line.trim().split(/\s+/).filter(looksLikeChordToken);
      out.push(tokens.map((t) => `[${t}]`).join(" "));
      continue;
    }
    out.push(line);
  }
  return out.join("\n");
}

export function ensureChartHeader(
  content: string,
  meta: {
    title?: string | null;
    artist?: string | null;
    key?: string | null;
    capo?: number | null;
    tempo?: number | null;
  },
): string {
  let body = content.replace(/^\uFEFF/, "");
  const parsed = parseChordPro(body);
  const header: string[] = [];
  if (meta.title && !parsed.title) header.push(`{title: ${meta.title}}`);
  if (meta.artist && !parsed.artist) header.push(`{artist: ${meta.artist}}`);
  if (meta.key && !parsed.key) header.push(`{key: ${meta.key}}`);
  const tempo = parseTempoBpm(meta.tempo);
  if (tempo != null && parsed.tempo == null) header.push(`{tempo: ${tempo}}`);
  if (meta.capo != null && meta.capo > 0 && parsed.capo == null) {
    header.push(`{capo: ${meta.capo}}`);
  }
  if (header.length === 0) return body;
  const trimmed = body.replace(/^\n+/, "");
  return `${header.join("\n")}\n\n${trimmed}`;
}

export function normalizeChartInput(
  raw: string,
  meta: { title?: string | null; artist?: string | null; key?: string | null; capo?: number | null },
): string {
  return ensureChartHeader(webFormatToChordPro(raw), meta);
}

export function searchUrls(title: string, artist: string): {
  cifraClub: string;
  ultimateGuitar: string;
  genius: string;
} {
  const q = [artist, title].filter(Boolean).join(" ").trim() || title;
  const enc = encodeURIComponent(q);
  return {
    cifraClub: `https://www.cifraclub.com.br/?q=${enc}`,
    ultimateGuitar: `https://www.ultimate-guitar.com/search.php?search_type=title&value=${enc}`,
    genius: `https://genius.com/search?q=${enc}`,
  };
}
