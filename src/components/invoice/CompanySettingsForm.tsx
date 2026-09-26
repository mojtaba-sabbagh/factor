"use client";

import { useState, useTransition } from "react";
import { saveCompanyAction } from "../../server/actions/companies";
import type { Company } from "../../types/company";

const TEXT_FIELDS: Array<{ key: keyof Company; label: string; span?: boolean }> = [
  { key: "name", label: "نام شرکت", span: true },
  { key: "companyType", label: "نوع شرکت (مثلاً سهامی خاص)" },
  { key: "ceoName", label: "نام مدیرعامل" },
  { key: "address", label: "آدرس", span: true },
  { key: "letterheadAddress", label: "آدرس روی سربرگ (اختیاری)", span: true },
  { key: "postalCode", label: "کدپستی" },
  { key: "phone", label: "تلفن" },
  { key: "email", label: "ایمیل" },
  { key: "economicCode", label: "کد اقتصادی" },
  { key: "nationalId", label: "شناسه ملی" },
  { key: "registrationNumber", label: "شماره ثبت" },
  { key: "iban", label: "شماره شبا (IBAN)" },
];

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function CompanySettingsForm({ initialCompany }: { initialCompany: Company }) {
  const [company, setCompany] = useState(initialCompany);
  const [isPending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  function set<K extends keyof Company>(key: K, value: Company[K]) {
    setCompany((prev) => ({ ...prev, [key]: value }));
    setSaved(false);
  }

  async function handleImageUpload(key: "logo" | "seal" | "signature", file: File) {
    set(key, await fileToDataUrl(file));
  }

  function handleSave() {
    setError("");
    startTransition(async () => {
      const result = await saveCompanyAction(company);
      if (result?.error) setError(result.error);
      else setSaved(true);
    });
  }

  return (
    <div>
      <h1 className="page-title">اطلاعات شرکت</h1>
      <p className="page-subtitle">این اطلاعات روی فاکتورها، پیش‌فاکتورها و سربرگ نمایش داده می‌شود.</p>

      {error ? <div className="alert alert-error" role="alert" style={{ marginBottom: 14 }}>{error}</div> : null}

      <div className="card card-pad" style={{ marginBottom: 16 }}>
        <div className="form-grid">
          {TEXT_FIELDS.map((f) => (
            <div className="field" key={f.key} style={f.span ? { gridColumn: "1 / -1" } : undefined}>
              <label>{f.label}</label>
              <input value={(company[f.key] as string) || ""} onChange={(e) => set(f.key, e.target.value as never)} />
            </div>
          ))}
        </div>
      </div>

      <div className="card card-pad" style={{ marginBottom: 16 }}>
        <h2 style={{ fontSize: 15, margin: "0 0 12px" }}>تصاویر</h2>
        <div className="form-grid">
          <div className="field">
            <label>لوگو</label>
            <input type="file" accept="image/*" onChange={(e) => e.target.files?.[0] && handleImageUpload("logo", e.target.files[0])} />
            {company.logo && company.logo !== "default" ? <img src={company.logo} alt="لوگو" style={{ height: 48, marginTop: 6 }} /> : null}
          </div>
          <div className="field">
            <label>مهر شرکت</label>
            <input type="file" accept="image/*" onChange={(e) => e.target.files?.[0] && handleImageUpload("seal", e.target.files[0])} />
            {company.seal && company.seal !== "default" ? (
              <img src={company.seal} alt="مهر شرکت" style={{ height: 48, maxWidth: "100%", objectFit: "contain", marginTop: 6 }} />
            ) : null}
          </div>
          <div className="field">
            <label>امضای مدیرعامل</label>
            <input type="file" accept="image/*" onChange={(e) => e.target.files?.[0] && handleImageUpload("signature", e.target.files[0])} />
            {company.signature && company.signature !== "default" ? (
              <img src={company.signature} alt="امضای مدیرعامل" style={{ height: 48, maxWidth: "100%", objectFit: "contain", marginTop: 6 }} />
            ) : null}
          </div>
        </div>
      </div>

      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
        <button type="button" className="btn btn-primary" disabled={isPending} onClick={handleSave}>
          {isPending ? "در حال ذخیره..." : "ذخیره تغییرات"}
        </button>
        {saved ? <span style={{ color: "#047857", fontSize: 13 }}>ذخیره شد.</span> : null}
      </div>
    </div>
  );
}
