import type { ApiFetchFn } from "./client";
import type { QueuedRequest, RequestStatus, RequestType, InvoiceParty, InvoiceService } from "@/types";

export interface CreateRequestBody {
  type?: RequestType;
  to: string;
  amount: string;
  token: string;
  description?: string;
  invoiceNumber?: string;
  issueDate?: string;
  dueDate?: string;
  billedFrom?: InvoiceParty;
  billedTo?: InvoiceParty;
  services?: InvoiceService[];
  riskScore?: number;
  riskNotes?: string;
  sourceChannel?: string;
}

export interface UpdateRequestBody {
  id: string;
  status: RequestStatus;
  rejectReason?: string;
  txId?: string;
  txHash?: string;
}

export function requestsApi(req: ApiFetchFn) {
  return {
    async list(): Promise<{ requests: QueuedRequest[] }> {
      const res = await req("/requests");
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },

    async create(body: CreateRequestBody): Promise<{ status: string; id: string; type: RequestType }> {
      const res = await req("/requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },

    async update(body: UpdateRequestBody): Promise<{ request: QueuedRequest }> {
      const res = await req("/requests", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  };
}
