"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import ItemsEditor from "./ItemsEditor";
import JalaliDatePicker from "../forms/JalaliDatePicker";
import { saveInvoiceAction, reserveInvoiceNumberAction } from "../../server/actions/invoices";
import { createEmptyInvoice, type DocType, type Invoice } from "../../types/invoice";

const TYPE_LABELS: Record<DocType, string> = { invoice: "فاکتور", proforma: "پیش‌فاکتور" };

export default function InvoiceEditor({
  type,
  initialInvoice,
}: {
  type: DocType;
  initialInvoice?: Invoice;
}) {
  const [invoice, setInvoice] = useState<Invoice>(() => initialInvoice || createEmptyInvoice(type));
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const router = useRouter();
  const isNew = !initialInvoice;

  // New documents reserve their number from the server on load, so two people
  // opening "new invoice" at the same time never end up with the same number.
  useEffect(() => {
    if (!isNew) return;
    reserveInvoiceNumberAction(type).then((number) => {
      setInvoice((prev) => ({ ...prev, number: String(number) }));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function update<K extends keyof Invoice>(field: K, value: Invoice[K]) {
    setInvoice((prev) => ({ ...prev, [field]: value }));
  }

  function updateCustomer(field: keyof Invoice["customer"], value: string) {
    setInvoice((prev) => ({ ...prev, customer: { ...prev.customer, [field]: value } }));
  }

  function handleSave() {
    setError("");
    startTransition(async () => {
      const result = await saveInvoiceAction(invoice);
      // saveInvoiceAction redirects to "/" on success; getting a result back means
      // it returned an error instead of redirecting.
      if (result?.error) setError(result.error);
    });
  }

  return (
    <div>
      <h1 className="page-title">
        {isNew ? `صدور ${TYPE_LABELS[type]} جدید` : `ویرایش ${TYPE_LABELS[invoice.type]}`}
      </h1>

      {error ? (
        <div className="alert alert-error" role="alert" style={{ marginBottom: 14 }}>
          {error}
        </div>
      ) : null}

      <div className="card card-pad" style={{ marginBottom: 16 }}>
        <div className="form-grid">
          <div className="field">
            <label>شماره {TYPE_LABELS[invoice.type]}</label>
            <input value={invoice.number} onChange={(e) => update("number", e.target.value)} />
          </div>
          <div className="field">
            <label>تاریخ صدور</label>
            <JalaliDatePicker value={invoice.date} onChange={(v) => update("date", v)} />
          </div>
          <div className="field">
            <label>تاریخ سررسید (اختیاری)</label>
            <JalaliDatePicker value={invoice.dueDate || ""} onChange={(v) => update("dueDate", v)} />
          </div>
          {invoice.type === "proforma" && (
            <div className="field">
              <label>تاریخ اعتبار پیش‌فاکتور</label>
              <JalaliDatePicker value={invoice.validUntil || ""} onChange={(v) => update("validUntil", v)} />
            </div>
          )}
        </div>
      </div>

      <div className="card card-pad" style={{ marginBottom: 16 }}>
        <h2 style={{ fontSize: 15, margin: "0 0 12px" }}>اطلاعات خریدار</h2>
        <div className="form-grid">
          <div className="field">
            <label>نام خریدار / سازمان</label>
            <input value={invoice.customer.name || ""} onChange={(e) => updateCustomer("name", e.target.value)} />
          </div>
          <div className="field">
            <label>کد اقتصادی</label>
            <input value={invoice.customer.economicCode || ""} onChange={(e) => updateCustomer("economicCode", e.target.value)} />
          </div>
          <div className="field">
            <label>شناسه/کد ملی</label>
            <input value={invoice.customer.nationalId || ""} onChange={(e) => updateCustomer("nationalId", e.target.value)} />
          </div>
          <div className="field">
            <label>تلفن</label>
            <input value={invoice.customer.phone || ""} onChange={(e) => updateCustomer("phone", e.target.value)} />
          </div>
          <div className="field" style={{ gridColumn: "1 / -1" }}>
            <label>آدرس</label>
            <input value={invoice.customer.address || ""} onChange={(e) => updateCustomer("address", e.target.value)} />
          </div>
        </div>
      </div>

      <div className="card card-pad" style={{ marginBottom: 16 }}>
        <h2 style={{ fontSize: 15, margin: "0 0 12px" }}>اقلام</h2>
        <ItemsEditor items={invoice.items} onChange={(items) => update("items", items)} />
      </div>

      <div className="card card-pad" style={{ marginBottom: 16 }}>
        <div className="form-grid">
          <div className="field">
            <label>تخفیف کلی فاکتور (ریال)</label>
            <input
              className="financial-number"
              type="number"
              min="0"
              value={invoice.extraDiscount}
              onChange={(e) => update("extraDiscount", Number(e.target.value))}
            />
          </div>
          <div className="field">
            <label>درصد مالیات بر ارزش افزوده</label>
            <input
              className="financial-number"
              type="number"
              min="0"
              max="100"
              value={invoice.taxPercent}
              onChange={(e) => update("taxPercent", Number(e.target.value))}
            />
          </div>
          <div className="field" style={{ gridColumn: "1 / -1" }}>
            <label>توضیحات</label>
            <input value={invoice.notes} onChange={(e) => update("notes", e.target.value)} />
          </div>
        </div>
      </div>

      <div style={{ display: "flex", gap: 10 }}>
        <button type="button" className="btn btn-primary" disabled={isPending} onClick={handleSave}>
          {isPending ? "در حال ذخیره..." : "ذخیره"}
        </button>
        <button type="button" className="btn btn-outline" onClick={() => router.push("/")}>
          انصراف
        </button>
      </div>
    </div>
  );
}
