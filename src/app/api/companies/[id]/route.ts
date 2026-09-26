import { NextRequest, NextResponse } from "next/server";
import { db } from "../../../../lib/db";
import { requireCompany, AuthError } from "../../../../lib/guards";
import { COMPANY_FIELDS, EMPTY_COMPANY, type Company } from "../../../../types/company";

function toCompany(row: { id: string; name: string; active: boolean; settings: unknown }): Company {
  const settings = (row.settings as Record<string, unknown>) || {};
  const company: Company = { ...EMPTY_COMPANY, id: row.id, name: row.name, active: row.active };
  for (const field of COMPANY_FIELDS) {
    if (settings[field] !== undefined) (company as Record<string, unknown>)[field] = settings[field];
  }
  return company;
}

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const auth = await requireCompany();
    if (auth.role !== "superadmin" && params.id !== auth.companyId) {
      return NextResponse.json({ error: "دسترسی غیرمجاز." }, { status: 403 });
    }
    const row = await db.company.findUnique({ where: { id: params.id } });
    if (!row) return NextResponse.json({ error: "اطلاعات شرکت یافت نشد." }, { status: 404 });
    return NextResponse.json(toCompany(row));
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const auth = await requireCompany();
    if (auth.role !== "superadmin" && params.id !== auth.companyId) {
      return NextResponse.json({ error: "دسترسی غیرمجاز." }, { status: 403 });
    }
    const body = await req.json().catch(() => ({}));
    const { name, ...settings } = body;
    const row = await db.company.update({
      where: { id: params.id },
      data: { name: name || "", settings },
    });
    return NextResponse.json(toCompany(row));
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
}
