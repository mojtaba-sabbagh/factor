"use client";

import { useState, useTransition } from "react";
import Letterhead from "./Letterhead";
import { saveCompanyAction } from "../../server/actions/companies";
import type { Company } from "../../types/company";

const SIZES: Array<{ id: "a4" | "a5"; label: string }> = [
  { id: "a4", label: "A4" },
  { id: "a5", label: "A5" },
];

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// Letterheads render as an <img>/background-image behind the invoice content (both
// on screen and when printed), and browsers can't do that with a PDF. So a PDF
// upload gets rasterized to a PNG in the browser instead — first page only, at
// roughly 300 DPI for the chosen paper size — using pdfjs-dist. No server-side PDF
// tooling (poppler, ImageMagick, etc.) is needed, which keeps this working the
// same way on any OS you deploy to.
const PAGE_WIDTH_MM: Record<"a4" | "a5", number> = { a4: 210, a5: 148 };

async function pdfFileToDataUrl(file: File, size: "a4" | "a5"): Promise<string> {
  const pdfjsLib = await import("pdfjs-dist/legacy/build/pdf");
  pdfjsLib.GlobalWorkerOptions.workerSrc =
    `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;

  const buffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
  const page = await pdf.getPage(1); // letterheads are a single page — later pages are ignored

  const targetWidthPx = (PAGE_WIDTH_MM[size] / 25.4) * 300; // ~300 DPI at the paper's real width
  const unscaled = page.getViewport({ scale: 1 });
  const viewport = page.getViewport({ scale: targetWidthPx / unscaled.width });

  const canvas = document.createElement("canvas");
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("امکان پردازش PDF در این مرورگر وجود ندارد.");
  await page.render({ canvasContext: ctx, viewport }).promise;
  return canvas.toDataURL("image/png");
}

function isPdf(file: File) {
  return file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
}

export default function LetterheadEditor({ company }: { company: Company }) {
  const [size, setSize] = useState<"a4" | "a5">("a4");
  const [letterheads, setLetterheads] = useState(company.letterheads || {});
  const [isPending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);
  const [converting, setConverting] = useState(false);
  const [uploadError, setUploadError] = useState("");

  const previewCompany: Company = { ...company, letterheads };

  async function handleUpload(file: File) {
    setUploadError("");
    try {
      const dataUrl = isPdf(file) ? await (async () => {
        setConverting(true);
        try {
          return await pdfFileToDataUrl(file, size);
        } finally {
          setConverting(false);
        }
      })() : await fileToDataUrl(file);
      setLetterheads((prev) => ({ ...prev, [size]: dataUrl }));
      setSaved(false);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "پردازش فایل سربرگ ناموفق بود.");
    }
  }

  function handleRemove() {
    setLetterheads((prev) => {
      const next = { ...prev };
      delete next[size];
      return next;
    });
    setSaved(false);
  }

  function handleSave() {
    startTransition(async () => {
      await saveCompanyAction({ ...company, letterheads });
      setSaved(true);
    });
  }

  return (
    <div>
      <h1 className="page-title">سربرگ شرکت</h1>
      <p className="page-subtitle">پیش‌نمایش سربرگ پیش‌فرض یا آپلود تصویر یا فایل PDF سربرگ اختصاصی برای هر اندازه.</p>

      <div className="card card-pad no-print" style={{ marginBottom: 16, display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
        {SIZES.map((s) => (
          <label key={s.id} style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <input type="radio" checked={size === s.id} onChange={() => setSize(s.id)} /> {s.label}
          </label>
        ))}
        <input
          type="file"
          accept="image/*,application/pdf"
          onChange={(e) => e.target.files?.[0] && handleUpload(e.target.files[0])}
        />
        {converting ? <span style={{ fontSize: 13, color: "var(--muted)" }}>در حال پردازش PDF...</span> : null}
        {letterheads[size] ? (
          <button type="button" className="btn btn-outline btn-sm" onClick={handleRemove}>
            حذف تصویر سربرگ اختصاصی
          </button>
        ) : null}
        <button type="button" className="btn btn-primary" disabled={isPending} onClick={handleSave}>
          {isPending ? "در حال ذخیره..." : "ذخیره سربرگ"}
        </button>
        {saved ? <span style={{ color: "#047857", fontSize: 13 }}>ذخیره شد.</span> : null}
      </div>
      {uploadError ? (
        <div className="alert alert-error no-print" style={{ marginBottom: 16 }} role="alert">
          {uploadError}
        </div>
      ) : null}

      <div
        className={`doc-page doc-page-letterhead size-${size}`}
        style={{ ["--page-width-mm" as string]: size === "a4" ? "210mm" : "148mm", ["--page-height-mm" as string]: size === "a4" ? "297mm" : "210mm" }}
      >
        <Letterhead company={previewCompany} size={size} date="1403/01/01" number="۱" />
      </div>
    </div>
  );
}
