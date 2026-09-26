"use client";

import { useEffect, useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import CompanyTable from "../../../components/admin/CompanyTable";
import { createCompanyAction, listCompaniesAction } from "../../../server/actions/admin";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn btn-primary" disabled={pending}>
      {pending ? "در حال ایجاد..." : "ایجاد شرکت"}
    </button>
  );
}

export default function AdminPage() {
  const [companies, setCompanies] = useState<
    { id: string; name: string; active: boolean; createdAt: string }[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [state, formAction] = useFormState(createCompanyAction, undefined);

  async function reload() {
    setLoading(true);
    const rows = await listCompaniesAction();
    setCompanies(rows.map((r) => ({ ...r, createdAt: r.createdAt.toString() })));
    setLoading(false);
  }

  useEffect(() => {
    reload();
  }, [state]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div>
      <h1 className="page-title">شرکت‌ها و حساب‌ها</h1>
      <p className="page-subtitle">مدیریت شرکت‌های مستأجر سامانه.</p>

      <div className="card card-pad" style={{ marginBottom: 16 }}>
        <h2 style={{ fontSize: 15, margin: "0 0 12px" }}>ایجاد شرکت جدید</h2>
        {state?.error ? (
          <div className="alert alert-error" role="alert" style={{ marginBottom: 14 }}>
            {state.error}
          </div>
        ) : null}
        <form action={formAction} className="form-grid">
          <div className="field">
            <label>نام شرکت</label>
            <input name="name" required />
          </div>
          <div className="field">
            <label>ایمیل مدیر شرکت</label>
            <input name="adminEmail" type="email" required />
          </div>
          <div className="field">
            <label>رمز عبور مدیر شرکت</label>
            <input name="adminPassword" type="password" required minLength={8} />
          </div>
          <div className="field" style={{ alignSelf: "end" }}>
            <SubmitButton />
          </div>
        </form>
      </div>

      <div className="card">
        {loading ? <div className="empty-state">در حال بارگذاری...</div> : <CompanyTable companies={companies} />}
      </div>
    </div>
  );
}
