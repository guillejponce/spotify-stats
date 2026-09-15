export const KURT_ASK_EVENT = "kurt-ask";

export const KNOW_MORE_PROMPT =
  "Saber más de lo que está sonando ahora: cómo encaja en lo que yo escucho y un dato freak real.";

export function askKurt(text: string) {
  if (typeof window === "undefined") return;
  const clean = text.trim();
  if (!clean) return;
  window.dispatchEvent(new CustomEvent(KURT_ASK_EVENT, { detail: clean }));
}
