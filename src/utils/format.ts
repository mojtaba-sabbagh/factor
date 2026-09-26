const PERSIAN_DIGITS = ["۰", "۱", "۲", "۳", "۴", "۵", "۶", "۷", "۸", "۹"];

export function formatNumber(value: number | string): string {
  const n = Number(value);
  if (!Number.isFinite(n)) return "۰";
  const grouped = Math.round(n).toLocaleString("en-US");
  return grouped.replace(/[0-9]/g, (d) => PERSIAN_DIGITS[Number(d)]);
}
