"use client";

import { useEffect, useState } from "react";

/** Supabase a veces devuelve el error de OAuth en el fragmento (#), que el servidor no ve. */
export function LoginHashError() {
  const [detail, setDetail] = useState<string | null>(null);

  useEffect(() => {
    const hash = window.location.hash.replace(/^#/, "");
    if (!hash) return;
    const params = new URLSearchParams(hash);
    const msg = params.get("error_description") || params.get("error_code") || params.get("error");
    if (msg) setDetail(msg);
  }, []);

  if (!detail) return null;
  return (
    <p className="mt-2 break-words text-xs text-red-300/80" role="alert">
      {detail}
    </p>
  );
}
