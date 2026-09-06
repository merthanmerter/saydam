import type { Restructuring } from "../lib/types.ts";
import { type Row, sql, toCents } from "./db.ts";
import { badRequest, conflict, notFound } from "./http.ts";
import { restructurePlan } from "./money.ts";

/**
 * Borç yapılandırma.
 *
 * Yönetim, bir dairenin birikmiş borcunu taksite bağlayabilir. Yapılandırma
 * anaparayı değiştirmez — yalnızca isteğe bağlı bir **vade farkı** ekler ve
 * ödemeyi bir takvime bağlar. Kural KMK m.20/c'nin yerine geçmez: yürürlükteki
 * bir yapılandırmada gecikme tazminatı eski aidat vadelerine göre değil, kabul
 * edilen taksit vadelerine göre işler. Aksi hâlde yapılandırmanın bir anlamı
 * kalmaz, borçlu hem taksite bağlanır hem eski vadeden ceza yemeye devam eder.
 */

export type { Installment, Restructuring } from "../lib/types.ts";

const mapRow = (r: Row): Restructuring => ({
  id: r.id as string,
  unitId: r.unitId as string,
  block: (r.block ?? "") as string,
  no: (r.no ?? "") as string,
  principalCents: toCents(r.principalCents),
  interestPct: toCents(r.interestPct),
  interestCents: toCents(r.interestCents),
  totalCents: toCents(r.totalCents),
  installments: toCents(r.installments),
  coversThrough: String(r.coversThrough).slice(0, 10),
  status: r.status as Restructuring["status"],
  note: (r.note ?? null) as string | null,
  createdAt: String(r.createdAt),
  rows: (typeof r.rows === "string" ? JSON.parse(r.rows) : (r.rows ?? [])).map(
    (i: Row) => ({
      no: toCents(i.no),
      dueDate: String(i.dueDate).slice(0, 10),
      amountCents: toCents(i.amountCents),
    }),
  ),
});

/**
 * Bir sitedeki yapılandırmalar. `unitIds` verilirse yalnızca o daireler döner.
 *
 * Süzme SQL'de değil bellekte yapılıyor: bir sitedeki yapılandırma sayısı
 * daire sayısıyla sınırlı olduğu için fark etmiyor, buna karşılık dinamik SQL
 * kurmaya gerek kalmıyor.
 */
export async function listRestructurings(siteId: string, unitIds?: string[]) {
  const rows = (await sql`
    select r.id, r.unit_id as "unitId", u.block, u.no,
           r.principal_cents as "principalCents", r.interest_pct as "interestPct",
           r.interest_cents as "interestCents", r.total_cents as "totalCents",
           r.installments, r.covers_through as "coversThrough", r.status, r.note,
           r.created_at as "createdAt",
           coalesce((select json_agg(json_build_object('no', i.no, 'dueDate', i.due_date,
                                                       'amountCents', i.amount_cents)
                                     order by i.no)
                       from restructuring_installments i
                      where i.restructuring_id = r.id), '[]'::json) as rows
      from restructurings r
      join units u on u.id = r.unit_id
     where r.site_id = ${siteId}
     order by r.created_at desc
  `) as Row[];

  const wanted = unitIds && new Set(unitIds);
  return rows.filter((r) => !wanted || wanted.has(r.unitId as string)).map(mapRow);
}

/** Yürürlükteki yapılandırmaların daire kimliğine göre dizini. */
export async function activeByUnit(siteId: string) {
  const rows = (await sql`
    select r.id, r.unit_id as "unitId", r.interest_cents as "interestCents",
           r.covers_through as "coversThrough", r.created_at as "createdAt",
           /*
            * Yapılandırmanın anaparası, o ANDAKİ borçtur: daha önceki ödemeler
            * zaten düşülmüştür. Taksitlere yalnızca yapılandırmadan SONRA
            * yapılan ödemeler sayılır; tüm ödeme geçmişi sayılsaydı taksitler
            * kendiliğinden ödenmiş görünür ve gecikme tazminatı hiç işlemezdi.
            */
           coalesce((select sum(p.amount_cents) from payments p
                      where p.unit_id = r.unit_id and p.status = 'confirmed'
                        and p.created_at >= r.created_at), 0) as "paidSince",
           coalesce((select json_agg(json_build_object('dueDate', i.due_date,
                                                       'amountCents', i.amount_cents)
                                     order by i.due_date)
                       from restructuring_installments i
                      where i.restructuring_id = r.id), '[]'::json) as rows
      from restructurings r
     where r.site_id = ${siteId} and r.status = 'active'
  `) as Row[];

  const index = new Map<
    string,
    {
      id: string;
      interestCents: number;
      coversThrough: string;
      /** Yalnızca yapılandırmadan sonra yapılan ödemeler. */
      paidSinceCents: number;
      rows: { dueDate: string; amountCents: number }[];
    }
  >();
  for (const r of rows) {
    index.set(r.unitId as string, {
      id: r.id as string,
      interestCents: toCents(r.interestCents),
      coversThrough: String(r.coversThrough).slice(0, 10),
      paidSinceCents: toCents(r.paidSince),
      rows: (typeof r.rows === "string" ? JSON.parse(r.rows) : r.rows).map((i: Row) => ({
        dueDate: String(i.dueDate).slice(0, 10),
        amountCents: toCents(i.amountCents),
      })),
    });
  }
  return index;
}

/** Yapılandırma önizlemesi: kaydetmeden planı gösterir. */
export function preview(
  principalCents: number,
  interestPct: number,
  installments: number,
  firstDueDate: string,
) {
  if (principalCents <= 0) throw badRequest("Bu dairenin yapılandırılacak borcu yok");
  return restructurePlan(principalCents, interestPct, installments, firstDueDate);
}

export async function createRestructuring(input: {
  siteId: string;
  unitId: string;
  principalCents: number;
  interestPct: number;
  installments: number;
  firstDueDate: string;
  note: string | null;
  createdBy: string;
}) {
  const [open] = await sql`
    select id from restructurings
     where unit_id = ${input.unitId} and site_id = ${input.siteId} and status = 'active'
  `;
  if (open) throw conflict("Bu dairenin yürürlükte bir yapılandırması zaten var");

  const plan = preview(
    input.principalCents,
    input.interestPct,
    input.installments,
    input.firstDueDate,
  );

  return await sql.begin(async (tx) => {
    const [row] = await tx`
      insert into restructurings (site_id, unit_id, principal_cents, interest_pct,
                                  interest_cents, total_cents, installments,
                                  covers_through, note, created_by)
      values (${input.siteId}, ${input.unitId}, ${plan.principalCents},
              ${input.interestPct}, ${plan.interestCents}, ${plan.totalCents},
              ${input.installments}, current_date, ${input.note}, ${input.createdBy})
      returning id
    `;
    await tx`insert into restructuring_installments ${tx(
      plan.rows.map((i) => ({
        restructuring_id: row.id,
        site_id: input.siteId,
        unit_id: input.unitId,
        no: i.no,
        due_date: i.dueDate,
        amount_cents: i.amountCents,
      })),
    )}`;
    return { id: row.id as string, ...plan };
  });
}

/**
 * Yapılandırmayı iptal eder. Vade farkı da geri alınır: yapılandırma
 * yürürlükte değilse tahsil edilecek bir vade farkı da yoktur.
 */
export async function cancelRestructuring(siteId: string, id: string) {
  const [row] = await sql`
    update restructurings set status = 'canceled'
     where id = ${id} and site_id = ${siteId} and status = 'active'
    returning id
  `;
  if (!row) throw notFound("Yürürlükte yapılandırma bulunamadı");
}
