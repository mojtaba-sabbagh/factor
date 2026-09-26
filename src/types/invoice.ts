export type DocType = "invoice" | "proforma";

export type InvoiceItem = {
  id: string;
  description: string;
  unit: string;
  quantity: number | string;
  unitPrice: number | string;
  discountPercent: number | string;
};

export type Customer = {
  name?: string;
  economicCode?: string;
  nationalId?: string;
  phone?: string;
  address?: string;
};

export type Invoice = {
  id: string;
  type: DocType;
  number: string;
  date: string; // Jalali "YYYY/MM/DD"
  dueDate?: string | null;
  validUntil?: string | null;
  customer: Customer;
  items: InvoiceItem[];
  extraDiscount: number;
  taxPercent: number;
  notes: string;
  createdAt?: string;
};

export function createEmptyItem(): InvoiceItem {
  return {
    id: `item_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    description: "",
    unit: "",
    quantity: 1,
    unitPrice: 0,
    discountPercent: 0,
  };
}

export function createEmptyInvoice(type: DocType): Invoice {
  return {
    id: crypto.randomUUID(),
    type,
    number: "",
    date: "",
    dueDate: "",
    validUntil: "",
    customer: {},
    items: [createEmptyItem()],
    extraDiscount: 0,
    taxPercent: 10,
    notes: "",
  };
}
