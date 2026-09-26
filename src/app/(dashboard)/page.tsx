import Link from "next/link";
import { fetchInvoices, deleteInvoiceAction } from "../../server/actions/invoices";
import { formatNumber } from "../../utils/format";
import { calcTotals } from "../../utils/calc";
import EmptyState from "../../components/layout/EmptyState";

const TYPE_LABELS: Record<string, string> = { invoice: "فاکتور", proforma: "پیش‌فاکتور" };

export default async function InvoiceListPage() {
  const invoices = await fetchInvoices();

  return (
    <div>
      <h1 className="page-title">فاکتورها و پیش‌فاکتورها</h1>
      <p className="page-subtitle">سوابق اسناد صادر شده برای شرکت شما.</p>

      {invoices.length === 0 ? (
        <EmptyState>
          هنوز سندی صادر نشده است. از منوی سمت راست «صدور فاکتور جدید» یا «صدور پیش‌فاکتور جدید» را
          انتخاب کنید.
        </EmptyState>
      ) : (
        <div className="card">
          <table className="table">
            <thead>
              <tr>
                <th>نوع</th>
                <th>شماره</th>
                <th>تاریخ</th>
                <th>خریدار</th>
                <th>مبلغ کل (ریال)</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((invoice) => {
                const totals = calcTotals(invoice);
                return (
                  <tr key={invoice.id}>
                    <td>{TYPE_LABELS[invoice.type] || invoice.type}</td>
                    <td>{invoice.number}</td>
                    <td>{invoice.date}</td>
                    <td>{invoice.customer?.name || "-"}</td>
                    <td>{formatNumber(totals.grandTotal)}</td>
                    <td style={{ display: "flex", gap: 6 }}>
                      <Link href={`/invoices/${invoice.id}`} className="btn btn-outline btn-sm">
                        ویرایش
                      </Link>
                      <Link href={`/invoices/${invoice.id}/print`} className="btn btn-outline btn-sm">
                        چاپ
                      </Link>
                      <form action={deleteInvoiceAction.bind(null, invoice.id)}>
                        <button type="submit" className="btn btn-danger btn-sm">
                          حذف
                        </button>
                      </form>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
