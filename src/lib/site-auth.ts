/** Cookie HttpOnly firmada. 400 días = tope práctico de Chrome/Safari. */
export const SITE_GATE_COOKIE = "statsify_gate";
export const SITE_GATE_MAX_AGE_SECONDS = 60 * 60 * 24 * 400;

export function isSitePasswordConfigured(): boolean {
  return Boolean(process.env.SITE_PASSWORD?.trim());
}

export function getSitePassword(): string {
  return process.env.SITE_PASSWORD?.trim() ?? "";
}

export function isPublicPath(pathname: string): boolean {
  if (pathname === "/unlock" || pathname.startsWith("/unlock/")) return true;
  if (pathname === "/api/unlock" || pathname.startsWith("/api/unlock/")) {
    return true;
  }
  if (pathname.startsWith("/api/cron/")) return true;
  if (pathname === "/api/spotify/sync-recent") return true;
  /* Callback de Spotify: GET top-level cross-site; SameSite=Lax suele
     mandar la cookie, pero no bloquear el OAuth si iOS la omite. */
  if (pathname === "/api/spotify/callback") return true;
  return false;
}

export function safeNextPath(value: unknown): string {
  if (typeof value !== "string" || !value.startsWith("/")) return "/";
  if (value.startsWith("//") || value.startsWith("/\\")) return "/";
  if (value.includes("://")) return "/";
  if (value.startsWith("/unlock")) return "/";
  return value;
}

export function gateCookieBase(secure: boolean) {
  return {
    httpOnly: true,
    secure,
    sameSite: "lax" as const,
    path: "/",
    maxAge: SITE_GATE_MAX_AGE_SECONDS,
  };
}

function bytesToBase64Url(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function timingSafeEqualStr(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}

async function sha256Base64Url(text: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(text)
  );
  return bytesToBase64Url(digest);
}

async function hmacSha256(secret: string, message: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  return bytesToBase64Url(sig);
}

export async function passwordsMatch(
  input: string,
  expected: string
): Promise<boolean> {
  const enc = new TextEncoder();
  const [a, b] = await Promise.all([
    crypto.subtle.digest("SHA-256", enc.encode(input)),
    crypto.subtle.digest("SHA-256", enc.encode(expected)),
  ]);
  const aa = new Uint8Array(a);
  const bb = new Uint8Array(b);
  if (aa.length !== bb.length) return false;
  let out = 0;
  for (let i = 0; i < aa.length; i++) out |= aa[i] ^ bb[i];
  return out === 0;
}

/** Token firmado con la password: si la cambiás, todas las sesiones caen. */
export async function createGateToken(password: string): Promise<string> {
  const issuedAt = Date.now().toString();
  const fp = (await sha256Base64Url(password)).slice(0, 16);
  const payload = `v1.${issuedAt}.${fp}`;
  const sig = await hmacSha256(password, payload);
  return `${payload}.${sig}`;
}

export async function isValidGateToken(
  token: string | undefined,
  password: string
): Promise<boolean> {
  if (!token || !password) return false;
  const parts = token.split(".");
  if (parts.length !== 4) return false;
  const [version, issuedAt, fp, sig] = parts;
  if (version !== "v1") return false;
  const issued = Number(issuedAt);
  if (!Number.isFinite(issued)) return false;
  if (Date.now() - issued > SITE_GATE_MAX_AGE_SECONDS * 1000) return false;
  const expectedFp = (await sha256Base64Url(password)).slice(0, 16);
  if (!timingSafeEqualStr(fp, expectedFp)) return false;
  const payload = `${version}.${issuedAt}.${fp}`;
  const expectedSig = await hmacSha256(password, payload);
  return timingSafeEqualStr(sig, expectedSig);
}
