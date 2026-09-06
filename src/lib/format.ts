const TRY = new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY" });
const NUM = new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 2 });
const DATE = new Intl.DateTimeFormat("tr-TR", { dateStyle: "medium" });
const DATETIME = new Intl.DateTimeFormat("tr-TR", {
  dateStyle: "medium",
  timeStyle: "short",
});

export { addMonths, currentPeriod, periodLabel } from "./period.ts";

export const money = (cents: number) => TRY.format((cents ?? 0) / 100);
export const number = (value: number) => NUM.format(value ?? 0);
export const date = (value: string | Date) => DATE.format(new Date(value));
export const dateTime = (value: string | Date) => DATETIME.format(new Date(value));

/**
 * "1.234,56" ya da "1234.56" → kuruş. Ayrıştırılamayan girdide `NaN`.
 *
 * Boş metin de `NaN`: `Number("")` sıfır döndürdüğü için boş bırakılmış bir
 * tutar alanı sessizce ₺0 oluyordu.
 */
export const toCents = (input: string) => {
  const raw = input.trim().replace(/[\s₺]/g, "");
  if (raw === "") return Number.NaN;
  const normalized = raw.includes(",") ? raw.replace(/\./g, "").replace(",", ".") : raw;
  const value = Number(normalized);
  return Number.isFinite(value) ? Math.round(value * 100) : Number.NaN;
};

export const fromCents = (cents: number) => (cents / 100).toFixed(2);

export const today = () => new Date().toISOString().slice(0, 10);

export const initials = (name?: string | null) =>
  (name ?? "?")
    .split(" ")
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
