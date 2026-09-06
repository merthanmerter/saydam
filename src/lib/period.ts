/** Dönem = YYYYMM integer. Tarih matematiği tek yerde. */
export type Period = number;

export const periodOf = (date: Date): Period =>
  date.getFullYear() * 100 + date.getMonth() + 1;

export const currentPeriod = (): Period => periodOf(new Date());

export const periodParts = (p: Period) => ({
  year: Math.floor(p / 100),
  month: p % 100,
});

export const addMonths = (p: Period, n: number): Period => {
  const { year, month } = periodParts(p);
  const zero = year * 12 + (month - 1) + n;
  return Math.floor(zero / 12) * 100 + (zero % 12) + 1;
};

export const isValidPeriod = (p: unknown): p is Period =>
  typeof p === "number" &&
  Number.isInteger(p) &&
  p >= 200001 &&
  p <= 299912 &&
  p % 100 >= 1 &&
  p % 100 <= 12;

const MONTHS = [
  "Ocak",
  "Şubat",
  "Mart",
  "Nisan",
  "Mayıs",
  "Haziran",
  "Temmuz",
  "Ağustos",
  "Eylül",
  "Ekim",
  "Kasım",
  "Aralık",
];

export const periodLabel = (p: Period): string => {
  const { year, month } = periodParts(p);
  return `${MONTHS[month - 1]} ${year}`;
};

export const yearRange = (year: number): [Period, Period] => [
  year * 100 + 1,
  year * 100 + 12,
];
