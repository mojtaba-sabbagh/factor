import { notFound } from "next/navigation";
import InvoiceEditor from "../../../../components/invoice/InvoiceEditor";
import type { DocType } from "../../../../types/invoice";

export default function NewInvoicePage({ params }: { params: { type: string } }) {
  if (params.type !== "invoice" && params.type !== "proforma") notFound();
  return <InvoiceEditor type={params.type as DocType} />;
}
