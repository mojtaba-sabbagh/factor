"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "../../lib/db";
import { requireCompany } from "../../lib/guards";
import type { DocType, Invoice } from "../../types/invoice";

type InvoiceRow = {
  id: string;
  type: string;
  number: string;
  date: string;
  dueDate: string | null;
  validUntil: string | null;
  customer: unknown;
  items: unknown;
  extraDiscount: { toString(): string };
  taxPercent: { toString(): string };
  notes: string;
  createdAt: Date;
};

function toInvoice(row: InvoiceRow): Invoice {
  return {
    id: row.id,
    type: row.type as DocType,
    number: row.number,
    date: row.date,
    dueDate: row.dueDate,
    validUntil: row.validUntil,
    customer: (row.customer as Invoice["customer"]) || {},
    items: (row.items as Invoice["items"]) || [],
    extraDiscount: Number(row.extraDiscount),
    taxPercent: Number(row.taxPercent),
    notes: row.notes,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function fetchInvoices(): Promise<Invoice[]> {
  const auth = await requireCompany();
  const rows = await db.invoice.findMany({
    where: { companyId: auth.companyId },
    orderBy: { createdAt: "desc" },
  });
  return rows.map(toInvoice);
}

export async function fetchInvoice(id: string): Promise<Invoice | null> {
  const auth = await requireCompany();
  const row = await db.invoice.findFirst({ where: { id, companyId: auth.companyId } });
  return row ? toInvoice(row) : null;
}

export type SaveInvoiceState = { error?: string } | undefined;

export async function saveInvoiceAction(invoice: Invoice): Promise<SaveInvoiceState> {
  const auth = await requireCompany();
  // upsert scoped to this company: an id that belongs to another company's invoice
  // simply won't match on update, and Prisma's upsert only checks the id, so we
  // guard explicitly instead of trusting upsert alone.
  const existing = await db.invoice.findUnique({ where: { id: invoice.id } });
  if (existing && existing.companyId !== auth.companyId) return { error: "دسترسی غیرمجاز." };

  const data = {
    companyId: auth.companyId,
    type: invoice.type,
    number: String(invoice.number ?? ""),
    date: invoice.date || "",
    dueDate: invoice.dueDate || null,
    validUntil: invoice.validUntil || null,
    customer: invoice.customer || {},
    items: invoice.items || [],
    extraDiscount: Number(invoice.extraDiscount) || 0,
    taxPercent: Number(invoice.taxPercent) || 0,
    notes: invoice.notes || "",
  };
  await db.invoice.upsert({
    where: { id: invoice.id },
    create: { id: invoice.id, ...data },
    update: data,
  });
  revalidatePath("/");
  redirect("/");
}

export async function deleteInvoiceAction(id: string): Promise<void> {
  const auth = await requireCompany();
  await db.invoice.deleteMany({ where: { id, companyId: auth.companyId } });
  revalidatePath("/");
}

// Atomically reserves the next number for this company + document type, so two
// people opening a new invoice at the same time never collide. jsonb_set isn't
// expressible through Prisma's typed API, so this uses a raw query inside the
// same round trip; it's still safe under concurrency because the UPDATE itself
// is atomic at the row level in Postgres.
export async function reserveInvoiceNumberAction(type: DocType): Promise<number> {
  const auth = await requireCompany();
  const rows = await db.$queryRaw<{ n: number }[]>`
    update companies
    set invoice_counters = jsonb_set(
      coalesce(invoice_counters, '{}'::jsonb),
      array[${type}],
      to_jsonb(coalesce((invoice_counters ->> ${type})::int, 0) + 1)
    )
    where id = ${auth.companyId}
    returning (invoice_counters ->> ${type})::int as n
  `;
  return rows[0].n;
}
