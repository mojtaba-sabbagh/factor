import { notFound } from "next/navigation";
import PrintView from "../../../../../components/invoice/PrintView";
import { fetchInvoice } from "../../../../../server/actions/invoices";
import { fetchOwnCompany } from "../../../../../server/actions/companies";

export default async function PrintInvoicePage({ params }: { params: { id: string } }) {
  const [invoice, company] = await Promise.all([fetchInvoice(params.id), fetchOwnCompany()]);
  if (!invoice || !company) notFound();
  return <PrintView invoice={invoice} company={company} />;
}
