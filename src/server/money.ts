import { addMonths, type Period } from "./period.ts";

/**
 * Para hesapları. Tüm tutarlar kuruş (integer). Bölme yapılan her yerde
 * "en büyük kalan" yöntemi kullanılır; parçaların toplamı her zaman tam olarak
 * bölünen tutara eşittir, bir kuruş bile kaybolmaz.
 */

/** Toplamı `total` olacak şekilde ağırlıklara göre dağıtır. */
export function distribute(total: number, weights: number[]): number[] {
  const sum = weights.reduce((a, b) => a + b, 0);
  if (sum <= 0 || weights.length === 0) return weights.map(() => 0);

  const exact = weights.map((w) => (total * w) / sum);
  const floors = exact.map(Math.floor);
  let remainder = total - floors.reduce((a, b) => a + b, 0);

  const order = exact
    .map((value, index) => ({ index, frac: value - Math.floor(value) }))
    .sort((a, b) => b.frac - a.frac);

  const result = [...floors];
  for (let i = 0; remainder > 0 && i < order.length; i++, remainder--) {
    const idx = order[i]!.index;
    result[idx] = (result[idx] ?? 0) + 1;
  }
  return result;
}

/** Eşit taksitlere böler (kalan ilk taksitlere dağıtılır). */
export const splitEvenly = (total: number, parts: number): number[] =>
  distribute(
    total,
    Array.from({ length: parts }, () => 1),
  );

/** İşletme/sermaye payı eklenmiş toplam. */
export const withSurcharge = (amount: number, surchargePct: number): number =>
  Math.round(amount * (1 + surchargePct / 100));

/**
 * KMK m.20'deki paylaşım yöntemleri. Yasa yalnızca bu ikisini tanır:
 *   esit      → kapıcı, kaloriferci, bahçıvan, bekçi giderleri (daire başına eşit)
 *   arsa_payi → sigorta, ortak yer bakım-onarım, yönetici aylığı, ortak tesis
 * Yasa "aralarında başka türlü anlaşma olmadıkça" dediği için yöntem her
 * kalemde ayrı ayrı seçilebilir. m² hukuken bir paylaşım ölçüsü değildir.
 */
export type ShareMethod = "esit" | "arsa_payi";

/**
 * Daire içinde kimin yükümlü olduğu. Site yönetimine karşı asıl sorumlu her
 * zaman maliktir (KMK m.20); kiracı kira bedeli kadar müteselsil sorumludur
 * (m.22). Bu ayrım malik ile kiracı arasındaki paylaşımı gösterir: kullanıma
 * bağlı yan giderler kira sözleşmesi gereği kiracıya aittir (TBK m.303).
 */
export type Payer = "malik" | "kiraci";

/**
 * Bir kalemin payı fiilen kime yazılır. Daire kirada değilse kiracıya
 * işaretlenmiş kalem de malike düşer; aksi hâlde borcun bir kısmı sahipsiz
 * kalır ve daire toplamı tutmazdı.
 */
export const payerFor = (linePayer: Payer, hasTenant: boolean): Payer =>
  linePayer === "kiraci" && hasTenant ? "kiraci" : "malik";

export type ShareUnit = {
  /** Tapudaki arsa payı. */
  arsaPayi: number;
};

/** Bir yönteme göre daire ağırlıkları. Ondalıkları korumak için ×10.000. */
function weightsFor(units: ShareUnit[], method: ShareMethod): number[] {
  if (method === "esit") return units.map(() => 1);
  return units.map((u) => Math.round(u.arsaPayi * 10_000));
}

/** Bir gider kalemini seçilen yönteme göre dairelere böler. */
export const shareBy = (total: number, units: ShareUnit[], method: ShareMethod): number[] =>
  distribute(total, weightsFor(units, method));

/**
 * TL metnini kuruşa çevirir. Virgül varsa Türkçe biçim kabul edilir
 * ("1.234,56"), yoksa nokta ondalık ayracıdır ("1234.56").
 */
export function parseAmountToCents(input: string | number): number {
  if (typeof input === "number") return Math.round(input * 100);
  const raw = input.trim().replace(/[\s₺]/g, "");
  const normalized = raw.includes(",") ? raw.replace(/\./g, "").replace(",", ".") : raw;
  const value = Number(normalized);
  if (!Number.isFinite(value)) throw new Error(`Geçersiz tutar: ${input}`);
  return Math.round(value * 100);
}

/** Olağanüstü bir masrafın taksit planı: işletme payı eklenir, aylara bölünür. */
export function installmentPlan(
  amountCents: number,
  startPeriod: Period,
  installments: number,
  surchargePct: number,
) {
  const total = withSurcharge(amountCents, surchargePct);
  return splitEvenly(total, installments).map((cents, index) => ({
    period: addMonths(startPeriod, index),
    amountCents: cents,
  }));
}

/**
 * Borç yapılandırma planı.
 *
 * Yapılandırılan anaparaya isteğe bağlı bir **vade farkı** eklenir ve toplam
 * aylık taksitlere bölünür. Vade farkı gecikme tazminatının yerine geçmez;
 * yapılandırma yürürlükteyken gecikme tazminatı bu taksitlerin vadesine göre
 * işler, eski aidat vadelerine göre değil.
 */
export function restructurePlan(
  principalCents: number,
  interestPct: number,
  installments: number,
  firstDueDate: string,
) {
  const totalCents = withSurcharge(principalCents, interestPct);
  const first = new Date(`${firstDueDate}T00:00:00Z`);
  return {
    principalCents,
    interestCents: totalCents - principalCents,
    totalCents,
    rows: splitEvenly(totalCents, installments).map((amountCents, index) => ({
      no: index + 1,
      // Ayın kaçı seçildiyse her taksit o güne düşer; kısa aylarda ay sonuna
      // taşar diye gün, ayın son gününü aşmayacak biçimde kırpılır.
      dueDate: addMonthsToDate(first, index),
      amountCents,
    })),
  };
}

/** Tarihe ay ekler; 31 Ocak + 1 ay → 28/29 Şubat. */
function addMonthsToDate(date: Date, months: number): string {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth() + months;
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return new Date(Date.UTC(year, month, Math.min(date.getUTCDate(), lastDay)))
    .toISOString()
    .slice(0, 10);
}

/**
 * Kartla ödemede yansıtılan komisyon farkı. Sakinden tahsil edilen tutar
 * borcun üstüne bu farkı ekler; borca işlenen tutar değişmez, fark sağlayıcıya
 * gider ve kasaya girmez.
 */
export const cardFee = (amountCents: number, feePct: number): number =>
  feePct <= 0 ? 0 : Math.round((amountCents * feePct) / 100);
