/**
 * Runtime API client — the worker's ONLY channel to the backend. Bearer
 * auth per D0.3; per-agent credentials (F1) swap the token, not the shape.
 */
import type { JobResultSubmission, WireJob } from "zhentan-screening/protocol";

export interface RuntimeApiConfig {
  baseUrl: string;
  token: string;
}

export interface LeasedWireJob {
  job: WireJob;
  leaseToken: string;
}

export interface SubmitOutcome {
  decision: string;
  reason?: string;
}

export class RuntimeApiClient {
  constructor(private readonly config: RuntimeApiConfig) {}

  private async request<T>(method: string, path: string, body?: unknown): Promise<{ status: number; data: T | null }> {
    const res = await fetch(`${this.config.baseUrl}${path}`, {
      method,
      headers: {
        authorization: `Bearer ${this.config.token}`,
        "content-type": "application/json",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (res.status === 204) return { status: res.status, data: null };
    const text = await res.text();
    let data: T | null = null;
    try {
      data = text ? (JSON.parse(text) as T) : null;
    } catch {
      /* non-JSON error body */
    }
    if (!res.ok) {
      const message = (data as { error?: string } | null)?.error ?? text.slice(0, 200);
      throw new Error(`Runtime API ${method} ${path} failed (${res.status}): ${message}`);
    }
    return { status: res.status, data };
  }

  /** Lease the next job for this agent. null = no work available. */
  async lease(agentInstanceId: string, safeAddress?: string): Promise<LeasedWireJob | null> {
    const { status, data } = await this.request<LeasedWireJob>("POST", "/runtime/lease", {
      agentInstanceId,
      safeAddress,
    });
    return status === 204 ? null : data;
  }

  async heartbeat(jobId: string, leaseToken: string): Promise<boolean> {
    const { data } = await this.request<{ alive: boolean }>(
      "POST",
      `/runtime/jobs/${jobId}/heartbeat`,
      { leaseToken }
    );
    return data?.alive ?? false;
  }

  async submitResult(
    submission: JobResultSubmission,
    opts: { success?: boolean; retryable?: boolean; error?: string } = {}
  ): Promise<SubmitOutcome> {
    const { data } = await this.request<SubmitOutcome>(
      "POST",
      `/runtime/jobs/${submission.jobId}/result`,
      { ...submission, ...opts }
    );
    return data ?? { decision: "reject", reason: "empty_response" };
  }
}
