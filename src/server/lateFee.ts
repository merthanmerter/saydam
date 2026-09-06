/**
 * Gecikme tazminatı (KMK m.20/c): ödenmeyen ortak gider borcuna **aylık %5**
 * işler. Yönetim planı farklı bir oran öngörebildiği için oran siteden gelir.
 *
 * Ödemeler daireye toplu yapılır, tek tek aidatlara değil. Bu yüzden hangi
 * aidatın ödenmemiş sayılacağını belirlemek gerekir: ödemeler **en eski
 * borçtan başlayarak** mahsup edilir (FIFO). Uygulamada ve içtihatta kabul
 * gören yöntem budur; borçluyu da en az cezalandıran yorumdur.
 */
export type DueRow = { amountCents: number; dueDate: string | Date };

type LateFeeResult = {
  /** Ödenmemiş anaparanın tamamı (vadesi gelmemişler dahil). */
  outstandingCents: number;
  /** Yalnızca vadesi geçmiş anapara. */
  overdueCents: number;
  /** Vadesi bu ayı AŞAN, dolayısıyla bu ay istenmeyecek anapara. */
  notYetDueCents: number;
  /** İşlemiş gecikme tazminatı. */
  lateFeeCents: number;
  /** Gecikmiş her aidat için ayrı döküm. */
  items: {
    dueDate: string;
    remainingCents: number;
    months: number;
    feeCents: number;
  }[];
};

/** İki tarih arasındaki tam ay sayısı; başlanan ay sayılmaz. */
export function monthsBetween(from: Date, to: Date): number {
  let months =
    (to.getUTCFullYear() - from.getUTCFullYear()) * 12 +
    (to.getUTCMonth() - from.getUTCMonth());
  if (to.getUTCDate() < from.getUTCDate()) months -= 1;
  return Math.max(0, months);
}

export function computeLateFee(
  dues: DueRow[],
  paidCents: number,
  ratePct: number,
  today = new Date(),
): LateFeeResult {
  const ordered = [...dues].sort(
    (a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime(),
  );

  let credit = paidCents;
  const items: LateFeeResult["items"] = [];
  let outstandingCents = 0;
  let overdueCents = 0;
  let notYetDueCents = 0;
  let lateFeeCents = 0;

  // Bu ayın sonu: vadesi buraya kadar olan her şey "şimdi ödenecek" sayılır.
  const monthEnd = new Date(
    Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 1, 0, 23, 59, 59),
  );

  for (const due of ordered) {
    const applied = Math.min(credit, due.amountCents);
    credit -= applied;
    const remaining = due.amountCents - applied;
    if (remaining <= 0) continue;

    outstandingCents += remaining;
    const dueDate = new Date(due.dueDate);
    if (dueDate.getTime() > monthEnd.getTime()) notYetDueCents += remaining;
    if (dueDate.getTime() > today.getTime()) continue; // vadesi gelmemiş
    overdueCents += remaining;

    const months = monthsBetween(dueDate, today);
    if (months === 0 || ratePct <= 0) continue;

    const fee = Math.round((remaining * ratePct * months) / 100);
    lateFeeCents += fee;
    items.push({
      dueDate: dueDate.toISOString().slice(0, 10),
      remainingCents: remaining,
      months,
      feeCents: fee,
    });
  }

  return { outstandingCents, overdueCents, notYetDueCents, lateFeeCents, items };
}
