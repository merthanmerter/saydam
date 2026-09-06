import { type Period, periodLabel, periodParts, yearRange } from "../lib/period.ts";
import type { BudgetLine } from "../lib/types.ts";
import { type Row, sql } from "./db.ts";
import { env } from "./env.ts";
import { badRequest, conflict, type Page } from "./http.ts";
import { computeLateFee, type DueRow } from "./lateFee.ts";
import {
  distribute,
  type Payer,
  payerFor,
  type ShareMethod,
  type ShareUnit,
  shareBy,
} from "./money.ts";
import { activeByUnit } from "./restructuring.ts";

/**
 * Dairelerin sayısı ve toplam arsa payı. Arsa payları birer oran olduğu için
 * toplamın belli bir değere eşit olması gerekmez: paylaşım her zaman kendi
 * toplamına bölünerek yapılır.
 */
export async function unitsSummary(siteId: string) {
  const [row] = await sql`
    select count(*)::int                  as "unitCount",
           (coalesce(sum(arsa_payi), 0))::float8    as "totalArsaPayi"
      from units where site_id = ${siteId}
  `;
  return {
    unitCount: row?.unitCount,
    totalArsaPayi: row?.totalArsaPayi,
  };
}

/**
 * Bulut aboneliği ücretini dönem gideri olarak yazar.
 *
 * İki koşul birden aranır:
 *   - Abonelik gerçekten ÜCRETLİ olmalı. Deneme sürümünde para ödenmediği için
 *     sakinlere yansıtılacak bir gider de yoktur.
 *   - Yönetim bu ücreti site giderlerine eklemeyi AÇIKÇA seçmiş olmalı
 *     (`bill_to_site`). Varsayılan kapalıdır: kimsenin haberi olmadan daire
 *     aidatına platform ücreti eklenmez.
 */
export async function syncSubscriptionExpense(siteId: string, period: Period) {
  if (!env.saasMode) return;
  const [sub] = await sql`
    select plan, status, bill_to_site as "billToSite", price_cents::float8 as "priceCents"
      from subscriptions where site_id = ${siteId}
  `;
  if (!sub?.billToSite || sub.status !== "active") return;

  const monthly = sub.plan === "yearly" ? Math.round(sub.priceCents / 12) : sub.priceCents;
  if (monthly <= 0) return;

  await sql.begin(async (tx) => {
    const [existing] = await tx`
      select id from expenses
       where site_id = ${siteId} and kind = 'system' and period = ${period}
    `;
    if (existing) return;

    const [expense] = await tx`
      insert into expenses (site_id, kind, title, category, amount_cents,
                            incurred_on, period, note)
      values (${siteId}, 'system', ${`say-dam bulut aboneliği — ${periodLabel(period)}`},
              'platform', ${monthly}, current_date, ${period},
              'Abonelik ücreti otomatik eklendi')
      returning id
    `;
    await tx`
      insert into expense_allocations (expense_id, site_id, period, amount_cents)
      values (${expense.id}, ${siteId}, ${period}, ${monthly})
    `;
  });
}

export type { BudgetLine } from "../lib/types.ts";

/** Bir dönemde aidata yansıyacak kalemler. */
export async function periodBudget(siteId: string, period: Period) {
  const recurring = (await sql`
    select id, title, category, amount_cents::float8 as "amountCents",
           share_method as "shareMethod", payer
      from recurring_expenses
     where site_id = ${siteId}
       and start_period <= ${period}
       and (end_period is null or end_period >= ${period})
     order by title
  `) as Row[];

  const allocations = (await sql`
    select a.id, a.amount_cents::float8 as "amountCents", e.title, e.category, e.kind,
           e.share_method as "shareMethod", e.payer,
           e.installments, e.period as "startPeriod"
      from expense_allocations a
      join expenses e on e.id = a.expense_id
     where a.site_id = ${siteId} and a.period = ${period}
     order by e.created_at
  `) as Row[];

  const lines: BudgetLine[] = [
    ...recurring.map((r) => ({
      source: "recurring" as const,
      id: r.id,
      title: r.title,
      category: r.category,
      amountCents: r.amountCents,
      shareMethod: r.shareMethod as ShareMethod,
      payer: r.payer as Payer,
    })),
    ...allocations.map((a) => ({
      source: a.kind === "system" ? ("system" as const) : ("one_off" as const),
      id: a.id,
      title: a.title,
      category: a.category,
      amountCents: a.amountCents,
      shareMethod: a.shareMethod as ShareMethod,
      payer: a.payer as Payer,
      detail:
        a.installments > 1
          ? `${a.installments} taksitten biri (${periodLabel(a.startPeriod)} başlangıçlı)`
          : undefined,
    })),
  ];

  const sum = (source: BudgetLine["source"]) =>
    lines.filter((l) => l.source === source).reduce((a, l) => a + l.amountCents, 0);

  return {
    period,
    lines,
    recurringCents: sum("recurring"),
    oneOffCents: sum("one_off"),
    systemCents: sum("system"),
    totalCents: lines.reduce((a, l) => a + l.amountCents, 0),
  };
}

/** Dönem aidatını tahakkuk ettirir. Aynı dönem tekrar çalıştırılabilir. */
export async function runDues(siteId: string, period: Period, createdBy: string) {
  const summary = await unitsSummary(siteId);
  if (summary.unitCount === 0) throw badRequest("Önce daireleri tanımlayın");

  await syncSubscriptionExpense(siteId, period);
  const budget = await periodBudget(siteId, period);
  if (budget.totalCents <= 0) throw badRequest("Bu dönemde dağıtılacak gider yok");

  const units = (await sql`
    select id, arsa_payi::float8 as "arsaPayi",
           owner_membership_id  as "ownerId",
           tenant_membership_id as "tenantId",
           coalesce(owner_membership_id, tenant_membership_id) as "membershipId"
      from units where site_id = ${siteId} order by block, no
  `) as Row[];

  const shares: ShareUnit[] = units.map((u) => ({ arsaPayi: u.arsaPayi }));

  /**
   * Her kalem KENDİ yöntemiyle bölünür, sonra daire başına toplanır. Tümünü
   * tek bir oranla bölmek KMK m.20'ye aykırı olurdu: kapıcı gideri eşit,
   * bakım-onarım arsa payı üzerinden dağıtılmak zorunda.
   */
  const perUnit = units.map(() => 0);
  const ownerPart = units.map(() => 0);
  const tenantPart = units.map(() => 0);
  const breakdowns: {
    title: string;
    method: ShareMethod;
    payer: Payer;
    amountCents: number;
  }[][] = units.map(() => []);

  for (const line of budget.lines) {
    const parts = shareBy(line.amountCents, shares, line.shareMethod);
    parts.forEach((amount, index) => {
      perUnit[index] = (perUnit[index] ?? 0) + amount;
      /**
       * Yükümlülük ayrımı yalnızca malik ile kiracı arasındadır. Daire kirada
       * değilse kiracıya yazılacak kalem de malike düşer; aksi hâlde borcun
       * bir kısmı sahipsiz kalırdı.
       */
      const owed = payerFor(line.payer, units[index]?.tenantId != null);
      const toTenant = owed === "kiraci";
      if (toTenant) tenantPart[index] = (tenantPart[index] ?? 0) + amount;
      else ownerPart[index] = (ownerPart[index] ?? 0) + amount;

      if (amount > 0) {
        breakdowns[index]!.push({
          title: line.title,
          method: line.shareMethod,
          payer: owed,
          amountCents: amount,
        });
      }
    });
  }

  const [site] = await sql`select due_day as "dueDay" from sites where id = ${siteId}`;
  const { year, month } = periodParts(period);
  const dueDate = new Date(Date.UTC(year, month - 1, site?.dueDay || 10))
    .toISOString()
    .slice(0, 10);

  return await sql.begin(async (tx) => {
    await tx`delete from dues_runs where site_id = ${siteId} and period = ${period}`;
    const [run] = await tx`
      insert into dues_runs (site_id, period, total_arsa_payi, recurring_cents,
                             one_off_cents, system_cents, total_cents, created_by)
      values (${siteId}, ${period}, ${summary.totalArsaPayi}, ${budget.recurringCents},
              ${budget.oneOffCents}, ${budget.systemCents}, ${budget.totalCents},
              ${createdBy})
      returning id
    `;
    const rows = units.map((unit, index) => ({
      site_id: siteId,
      run_id: run.id,
      unit_id: unit.id,
      membership_id: unit.membershipId,
      period,
      arsa_payi: unit.arsaPayi,
      amount_cents: perUnit[index]!,
      owner_cents: ownerPart[index]!,
      tenant_cents: tenantPart[index]!,
      due_date: dueDate,
      breakdown: JSON.stringify(breakdowns[index]),
    }));
    await tx`insert into dues ${tx(rows)}`;
    return { runId: run.id, period, totalCents: budget.totalCents, units: rows.length };
  });
}

/** Kasa: tahsil edilen − harcanan. Site sakinlerine gösterilen canlı bakiye. */
export async function treasury(siteId: string) {
  const [row] = await sql`
    select
      (select coalesce(sum(amount_cents),0) from payments
        where site_id = ${siteId} and status = 'confirmed')::float8 as "collected",
      (select coalesce(sum(amount_cents),0) from payments
        where site_id = ${siteId} and status = 'pending')::float8 as "pending",
      (select coalesce(sum(amount_cents),0) from expenses
        where site_id = ${siteId})::float8 as "spent",
      (select coalesce(sum(amount_cents),0) from dues
        where site_id = ${siteId})::float8 as "accruedDues",
      -- Yürürlükteki yapılandırmaların toplamı. Toplu bir rakam olduğu için
      -- kasa gibi herkese açıktır; daire bazlı döküm KVKK gereği değildir.
      (select coalesce(sum(total_cents),0) from restructurings
        where site_id = ${siteId} and status = 'active')::float8 as "restructured",
      (select coalesce(sum(case when kind='charge' then amount_cents
                                else -amount_cents end),0)
         from adjustments where site_id = ${siteId})::float8 as "accruedAdjustments"
  `;
  const collected = row?.collected;
  const spent = row?.spent;
  const accrued = row?.accruedDues + row?.accruedAdjustments;
  return {
    collectedCents: collected,
    pendingCents: row?.pending,
    spentCents: spent,
    balanceCents: collected - spent,
    accruedCents: accrued,
    receivableCents: accrued - collected,
    /** Alacağın yapılandırma kapsamındaki kısmı. */
    restructuredCents: row?.restructured,
  };
}

/** Daire bazlı borç/alacak durumu. */
export async function unitBalances(
  siteId: string,
  /**
   * Sayfa verilmezse tüm daireler döner (seçim listeleri ve tek daire için).
   * `memberOf` verildiğinde yalnızca o üyenin malik ya da kiracı olduğu
   * daireler döner — süzme SQL'de yapılır ki toplam sayı da doğru olsun.
   */
  opts: { page?: Page; unitId?: string; memberOf?: string } = {},
) {
  const [site] = await sql`
    select late_fee_pct::float8 as "lateFeePct" from sites where id = ${siteId}
  `;
  const ratePct = site?.lateFeePct;

  const restructured = await activeByUnit(siteId);

  const rows = (await sql`
      select u.id, u.block, u.no, u.arsa_payi::float8 as "arsaPayi",
           u.owner_membership_id  as "ownerId",
           u.tenant_membership_id as "tenantId",
           ow.full_name as "ownerName",  ow.email as "ownerEmail",
           te.full_name as "tenantName", te.email as "tenantEmail",
           (coalesce(a.charge, 0))::float8 as "chargeCents",
           (coalesce(a.refund, 0))::float8 as "refundCents",
           (coalesce(p.paid, 0))::float8   as "paidCents",
           (coalesce(p.pending, 0))::float8 as "pendingCents",
           coalesce(d.rows, '[]'::json) as dues,
           (coalesce(d.owner_cents, 0))::float8  as "ownerAccruedCents",
           (coalesce(d.tenant_cents, 0))::float8 as "tenantAccruedCents"
      from units u
      left join memberships om on om.id = u.owner_membership_id
      left join users ow on ow.id = om.user_id
      left join memberships tm on tm.id = u.tenant_membership_id
      left join users te on te.id = tm.user_id
      left join (select unit_id,
                        json_agg(json_build_object('amountCents', amount_cents,
                                                   'dueDate', due_date)
                                 order by due_date) rows,
                        sum(owner_cents)  owner_cents,
                        sum(tenant_cents) tenant_cents
                   from dues where site_id = ${siteId} group by unit_id) d
             on d.unit_id = u.id
      left join (select unit_id,
                        sum(amount_cents) filter (where kind='charge') charge,
                        sum(amount_cents) filter (where kind='refund') refund
                   from adjustments where site_id = ${siteId}
                  group by unit_id) a on a.unit_id = u.id
      left join (select unit_id,
                        sum(amount_cents) filter (where status='confirmed') paid,
                        sum(amount_cents) filter (where status='pending') pending
                   from payments where site_id = ${siteId}
                  group by unit_id) p on p.unit_id = u.id
     where u.site_id = ${siteId}
       and (${opts.unitId ?? null}::uuid is null or u.id = ${opts.unitId ?? null}::uuid)
       and (${opts.memberOf ?? null}::uuid is null
            or ${opts.memberOf ?? null}::uuid
               in (u.owner_membership_id, u.tenant_membership_id))
     order by u.block, length(u.no), u.no
     limit  ${opts.page?.limit ?? null}
     offset ${opts.page?.offset ?? 0}
  `) as Row[];

  const items = rows.map((r) => {
    const charges = r.chargeCents;
    const refunds = r.refundCents;
    const paid = r.paidCents;

    // json_agg sayıyı JSON sayısı olarak döndürür; ek dönüşüm gerekmez.
    const dueRows = r.dues as DueRow[];
    const duesTotal = dueRows.reduce((sum, d) => sum + d.amountCents, 0);

    /**
     * Yürürlükte bir yapılandırma varsa gecikme tazminatı eski aidat
     * vadelerine göre değil, kabul edilen taksit vadelerine göre işler; aksi
     * hâlde borçlu hem taksite bağlanır hem eski vadeden ceza yemeye devam
     * eder ve yapılandırmanın anlamı kalmaz. Yapılandırma tarihinden SONRA
     * tahakkuk eden aidatlar kapsam dışıdır, kendi vadelerine göre işler.
     */
    const plan = restructured.get(r.id as string);
    const feeRows = plan
      ? [...plan.rows, ...dueRows.filter((d) => d.dueDate > plan.coversThrough)]
      : dueRows;
    /*
     * Taksitlere yalnızca yapılandırmadan sonraki ödemeler mahsup edilir:
     * anapara zaten o ana kadarki ödemeler düşülerek belirlendi. Tüm ödeme
     * geçmişi sayılsaydı taksitler kendiliğinden kapanmış görünürdü.
     */
    const credit = plan ? plan.paidSinceCents : paid;
    // Gecikme tazminatı yalnızca anaparaya işler; yıl sonu mahsuplaşma
    // kalemleri vadeye bağlı olmadığı için hesabın dışında tutulur.
    const late = computeLateFee(feeRows, credit, ratePct);

    const accrued = duesTotal + charges - refunds + (plan?.interestCents ?? 0);
    const balance = accrued - paid + late.lateFeeCents; // + borç, − alacak
    return {
      id: r.id as string,
      block: r.block as string,
      no: r.no as string,
      arsaPayi: r.arsaPayi,
      ownerId: r.ownerId as string | null,
      ownerName: r.ownerName as string | null,
      ownerEmail: r.ownerEmail as string | null,
      tenantId: r.tenantId as string | null,
      tenantName: r.tenantName as string | null,
      tenantEmail: r.tenantEmail as string | null,
      accruedCents: accrued,
      /**
       * Bu ay istenecek tutar: toplam borçtan, vadesi gelecek aylara düşen
       * kısım çıkarılmış hâli. Yapılandırılmış bir dairede bu, sıradaki
       * taksit(ler); yapılandırılmamışta pratikte borcun tamamıdır.
       */
      dueNowCents: Math.max(0, balance - late.notYetDueCents),
      /** Yürürlükteki yapılandırmanın vade farkı; yoksa 0. */
      restructuringInterestCents: plan?.interestCents ?? 0,
      hasRestructuring: plan !== undefined,
      /**
       * Tahakkukun malik/kiracı dağılımı. Yıl sonu mahsuplaşma ve yapılandırma
       * kalemleri kullanıma bağlı olmadığı için tamamı malike yazılır.
       */
      ownerAccruedCents:
        r.ownerAccruedCents + charges - refunds + (plan?.interestCents ?? 0),
      tenantAccruedCents: r.tenantAccruedCents,
      paidCents: paid,
      pendingCents: r.pendingCents,
      lateFeeCents: late.lateFeeCents,
      outstandingCents: late.outstandingCents,
      overdueCents: late.overdueCents,
      balanceCents: balance,
    };
  });

  // Sayfa verilmişse bir fazlası çekilmiştir; "devamı var mı" ondan anlaşılır.
  const size = opts.page?.size;
  return size
    ? { items: items.slice(0, size), hasMore: items.length > size }
    : { items, hasMore: false };
}

/**
 * Yıl sonu mahsuplaşma. Tahakkuk esaslı: yıl içinde dağıtılan aidat toplamı ile
 * fiilen yapılan harcama karşılaştırılır; fark arsa payı oranında dairelere yazılır.
 */
export async function yearEndSettlement(siteId: string, year: number) {
  const [from, to] = yearRange(year);
  const [totals] = await sql`
    select
      (select coalesce(sum(amount_cents),0) from dues
        where site_id = ${siteId} and period between ${from} and ${to})::float8 as "billed",
      (select coalesce(sum(amount_cents),0) from expenses
        where site_id = ${siteId}
          and extract(year from incurred_on) = ${year})::float8 as "spent"
  `;
  const billed = totals?.billed;
  const spent = totals?.spent;
  const differenceCents = billed - spent; // + fazla, − eksik

  const units = (await sql`
    select u.id, u.block, u.no, u.arsa_payi::float8 as "arsaPayi"
      from units u where u.site_id = ${siteId} order by u.block, u.no
  `) as Row[];
  // Mahsuplaşma da aidatın dayandığı ölçüye, arsa payına göre bölünür.
  const shares = distribute(
    Math.abs(differenceCents),
    units.map((u) => Math.round(u.arsaPayi * 10_000)),
  );

  const [applied] = await sql`
    select count(*)::int as n from adjustments
     where site_id = ${siteId} and year = ${year}
  `;

  return {
    year,
    billedCents: billed,
    spentCents: spent,
    differenceCents,
    kind: differenceCents >= 0 ? ("refund" as const) : ("charge" as const),
    alreadyApplied: applied?.n > 0,
    units: units.map((u, i) => ({
      unitId: u.id as string,
      label: `${u.block ? `${u.block} ` : ""}${u.no}`,
      arsaPayi: u.arsaPayi,
      amountCents: shares[i]!,
    })),
  };
}

export async function applyYearEnd(siteId: string, year: number, createdBy: string) {
  const settlement = await yearEndSettlement(siteId, year);
  if (settlement.alreadyApplied) throw conflict("Bu yıl için mahsuplaşma zaten uygulandı");
  if (settlement.differenceCents === 0) throw badRequest("Mahsuplaşacak fark yok");

  const rows = settlement.units
    .filter((u) => u.amountCents > 0)
    .map((u) => ({
      site_id: siteId,
      unit_id: u.unitId,
      year,
      kind: settlement.kind,
      amount_cents: u.amountCents,
      note: `${year} yıl sonu mahsuplaşması`,
      created_by: createdBy,
    }));
  if (rows.length) await sql`insert into adjustments ${sql(rows)}`;
  return { ...settlement, alreadyApplied: true };
}
