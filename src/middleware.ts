import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

/** Rutas sin sesión: login/OAuth y endpoints que se autentican con CRON_SECRET. */
function isPublicPath(pathname: string): boolean {
  if (pathname === "/login" || pathname.startsWith("/auth/")) return true;
  if (pathname === "/api/spotify/auth") return true;
  if (pathname.startsWith("/api/cron/")) return true;
  if (pathname === "/api/spotify/sync-recent") return true;
  return false;
}

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(toSet) {
          for (const { name, value } of toSet) request.cookies.set(name, value);
          response = NextResponse.next({ request });
          for (const { name, value, options } of toSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    }
  );

  // Refresca la sesión (escribe cookies nuevas si el access token venció).
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub ?? null;

  const redirect = (url: URL) => {
    const res = NextResponse.redirect(url);
    for (const c of response.cookies.getAll()) res.cookies.set(c);
    return res;
  };

  const { pathname } = request.nextUrl;
  if (isPublicPath(pathname)) return response;

  if (!userId) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const login = request.nextUrl.clone();
    login.pathname = "/login";
    login.search = "";
    if (pathname !== "/") login.searchParams.set("next", pathname + request.nextUrl.search);
    return redirect(login);
  }

  // Las API verifican estado/rol en requireUser(); acá solo las páginas.
  if (pathname.startsWith("/api/")) return response;

  const { data: profile } = await supabase
    .from("profiles")
    .select("status")
    .eq("id", userId)
    .maybeSingle();
  const active = profile?.status === "active";

  if (pathname === "/pending") {
    if (active) return redirect(new URL("/", request.url));
    return response;
  }
  if (!active) return redirect(new URL("/pending", request.url));
  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|icons/|manifest.json|sw.js|.*\\.(?:png|jpg|jpeg|gif|webp|svg|ico|woff2?)$).*)",
  ],
};
