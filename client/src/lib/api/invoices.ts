import type { ApiFetchFn } from "./client";
import type { QueuedInvoice, InvoiceStatus, InvoiceParty, InvoiceService } from "@/types";

export interface CreateInvoiceBody {
  to: string;
  amount: string;
  token: string;
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

export interface UpdateInvoiceBody {
  id: string;
  status: InvoiceStatus;
  rejectReason?: string;
  txId?: string;
  txHash?: string;
}

export function invoicesApi(req: ApiFetchFn) {
  return {
    async list(): Promise<{ invoices: QueuedInvoice[] }> {
      const res = await req("/invoices");
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },

    async create(body: CreateInvoiceBody): Promise<{ status: string; id: string }> {
      const res = await req("/invoices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },

    async update(body: UpdateInvoiceBody): Promise<{ invoice: QueuedInvoice }> {
      const res = await req("/invoices", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  };
}
