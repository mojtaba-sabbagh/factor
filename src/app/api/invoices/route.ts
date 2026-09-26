import { NextResponse } from "next/server";
import { AuthError } from "../../../lib/guards";
import { fetchInvoices } from "../../../server/actions/invoices";

export async function GET() {
  try {
    return NextResponse.json(await fetchInvoices());
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
}
