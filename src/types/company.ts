export type Company = {
  id: string;
  name: string;
  active: boolean;
  companyType: string;
  address: string;
  letterheadAddress: string;
  postalCode: string;
  email: string;
  phone: string;
  economicCode: string;
  nationalId: string;
  registrationNumber: string;
  ceoName: string;
  logo: string;
  seal: string;
  signature: string;
  letterheads: Record<string, string>; // size -> data URL of a custom letterhead image
  iban: string;
};

export const EMPTY_COMPANY: Company = {
  id: "",
  name: "",
  active: true,
  companyType: "",
  address: "",
  letterheadAddress: "",
  postalCode: "",
  email: "",
  phone: "",
  economicCode: "",
  nationalId: "",
  registrationNumber: "",
  ceoName: "",
  logo: "",
  seal: "",
  signature: "",
  letterheads: {},
  iban: "",
};

// Fields stored inside companies.settings jsonb (name/active/id live in their own columns).
// Narrowing the type to "everything except the real columns" also makes
// `company[field]` resolve to `string | Record<string, string>` instead of the
// whole Company value union, which is what the jsonb column can hold.
export type CompanySettingField = Exclude<keyof Company, "id" | "name" | "active">;

export const COMPANY_FIELDS: CompanySettingField[] = [
  "companyType", "address", "letterheadAddress", "postalCode", "email", "phone",
  "economicCode", "nationalId", "registrationNumber", "ceoName", "logo", "seal",
  "signature", "letterheads", "iban",
];
