"use client";

import { cn } from "@/lib/utils";
import {
  buildChordLine,
  parseChordPro,
  transposeParsed,
  webFormatToChordPro,
} from "@/lib/chordpro";

export function ChartPreview({
  content,
  transpose = 0,
  fontSize = 15,
  className,
}: {
  content: string;
  transpose?: number;
  fontSize?: number;
  className?: string;
}) {
  const parsed = transposeParsed(parseChordPro(webFormatToChordPro(content)), transpose);

  if (!content.trim()) {
    return (
      <p className="py-8 text-center text-sm text-white/45">
        Todavía no hay cifra para mostrar.
      </p>
    );
  }

  return (
    <div
      className={cn("overflow-x-auto font-mono text-white", className)}
      style={{ fontSize, lineHeight: 1.35 }}
    >
      {parsed.lines.map((line, i) => {
        if (line.kind === "blank") {
          return <div key={i} className="h-3" />;
        }
        if (line.kind === "comment") {
          return (
            <p key={i} className="mt-3 text-[0.85em] italic text-white/40">
              {line.text}
            </p>
          );
        }
        const chordRow = buildChordLine(line.lyric, line.chords);
        return (
          <div key={i} className="whitespace-pre">
            {chordRow ? (
              <div className="font-semibold text-spotify-green">{chordRow}</div>
            ) : null}
            <div>{line.lyric || "\u00a0"}</div>
          </div>
        );
      })}
    </div>
  );
}
