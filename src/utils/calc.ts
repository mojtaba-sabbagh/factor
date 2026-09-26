import type { InvoiceItem, Invoice } from "../types/invoice";

export function rowTotal(item: InvoiceItem): number {
  const qty = Number(item.quantity) || 0;
  const price = Number(item.unitPrice) || 0;
  const discountPercent = Number(item.discountPercent) || 0;
  const gross = qty * price;
  return gross - gross * (discountPercent / 100);
}

export function calcTotals(invoice: Pick<Invoice, "items" | "extraDiscount" | "taxPercent">) {
  const items = invoice.items || [];
  const itemsGross = items.reduce((sum, item) => sum + (Number(item.quantity) || 0) * (Number(item.unitPrice) || 0), 0);
  const itemsDiscount = items.reduce((sum, item) => {
    const gross = (Number(item.quantity) || 0) * (Number(item.unitPrice) || 0);
    return sum + gross * ((Number(item.discountPercent) || 0) / 100);
  }, 0);
  const extraDiscount = Number(invoice.extraDiscount) || 0;
  const afterDiscount = Math.max(itemsGross - itemsDiscount - extraDiscount, 0);
  const taxPercent = Number(invoice.taxPercent) || 0;
  const taxAmount = afterDiscount * (taxPercent / 100);
  const grandTotal = afterDiscount + taxAmount;

  return { itemsGross, itemsDiscount, extraDiscount, afterDiscount, taxPercent, taxAmount, grandTotal };
}
