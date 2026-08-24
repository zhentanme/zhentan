"use client";

import { useEffect, useState } from "react";
import { useApiClient } from "@/lib/api/client";
import type { LinkCredential } from "@/lib/api/telegram";

/**
 * Object URL for a Telegram profile photo, fetched through the server proxy
 * (the API needs the auth header, so a plain <img src> can't do it). With a
 * `credential` it shows the photo of the Telegram a link code would bind
 * (consent page); without one, the caller's own linked Telegram.
 */
export function useTelegramPhoto(
  opts: { credential?: LinkCredential | null; enabled?: boolean } = {}
) {
  const { credential, enabled = true } = opts;
  const api = useApiClient();
  const [url, setUrl] = useState<string | null>(null);
  // Effect key: object identity of `credential` churns per render at call
  // sites — key on its VALUE instead.
  const credentialKey = credential ? JSON.stringify(credential) : "";

  useEffect(() => {
    if (!enabled) return;
    const cred = credentialKey ? (JSON.parse(credentialKey) as LinkCredential) : null;
    let objectUrl: string | null = null;
    let cancelled = false;
    (cred ? api.telegram.linkPhoto(cred) : api.telegram.photo())
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
  }, [api, credentialKey, enabled]);

  return url;
}
