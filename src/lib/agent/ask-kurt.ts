export const KURT_ASK_EVENT = "kurt-ask";

export const KNOW_MORE_PROMPT =
  "Saber más de lo que está sonando ahora: 1) mis stats (plays, ratings), 2) ficha pública de Spotify (fecha de lanzamiento, si es single o álbum, pista, sello, popularidad 0-100, seguidores, otras ediciones). No inventes streams totales. 3) un dato freak real.";

export function askKurt(text: string) {
  if (typeof window === "undefined") return;
  const clean = text.trim();
  if (!clean) return;
  window.dispatchEvent(new CustomEvent(KURT_ASK_EVENT, { detail: clean }));
}
