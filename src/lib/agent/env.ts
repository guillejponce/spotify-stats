export function isOpenAiConfigured(): boolean {
  return Boolean(process.env.OPENAI_API_KEY?.trim());
}

export function isSupabaseConfigured(): boolean {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();
  return Boolean(url && key);
}

export function supabaseMissingMessage(): string {
  return [
    "Falta la conexión a Supabase en .env.local.",
    "Copia NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY",
    "(desde Vercel → Settings → Environment Variables, o Supabase → Project Settings → API).",
    "Después reinicia npm run dev.",
  ].join(" ");
}
