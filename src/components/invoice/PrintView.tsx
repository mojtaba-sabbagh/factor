"use client";

import { useRef, useState } from "react";
import InvoiceDocument from "./InvoiceDocument";
import type { Company } from "../../types/company";
import type { Invoice } from "../../types/invoice";

export default function PrintView({ invoice, company }: { invoice: Invoice; company: Company }) {
  const [size, setSize] = useState<"a4" | "a5">("a4");
  const [useLetterhead, setUseLetterhead] = useState(false);
  const [withSeal, setWithSeal] = useState(true);
  const [withSignature, setWithSignature] = useState(true);
  const docRef = useRef<HTMLDivElement>(null);

  return (
    <div>
      <div
        className="card card-pad no-print"
        style={{
          marginBottom: 16,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 20,
          fontSize: 14,
          flexWrap: "nowrap",
          overflowX: "auto",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 20, flexWrap: "nowrap" }}>
          <label style={{ display: "flex", alignItems: "center", gap: 6, whiteSpace: "nowrap" }}>
            <input type="radio" checked={size === "a4"} onChange={() => setSize("a4")} /> A4
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 6, whiteSpace: "nowrap" }}>
            <input type="radio" checked={size === "a5"} onChange={() => setSize("a5")} /> A5
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 6, whiteSpace: "nowrap" }}>
            <input type="checkbox" checked={useLetterhead} onChange={(e) => setUseLetterhead(e.target.checked)} /> استفاده از سربرگ
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 6, whiteSpace: "nowrap" }}>
            <input type="checkbox" checked={withSeal} onChange={(e) => setWithSeal(e.target.checked)} /> درج مهر
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 6, whiteSpace: "nowrap" }}>
            <input type="checkbox" checked={withSignature} onChange={(e) => setWithSignature(e.target.checked)} /> درج امضا
          </label>
        </div>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => window.print()}
          style={{ fontSize: 14, flexShrink: 0, whiteSpace: "nowrap" }}
        >
          چاپ / ذخیره PDF
        </button>
      </div>

      <InvoiceDocument
        ref={docRef}
        invoice={invoice}
        company={company}
        size={size}
        useLetterhead={useLetterhead}
        withSeal={withSeal}
        withSignature={withSignature}
      />
    </div>
  );
}
