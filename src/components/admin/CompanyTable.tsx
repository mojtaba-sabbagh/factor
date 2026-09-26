"use client";

import Link from "next/link";
import { useTransition } from "react";
import { setCompanyActiveAction } from "../../server/actions/admin";

type CompanyRow = { id: string; name: string; active: boolean; createdAt: Date | string };

export default function CompanyTable({ companies }: { companies: CompanyRow[] }) {
  const [isPending, startTransition] = useTransition();

  return (
    <table className="table">
      <thead>
        <tr>
          <th>نام شرکت</th>
          <th>وضعیت</th>
          <th>تاریخ ایجاد</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        {companies.map((company) => (
          <tr key={company.id}>
            <td>
              <Link href={`/admin/companies/${company.id}`}>{company.name}</Link>
            </td>
            <td>{company.active ? "فعال" : "غیرفعال"}</td>
            <td>{new Date(company.createdAt).toLocaleDateString("fa-IR")}</td>
            <td>
              <button
                type="button"
                className={`btn btn-sm ${company.active ? "btn-outline" : "btn-primary"}`}
                disabled={isPending}
                onClick={() => startTransition(() => setCompanyActiveAction(company.id, !company.active))}
              >
                {company.active ? "غیرفعال کردن" : "فعال کردن"}
              </button>
            </td>
          </tr>
        ))}
        {companies.length === 0 && (
          <tr>
            <td colSpan={4} style={{ textAlign: "center", color: "#999", padding: 16 }}>
              هنوز شرکتی ثبت نشده است.
            </td>
          </tr>
        )}
      </tbody>
    </table>
  );
}
