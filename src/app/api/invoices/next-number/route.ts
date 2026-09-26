import { NextRequest, NextResponse } from "next/server";
import { AuthError } from "../../../../lib/guards";
import { reserveInvoiceNumberAction } from "../../../../server/actions/invoices";

export async function POST(req: NextRequest) {
  try {
    const { type } = await req.json().catch(() => ({}));
    if (!["invoice", "proforma"].includes(type)) {
      return NextResponse.json({ error: "نوع سند نامعتبر است." }, { status: 400 });
    }
    const number = await reserveInvoiceNumberAction(type);
    return NextResponse.json({ number });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
}
