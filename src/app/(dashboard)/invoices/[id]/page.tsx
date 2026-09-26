import { notFound } from "next/navigation";
import InvoiceEditor from "../../../../components/invoice/InvoiceEditor";
import { fetchInvoice } from "../../../../server/actions/invoices";

export default async function EditInvoicePage({ params }: { params: { id: string } }) {
  const invoice = await fetchInvoice(params.id);
  if (!invoice) notFound();
  return <InvoiceEditor type={invoice.type} initialInvoice={invoice} />;
}
