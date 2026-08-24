"use client";

import { useEffect, useState } from "react";
import { useApiClient } from "@/lib/api/client";

/**
 * Object URL for a Telegram profile photo, fetched through the server proxy
 * (the API needs the auth header, so a plain <img src> can't do it). With a
 * `code` it shows the photo of the Telegram a link code would bind (consent
 * page); without one, the caller's own linked Telegram.
 */
export function useTelegramPhoto(opts: { code?: string; enabled?: boolean } = {}) {
  const { code, enabled = true } = opts;
  const api = useApiClient();
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let objectUrl: string | null = null;
    let cancelled = false;
    (code ? api.telegram.linkPhoto(code) : api.telegram.photo())
      .then((blob) => {
        if (cancelled || !blob) return;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      setUrl(null);
    };
  }, [api, code, enabled]);

  return url;
}
