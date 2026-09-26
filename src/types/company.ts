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
export const COMPANY_FIELDS: (keyof Company)[] = [
  "companyType", "address", "letterheadAddress", "postalCode", "email", "phone",
  "economicCode", "nationalId", "registrationNumber", "ceoName", "logo", "seal",
  "signature", "letterheads", "iban",
];
