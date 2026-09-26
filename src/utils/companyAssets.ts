import type { Company } from "../types/company";

// "default" means "use the bundled artwork under /public/assets"; an empty string
// means "none"; anything else is a data: URL the company uploaded.
const DEFAULT_SEAL = "/assets/default-seal.png";
const DEFAULT_SIGNATURE = "/assets/default-signature.png";

export function resolveLogo(company: Company): string | null {
  if (!company.logo || company.logo === "default") return null; // no bundled default logo — company must upload one
  return company.logo;
}

export function resolveSeal(company: Company): string | null {
  if (!company.seal) return null;
  return company.seal === "default" ? DEFAULT_SEAL : company.seal;
}

export function resolveSignature(company: Company): string | null {
  if (!company.signature) return null;
  return company.signature === "default" ? DEFAULT_SIGNATURE : company.signature;
}

export function getCustomLetterhead(company: Company, size: string): { src: string } | null {
  // A4 and A5 share the same aspect ratio. When an A5-specific artwork has not
  // been uploaded yet, reusing the A4 artwork gives A5 invoices a real
  // letterhead instead of silently falling back to the generated template.
  // A dedicated A5 file always takes precedence.
  const src = company.letterheads?.[size] || (size === "a5" ? company.letterheads?.a4 : undefined);
  return src ? { src } : null;
}
