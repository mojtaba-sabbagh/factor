"use client";

import { rowTotal } from "../../utils/calc";
import { formatNumber } from "../../utils/format";
import { createEmptyItem, type InvoiceItem } from "../../types/invoice";

export default function ItemsEditor({
  items,
  onChange,
}: {
  items: InvoiceItem[];
  onChange: (items: InvoiceItem[]) => void;
}) {
  function updateItem(id: string, field: keyof InvoiceItem, value: string) {
    onChange(items.map((item) => (item.id === id ? { ...item, [field]: value } : item)));
  }

  function addItem() {
    onChange([...items, createEmptyItem()]);
  }

  function removeItem(id: string) {
    onChange(items.filter((item) => item.id !== id));
  }

  return (
    <div>
      <table className="table items-table">
        <thead>
          <tr>
            <th style={{ width: "4%" }}>ردیف</th>
            <th style={{ width: "25%" }}>شرح کالا / خدمات</th>
            <th style={{ width: "10%" }}>واحد</th>
            <th style={{ width: "10%" }}>تعداد</th>
            <th style={{ width: "16%" }}>قیمت واحد (ریال)</th>
            <th style={{ width: "10%" }}>تخفیف (٪)</th>
            <th style={{ width: "20%" }}>جمع (ریال)</th>
            <th style={{ width: "5%" }}></th>
          </tr>
        </thead>
        <tbody>
          {items.map((item, idx) => (
            <tr key={item.id}>
              <td>{idx + 1}</td>
              <td>
                <input
                  value={item.description}
                  onChange={(e) => updateItem(item.id, "description", e.target.value)}
                  placeholder="شرح کالا یا خدمات"
                />
              </td>
              <td>
                <input value={item.unit} onChange={(e) => updateItem(item.id, "unit", e.target.value)} />
              </td>
              <td>
                <input
                  type="number"
                  min="0"
                  value={item.quantity}
                  onChange={(e) => updateItem(item.id, "quantity", e.target.value)}
                />
              </td>
              <td>
                <input
                  type="number"
                  min="0"
                  value={item.unitPrice}
                  onChange={(e) => updateItem(item.id, "unitPrice", e.target.value)}
                />
              </td>
              <td>
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={item.discountPercent}
                  onChange={(e) => updateItem(item.id, "discountPercent", e.target.value)}
                />
              </td>
              <td style={{ textAlign: "left", paddingLeft: 10, fontWeight: 600 }}>
                {formatNumber(rowTotal(item))}
              </td>
              <td>
                <button
                  type="button"
                  className="btn btn-sm btn-danger"
                  onClick={() => removeItem(item.id)}
                  title="حذف ردیف"
                >
                  ✕
                </button>
              </td>
            </tr>
          ))}
          {items.length === 0 && (
            <tr>
              <td colSpan={8} style={{ textAlign: "center", color: "#999", padding: 16 }}>
                هنوز کالا یا خدماتی اضافه نشده است.
              </td>
            </tr>
          )}
        </tbody>
      </table>
      <div style={{ marginTop: 10 }}>
        <button type="button" className="btn btn-outline btn-sm" onClick={addItem}>
          + افزودن ردیف
        </button>
      </div>
    </div>
  );
}
