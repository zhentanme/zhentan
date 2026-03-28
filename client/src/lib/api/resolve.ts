import type { ApiFetchFn } from "./client";

export interface ResolveResult {
  address: string;
  name?: string;
}

export function resolveApi(req: ApiFetchFn) {
  return {
    async resolve(name: string): Promise<ResolveResult> {
      const res = await req(`/resolve?name=${encodeURIComponent(name)}`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error ?? "Resolve failed");
      }
      return res.json();
    },
  };
}
