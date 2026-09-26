"use client";

import { forwardRef, useLayoutEffect, useRef, useState } from "react";
import Letterhead from "./Letterhead";
import { calcTotals } from "../../utils/calc";
import { formatNumber } from "../../utils/format";
import { amountToWordsWithUnit } from "../../utils/numberToWords";
import { gregorianToJalaliDisplay } from "../../utils/jalali";
import { PAGE_SIZES, pageStyleVars } from "../../utils/pageSizes";
import { getCustomLetterhead, resolveLogo, resolveSeal, resolveSignature } from "../../utils/companyAssets";
import type { Company } from "../../types/company";
import type { Invoice } from "../../types/invoice";

const TYPE_LABELS: Record<string, string> = {
  invoice: "فاکتور فروش",
  proforma: "پیش‌فاکتور",
};

// Print layout can differ from screen by a few px; keep this much slack so it never spills to page 2.
const PAGE_SAFETY_MM = 3;
const LETTERHEAD_MIN_SCALE = 0.5;
// Keep body content clear of the lower letterhead artwork. This is especially
// important on A5, where the footer takes a larger share of the usable sheet.
const LETTERHEAD_FOOTER_CLEARANCE_MM: Record<string, number> = { a4: 28, a5: 20 };

const InvoiceDocument = forwardRef<HTMLDivElement, {
  invoice: Invoice;
  company: Company;
  useLetterhead?: boolean;
  showLetterheadImage?: boolean;
  size?: string;
  withSeal?: boolean;
  withSignature?: boolean;
}>(function InvoiceDocument(
  { invoice, company, useLetterhead = false, showLetterheadImage = true, size = "a4", withSeal = false, withSignature = false },
  ref
) {
  const totals = calcTotals(invoice);
  const items = invoice.items || [];
  const customLetterhead = useLetterhead ? getCustomLetterhead(company, size) : null;
  const seal = withSeal ? resolveSeal(company) : null;
  const signature = withSignature ? resolveSignature(company) : null;
  // Date/invoice-number now render in the letterhead's own top-left corner block
  // (both the generated template and a custom uploaded image show it there), so
  // the body meta box only needs to appear when there's no letterhead at all, or
  // when there's a dueDate/validUntil that the corner block doesn't cover.
  const showDatesBox =
    !useLetterhead ||
    Boolean(invoice.dueDate) ||
    (invoice.type === "proforma" && Boolean(invoice.validUntil));
  const contentRef = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState<{ scale: number; height: number | null }>({ scale: 1, height: null });

  useLayoutEffect(() => {
    if (!useLetterhead || !contentRef.current) {
      setFit({ scale: 1, height: null });
      return;
    }
    const pageEl = contentRef.current.closest(".doc-page") as HTMLElement | null;
    if (!pageEl) return;
    const spec = PAGE_SIZES[size] || PAGE_SIZES.a4;
    const pxPerMM = pageEl.getBoundingClientRect().width / spec.w;
    const cs = getComputedStyle(pageEl);
    const availablePx =
      (spec.h - PAGE_SAFETY_MM - (LETTERHEAD_FOOTER_CLEARANCE_MM[size] || 28)) * pxPerMM -
      parseFloat(cs.paddingTop) -
      parseFloat(cs.paddingBottom);
    const el = contentRef.current;
    const heightAt = (s: number) => {
      el.style.width = s < 1 ? `${100 / s}%` : "";
      return el.scrollHeight * s;
    };
    let scale = 1;
    if (heightAt(1) > availablePx) {
      let lo = LETTERHEAD_MIN_SCALE;
      let hi = 1;
      for (let i = 0; i < 10; i += 1) {
        const mid = (lo + hi) / 2;
        if (heightAt(mid) <= availablePx) lo = mid;
        else hi = mid;
      }
      scale = lo;
    }
    const height = heightAt(scale);
    setFit(scale < 1 ? { scale, height } : { scale: 1, height: null });
  }, [useLetterhead, invoice, size, company, withSeal, withSignature]);

  return (
    <div
      className={`doc-page size-${size}${useLetterhead ? " doc-page-letterhead" : ""}`}
      style={pageStyleVars(size, customLetterhead)}
      ref={ref}
    >
      <style media="print">{`@page { size: ${size.toUpperCase()} portrait; margin: 0; }`}</style>
      {useLetterhead ? (
        <Letterhead company={company} size={size} date={invoice.date} number={invoice.number} showArtwork={showLetterheadImage} />
      ) : (
        <div className="doc-header">
          <div className="doc-brand">
            {resolveLogo(company) ? <img src={resolveLogo(company)!} alt="لوگو شرکت" /> : null}
            <div>
              <div className="doc-brand-name">
                {company.name}
                {company.companyType ? ` (${company.companyType})` : ""}
              </div>
              <div className="doc-brand-address">{company.address}</div>
              {company.registrationNumber ? <div className="doc-brand-reg">شماره ثبت: {company.registrationNumber}</div> : null}
              {company.nationalId ? <div className="doc-brand-reg">شناسه ملی: {company.nationalId}</div> : null}
            </div>
          </div>
          <div className="doc-title-box">
            <div className="doc-type">{TYPE_LABELS[invoice.type] || "فاکتور"}</div>
          </div>
        </div>
      )}

      <div className="doc-scale-outer" style={fit.height != null ? { height: fit.height } : undefined}>
        <div
          ref={contentRef}
          style={
            fit.scale < 1
              ? { width: `${100 / fit.scale}%`, transform: `scale(${fit.scale})`, transformOrigin: "top right" }
              : undefined
          }
        >
          {useLetterhead && (
            <div className="doc-header doc-header-letterhead">
              <div className="doc-title-box">
                <div className="doc-type">{TYPE_LABELS[invoice.type] || "فاکتور"}</div>
              </div>
            </div>
          )}
          <div className="doc-meta">
            {showDatesBox && (
              <div className="doc-meta-box">
                {!useLetterhead ? (
                  <>
                    <div className="row">
                      <span>شماره {TYPE_LABELS[invoice.type]}:</span>
                      <b>{invoice.number}</b>
                    </div>
                    <div className="row">
                      <span>تاریخ صدور:</span>
                      <b>{invoice.date}</b>
                    </div>
                  </>
                ) : null}
                {invoice.dueDate ? (
                  <div className="row">
                    <span>تاریخ سررسید:</span>
                    <b>{invoice.dueDate}</b>
                  </div>
                ) : null}
                {invoice.type === "proforma" && invoice.validUntil ? (
                  <div className="row">
                    <span>تاریخ اعتبار پیش‌فاکتور:</span>
                    <b>{invoice.validUntil}</b>
                  </div>
                ) : null}
              </div>
            )}
            <div className="doc-meta-box">
              <div className="row">
                <span>خریدار / سازمان:</span>
                <b>{invoice.customer?.name}</b>
              </div>
              {invoice.customer?.economicCode ? (
                <div className="row">
                  <span>کد اقتصادی:</span>
                  <b>{invoice.customer.economicCode}</b>
                </div>
              ) : null}
              {invoice.customer?.nationalId ? (
                <div className="row">
                  <span>شناسه/کد ملی:</span>
                  <b>{invoice.customer.nationalId}</b>
                </div>
              ) : null}
              {invoice.customer?.phone ? (
                <div className="row">
                  <span>تلفن:</span>
                  <b>{invoice.customer.phone}</b>
                </div>
              ) : null}
              {invoice.customer?.address ? (
                <div className="row">
                  <span>آدرس:</span>
                  <b>{invoice.customer.address}</b>
                </div>
              ) : null}
            </div>
          </div>

          <table className="doc-table">
            <thead>
              <tr>
                <th style={{ width: "5%" }}>ردیف</th>
                <th style={{ width: "34%" }}>شرح کالا / خدمات</th>
                <th style={{ width: "9%" }}>واحد</th>
                <th style={{ width: "10%" }}>تعداد</th>
                <th style={{ width: "14%" }}>قیمت واحد (ریال)</th>
                <th style={{ width: "9%" }}>تخفیف</th>
                <th style={{ width: "19%" }}>قیمت کل (ریال)</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item, idx) => {
                const qty = Number(item.quantity) || 0;
                const price = Number(item.unitPrice) || 0;
                const discountPercent = Number(item.discountPercent) || 0;
                const gross = qty * price;
                const total = gross - gross * (discountPercent / 100);
                return (
                  <tr key={item.id}>
                    <td>{idx + 1}</td>
                    <td className="desc">{item.description}</td>
                    <td>{item.unit || "-"}</td>
                    <td>{formatNumber(qty)}</td>
                    <td>{formatNumber(price)}</td>
                    <td>{discountPercent ? `${formatNumber(discountPercent)}٪` : "-"}</td>
                    <td>{formatNumber(total)}</td>
                  </tr>
                );
              })}
              {items.length === 0 && (
                <tr>
                  <td colSpan={7} style={{ color: "#999", padding: "16px" }}>
                    هیچ کالا یا خدماتی ثبت نشده است.
                  </td>
                </tr>
              )}
            </tbody>
          </table>

          <div className="doc-totals">
            <table>
              <tbody>
                <tr>
                  <td className="label">جمع کل قبل از تخفیف:</td>
                  <td>{formatNumber(totals.itemsGross)} ریال</td>
                </tr>
                <tr>
                  <td className="label">جمع تخفیف اقلام:</td>
                  <td>{formatNumber(totals.itemsDiscount)} ریال</td>
                </tr>
                {totals.extraDiscount > 0 && (
                  <tr>
                    <td className="label">تخفیف کلی فاکتور:</td>
                    <td>{formatNumber(totals.extraDiscount)} ریال</td>
                  </tr>
                )}
                <tr>
                  <td className="label">مبلغ قابل محاسبه مالیات:</td>
                  <td>{formatNumber(totals.afterDiscount)} ریال</td>
                </tr>
                <tr>
                  <td className="label">مالیات بر ارزش افزوده ({formatNumber(totals.taxPercent)}٪):</td>
                  <td>{formatNumber(totals.taxAmount)} ریال</td>
                </tr>
                <tr className="grand">
                  <td>مبلغ نهایی قابل پرداخت:</td>
                  <td>{formatNumber(totals.grandTotal)} ریال</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="doc-words">مبلغ به حروف: {amountToWordsWithUnit(totals.grandTotal, "ریال")}</div>

          {invoice.type === "invoice" && company.iban ? (
            <div className="doc-payment">
              شماره شبا جهت واریز مبلغ فاکتور به نام {company.name}: <b>{company.iban}</b>
            </div>
          ) : null}

          {invoice.notes ? <div className="doc-notes">توضیحات: {invoice.notes}</div> : null}

          <div className="doc-signatures">
            <div className="sign-box">
              <div>مهر و امضای فروشنده</div>
              {company.ceoName || signature ? (
                <div className={`sign-nameblock${signature ? " has-signature" : ""}`}>
                  {company.ceoName ? <div className="sign-name">{company.ceoName}</div> : null}
                  {signature ? <img className="sign-signature" src={signature} alt="امضای مدیرعامل" /> : null}
                </div>
              ) : null}
              {seal ? (
                <div className="sign-marks">
                  <img className="sign-seal" src={seal} alt="مهر شرکت" />
                </div>
              ) : null}
            </div>
            <div className="sign-box">مهر و امضای خریدار</div>
          </div>
        </div>
      </div>

      {!useLetterhead && (
        <div className="doc-footer">
          {company.name} — تاریخ چاپ: {gregorianToJalaliDisplay(new Date())}
        </div>
      )}
    </div>
  );
});

export default InvoiceDocument;
