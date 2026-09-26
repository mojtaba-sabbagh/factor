import { NextRequest, NextResponse } from "next/server";
import { db } from "../../../../lib/db";
import { requireCompany, AuthError } from "../../../../lib/guards";
import { fetchInvoice } from "../../../../server/actions/invoices";

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const invoice = await fetchInvoice(params.id);
    if (!invoice) return NextResponse.json({ error: "سند یافت نشد." }, { status: 404 });
    return NextResponse.json(invoice);
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const auth = await requireCompany();
    const body = await req.json().catch(() => ({}));
    const existing = await db.invoice.findUnique({ where: { id: params.id } });
    if (existing && existing.companyId !== auth.companyId) {
      return NextResponse.json({ error: "دسترسی غیرمجاز." }, { status: 403 });
    }
    const data = {
      companyId: auth.companyId,
      type: body.type,
      number: String(body.number ?? ""),
      date: body.date || "",
      dueDate: body.dueDate || null,
      validUntil: body.validUntil || null,
      customer: body.customer || {},
      items: body.items || [],
      extraDiscount: Number(body.extraDiscount) || 0,
      taxPercent: Number(body.taxPercent) || 0,
      notes: body.notes || "",
    };
    await db.invoice.upsert({
      where: { id: params.id },
      create: { id: params.id, ...data },
      update: data,
    });
    const invoice = await fetchInvoice(params.id);
    return NextResponse.json(invoice);
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const auth = await requireCompany();
    await db.invoice.deleteMany({ where: { id: params.id, companyId: auth.companyId } });
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
}
