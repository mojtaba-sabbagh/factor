const ONES = ["", "یک", "دو", "سه", "چهار", "پنج", "شش", "هفت", "هشت", "نه"];
const TENS_TEEN = [
  "ده", "یازده", "دوازده", "سیزده", "چهارده", "پانزده", "شانزده", "هفده", "هجده", "نوزده",
];
const TENS = ["", "", "بیست", "سی", "چهل", "پنجاه", "شصت", "هفتاد", "هشتاد", "نود"];
const HUNDREDS = [
  "", "صد", "دویست", "سیصد", "چهارصد", "پانصد", "ششصد", "هفتصد", "هشتصد", "نهصد",
];
const SCALES = ["", "هزار", "میلیون", "میلیارد", "بیلیون"];

function threeDigitsToWords(n: number): string {
  const parts: string[] = [];
  const h = Math.floor(n / 100);
  const rest = n % 100;
  if (h) parts.push(HUNDREDS[h]);
  if (rest >= 10 && rest < 20) {
    parts.push(TENS_TEEN[rest - 10]);
  } else {
    const t = Math.floor(rest / 10);
    const o = rest % 10;
    if (t) parts.push(TENS[t]);
    if (o) parts.push(ONES[o]);
  }
  return parts.join(" و ");
}

export function numberToWords(value: number): string {
  const n = Math.round(Math.abs(value));
  if (n === 0) return "صفر";

  const groups: number[] = [];
  let remaining = n;
  while (remaining > 0) {
    groups.unshift(remaining % 1000);
    remaining = Math.floor(remaining / 1000);
  }

  const parts: string[] = [];
  const offset = groups.length - 1;
  groups.forEach((group, idx) => {
    if (!group) return;
    const scale = SCALES[offset - idx];
    parts.push(scale ? `${threeDigitsToWords(group)} ${scale}` : threeDigitsToWords(group));
  });

  return (value < 0 ? "منفی " : "") + parts.join(" و ");
}

export function amountToWordsWithUnit(value: number, unit: string): string {
  return `${numberToWords(value)} ${unit}`;
}
