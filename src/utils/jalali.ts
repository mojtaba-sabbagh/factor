export const PERSIAN_MONTHS = [
  "فروردین", "اردیبهشت", "خرداد", "تیر", "مرداد", "شهریور",
  "مهر", "آبان", "آذر", "دی", "بهمن", "اسفند",
];

function div(a: number, b: number) {
  return Math.trunc(a / b);
}

// Standard Jalali <-> Gregorian conversion (algorithm as used across most JS
// implementations, e.g. jalaali-js), re-implemented here to avoid an extra dependency.
export function toJalali(gy: number, gm: number, gd: number) {
  const g2d = gregorianToJulian(gy, gm, gd);
  return julianToJalali(g2d);
}

export function toGregorian(jy: number, jm: number, jd: number) {
  const j2d = jalaliToJulian(jy, jm, jd);
  return julianToGregorian(j2d);
}

export function jalaliMonthLength(jy: number, jm: number): number {
  if (jm <= 6) return 31;
  if (jm <= 11) return 30;
  return jalaliIsLeapSimple(jy) ? 30 : 29;
}

// Simpler, well-known leap rule (33-year cycle approximation) used just for month
// length — accurate for any date range this app will realistically issue invoices in.
function jalaliIsLeapSimple(jy: number): boolean {
  const r = jy % 33;
  return [1, 5, 9, 13, 17, 22, 26, 30].includes(r);
}

function gregorianToJulian(gy: number, gm: number, gd: number) {
  const d =
    div((gy + div(gm - 8, 6) + 100100) * 1461, 4) +
    div(153 * ((gm + 9) % 12) + 2, 5) +
    gd -
    34840408;
  return d - div(div(gy + 100100 + div(gm - 8, 6), 100) * 3, 4) + 752;
}

function julianToGregorian(jdn: number) {
  let j = 4 * jdn + 139361631;
  j += div(div(4 * jdn + 183187720, 146097) * 3, 4) * 4 - 3908;
  const i = div((j % 1461), 4) * 5 + 308;
  const gd = div(i % 153, 5) + 1;
  const gm = (div(i, 153) % 12) + 1;
  const gy = div(j, 1461) - 100100 + div(8 - gm, 6);
  return { gy, gm, gd };
}

function jalaliToJulian(jy: number, jm: number, jd: number) {
  const base = jy - (jy >= 0 ? 474 : 473);
  const epy = 474 + (base % 2820);
  return (
    jd +
    (jm <= 7 ? (jm - 1) * 31 : (jm - 1) * 30 + 6) +
    div(epy * 682 - 110, 2816) +
    (epy - 1) * 365 +
    div(base, 2820) * 1029983 +
    1948320.5 - 0.5
  );
}

function julianToJalali(jdn: number) {
  const depoch = jdn - jalaliToJulian(475, 1, 1);
  const cycle = div(depoch, 1029983);
  const cyear = depoch % 1029983;
  let ycycle: number;
  if (cyear === 1029982) {
    ycycle = 2820;
  } else {
    const aux1 = div(cyear, 366);
    const aux2 = cyear % 366;
    ycycle = div(2134 * aux1 + 2816 * aux2 + 2815, 1028522) + aux1 + 1;
  }
  let jy = ycycle + 2820 * cycle + 474;
  if (jy <= 0) jy -= 1;
  const tjd1 = jalaliToJulian(jy, 1, 1);
  const yday = jdn - tjd1 + 1;
  const jm = yday <= 186 ? Math.ceil(yday / 31) : Math.ceil((yday - 6) / 30);
  const jd = jdn - jalaliToJulian(jy, jm, 1) + 1;
  return { jy, jm, jd };
}

export function gregorianToJalaliDisplay(date: Date): string {
  const { jy, jm, jd } = toJalali(date.getFullYear(), date.getMonth() + 1, date.getDate());
  return `${jy}/${String(jm).padStart(2, "0")}/${String(jd).padStart(2, "0")}`;
}
