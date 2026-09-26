"use server";

import { revalidatePath } from "next/cache";
import { db } from "../../lib/db";
import { requireCompany } from "../../lib/guards";
import { COMPANY_FIELDS, EMPTY_COMPANY, type Company } from "../../types/company";

function toCompany(row: { id: string; name: string; active: boolean; settings: unknown }): Company {
  const settings = (row.settings as Record<string, unknown>) || {};
  const company: Company = { ...EMPTY_COMPANY, id: row.id, name: row.name, active: row.active };
  for (const field of COMPANY_FIELDS) {
    if (settings[field] !== undefined) (company as Record<string, unknown>)[field] = settings[field];
  }
  return company;
}

export async function fetchOwnCompany(): Promise<Company | null> {
  const auth = await requireCompany();
  const row = await db.company.findUnique({ where: { id: auth.companyId } });
  return row ? toCompany(row) : null;
}

export type SaveCompanyState = { error?: string; ok?: boolean } | undefined;

export async function saveCompanyAction(company: Company): Promise<SaveCompanyState> {
  const auth = await requireCompany();
  if (company.id !== auth.companyId) return { error: "دسترسی غیرمجاز." };
  const settings: Record<string, unknown> = {};
  for (const field of COMPANY_FIELDS) settings[field] = company[field];
  await db.company.update({ where: { id: auth.companyId }, data: { name: company.name || "", settings } });
  revalidatePath("/settings");
  return { ok: true };
}
