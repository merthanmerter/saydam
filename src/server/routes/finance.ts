import { z } from "zod";
import {
  applyYearEnd,
  periodBudget,
  runDues,
  syncSubscriptionExpense,
  treasury,
  unitBalances,
  yearEndSettlement,
} from "../accounting.ts";
import type { Auth } from "../auth.ts";
import { type Row, sql, toCents, toNumber } from "../db.ts";
import {
  badRequest,
  body,
  conflict,
  json,
  notFound,
  paged,
  paging,
  type Router,
} from "../http.ts";
import { belongsToSite } from "../lib/blob.ts";
import { installmentPlan } from "../money.ts";
import { currentPeriod, isValidPeriod, periodLabel } from "../period.ts";
import {
  cancelRestructuring,
  createRestructuring,
  listRestructurings,
  preview as restructurePreview,
} from "../restructuring.ts";

const periodField = z.number().int().refine(isValidPeriod, "Dönem YYYYAA biçiminde olmalı");
const cents = z.number().int().positive().max(1_000_000_000_00);

const shareMethod = z.enum(["esit", "arsa_payi"]);
/** Daire içinde kimin yükümlü olduğu; varsayılan malik (KMK m.20). */
const payer = z.enum(["malik", "kiraci"]).default("malik");

const recurringSchema = z.object({
  title: z.string().trim().min(2).max(120),
  category: z.string().trim().max(40).default("genel"),
  amountCents: z.number().int().nonnegative(),
  /** KMK m.20: kalem bazında paylaşım yöntemi. */
  shareMethod,
  payer,
  startPeriod: periodField,
  endPeriod: periodField.nullable().default(null),
  note: z.string().trim().max(500).nullable().default(null),
});

const expenseSchema = z.object({
  title: z.string().trim().min(2).max(120),
  category: z.string().trim().max(40).default("genel"),
  vendor: z.string().trim().max(120).nullable().default(null),
  amountCents: cents,
  incurredOn: z.iso.date(),
  period: periodField,
  /** Bütçe kalemine mahsup ediliyorsa aidata tekrar yansımaz. */
  recurringExpenseId: z.uuid().nullable().default(null),
  installments: z.number().int().min(1).max(120).default(1),
  surchargePct: z.number().min(0).max(100).default(0),
  shareMethod,
  payer,
  invoiceUrl: z.url(),
  invoiceName: z.string().trim().min(1).max(200),
  note: z.string().trim().max(500).nullable().default(null),
});

/** Yapılandırma girdisi. Anapara sunucuda hesaplanır, istemciden alınmaz. */
const restructureSchema = z.object({
  unitId: z.uuid(),
  installments: z.number().int().min(1).max(60),
  /** Vade farkı; 0 → yalnızca taksitlendirme. */
  interestPct: z.number().min(0).max(100).default(0),
  firstDueDate: z.iso.date(),
  note: z.string().trim().max(300).nullable().default(null),
});

/**
 * Dairenin o anki borcu. Yapılandırılacak tutar buradan gelir — istemcinin
 * gönderdiği bir rakama güvenilmez, aksi hâlde borç istenildiği gibi
 * küçültülebilirdi.
 */
async function outstandingOf(siteId: string, unitId: string) {
  const { items } = await unitBalances(siteId, { unitId });
  const unit = items[0];
  if (!unit) throw notFound("Daire bulunamadı");
  if (unit.balanceCents <= 0) throw badRequest("Bu dairenin yapılandırılacak borcu yok");
  return unit.balanceCents;
}

/** `dues.breakdown` jsonb sütunu sürücüden dize olarak gelebilir. */
const parseBreakdown = (value: unknown) => {
  if (Array.isArray(value)) return value;
  if (typeof value !== "string") return [];
  try {
    return JSON.parse(value);
  } catch {
    return [];
  }
};

const paramPeriod = (value: string | undefined) => {
  const parsed = Number(value);
  if (!isValidPeriod(parsed)) throw badRequest("Geçersiz dönem");
  return parsed;
};

export function financeRoutes(
  auth: Router<Auth>,
  active: Router<Auth>,
  admin: Router<Auth>,
) {
  // ─── Düzenli giderler (bütçe kalemleri) ──────────────────────────────────
  auth.get("/recurring", async (ctx) => {
    const rows = await sql`
      select id, title, category, amount_cents as "amountCents",
             share_method as "shareMethod", payer,
             start_period as "startPeriod", end_period as "endPeriod", note
        from recurring_expenses where site_id = ${ctx.auth.siteId}
       order by title
    `;
    return json({
      recurring: rows.map((r: any) => ({ ...r, amountCents: toCents(r.amountCents) })),
    });
  });

  admin.post("/recurring", async (ctx) => {
    const input = await body(ctx.req, recurringSchema);
    if (input.endPeriod && input.endPeriod < input.startPeriod) {
      throw badRequest("Bitiş dönemi başlangıçtan önce olamaz");
    }
    const [row] = await sql`
      insert into recurring_expenses (site_id, title, category, amount_cents, share_method,
                                      payer, start_period, end_period, note, created_by)
      values (${ctx.auth.siteId}, ${input.title}, ${input.category}, ${input.amountCents},
              ${input.shareMethod}, ${input.payer}, ${input.startPeriod},
              ${input.endPeriod}, ${input.note}, ${ctx.auth.membershipId})
      returning id
    `;
    return json({ id: row.id }, { status: 201 });
  });

  admin.patch("/recurring/:id", async (ctx) => {
    const input = await body(ctx.req, recurringSchema);
    const [row] = await sql`
      update recurring_expenses
         set title = ${input.title}, category = ${input.category},
             amount_cents = ${input.amountCents}, share_method = ${input.shareMethod},
             payer = ${input.payer}, start_period = ${input.startPeriod},
             end_period = ${input.endPeriod}, note = ${input.note}
       where id = ${ctx.params.id!} and site_id = ${ctx.auth.siteId}
      returning id
    `;
    if (!row) throw notFound("Bütçe kalemi bulunamadı");
    return json({ ok: true });
  });

  admin.delete("/recurring/:id", async (ctx) => {
    const [row] = await sql`
      delete from recurring_expenses
       where id = ${ctx.params.id!} and site_id = ${ctx.auth.siteId}
      returning id
    `;
    if (!row) throw notFound("Bütçe kalemi bulunamadı");
    return json({ ok: true });
  });

  // ─── Fiili giderler ──────────────────────────────────────────────────────
  auth.get("/expenses", async (ctx) => {
    const year = Number(ctx.url.searchParams.get("year")) || new Date().getFullYear();
    const pg = paging(ctx.url);
    const rows = await sql`
      select e.id, e.kind, e.title, e.category, e.vendor,
             e.amount_cents as "amountCents", e.incurred_on as "incurredOn",
             e.period, e.installments, e.surcharge_pct as "surchargePct",
             e.share_method as "shareMethod", e.payer,
             e.invoice_url as "invoiceUrl", e.invoice_name as "invoiceName", e.note,
             r.title as "budgetTitle",
             coalesce((select json_agg(json_build_object('period', a.period,
                                                         'amountCents', a.amount_cents)
                                       order by a.period)
                         from expense_allocations a where a.expense_id = e.id),
                      '[]'::json) as allocations
        from expenses e
        left join recurring_expenses r on r.id = e.recurring_expense_id
       where e.site_id = ${ctx.auth.siteId}
         and extract(year from e.incurred_on) = ${year}
       order by e.incurred_on desc, e.created_at desc
       limit ${pg.limit} offset ${pg.offset}
    `;
    return json({
      year,
      ...paged(rows, pg, (e: Row) => ({
        ...e,
        amountCents: toCents(e.amountCents),
        surchargePct: toNumber(e.surchargePct),
        allocations: (e.allocations as Row[]).map((a) => ({
          period: a.period,
          amountCents: toCents(a.amountCents),
        })),
      })),
    });
  });

  admin.post("/expenses", async (ctx) => {
    const input = await body(ctx.req, expenseSchema);
    if (!belongsToSite(input.invoiceUrl, ctx.auth.siteId)) {
      throw badRequest("Fatura dosyası bu siteye ait değil");
    }
    const budgeted = Boolean(input.recurringExpenseId);
    if (budgeted && (input.installments > 1 || input.surchargePct > 0)) {
      throw badRequest("Bütçe kalemine mahsup edilen gider taksitlendirilemez");
    }

    const id = await sql.begin(async (tx) => {
      if (budgeted) {
        const [budget] = await tx`
          select 1 from recurring_expenses
           where id = ${input.recurringExpenseId} and site_id = ${ctx.auth.siteId}
        `;
        if (!budget) throw notFound("Bütçe kalemi bulunamadı");
      }
      const [expense] = await tx`
        insert into expenses (site_id, kind, recurring_expense_id, title, category, vendor,
                              amount_cents, incurred_on, period, installments,
                              surcharge_pct, share_method, payer, invoice_url,
                              invoice_name, note, created_by)
        values (${ctx.auth.siteId}, ${budgeted ? "budgeted" : "one_off"},
                ${input.recurringExpenseId}, ${input.title}, ${input.category}, ${input.vendor},
                ${input.amountCents}, ${input.incurredOn}, ${input.period},
                ${input.installments}, ${input.surchargePct}, ${input.shareMethod},
                ${input.payer}, ${input.invoiceUrl}, ${input.invoiceName}, ${input.note},
                ${ctx.auth.membershipId})
        returning id
      `;
      if (!budgeted) {
        const plan = installmentPlan(
          input.amountCents,
          input.period,
          input.installments,
          input.surchargePct,
        );
        await tx`insert into expense_allocations ${tx(
          plan.map((p) => ({
            expense_id: expense.id,
            site_id: ctx.auth.siteId,
            period: p.period,
            amount_cents: p.amountCents,
          })),
        )}`;
      }
      return expense.id as string;
    });
    return json({ id }, { status: 201 });
  });

  admin.delete("/expenses/:id", async (ctx) => {
    // Önce kaydın bu siteye ait olduğu doğrulanır; aksi hâlde site dışı bir
    // kimlikle yapılan istek hiçbir şey silmeden "başarılı" dönerdi.
    const [expense] = await sql`
      select 1 from expenses
       where id = ${ctx.params.id!} and site_id = ${ctx.auth.siteId}
    `;
    if (!expense) throw notFound("Gider bulunamadı");

    const [locked] = await sql`
      select r.period from dues_runs r
       where r.site_id = ${ctx.auth.siteId}
         and r.period in (select period from expense_allocations
                           where expense_id = ${ctx.params.id!})
       limit 1
    `;
    if (locked) {
      throw conflict(
        `Bu gider ${periodLabel(locked.period)} tahakkukuna yansımış. Önce o dönemi yeniden hesaplayın.`,
      );
    }
    await sql`delete from expenses where id = ${ctx.params.id!} and site_id = ${ctx.auth.siteId}`;
    return json({ ok: true });
  });

  // ─── Aidat tahakkuku ─────────────────────────────────────────────────────
  auth.get("/budget/:period", async (ctx) => {
    const period = paramPeriod(ctx.params.period);
    if (ctx.auth.role === "admin") await syncSubscriptionExpense(ctx.auth.siteId, period);
    const budget = await periodBudget(ctx.auth.siteId, period);
    const [run] = await sql`
      select id, total_cents as "totalCents", created_at as "createdAt"
        from dues_runs where site_id = ${ctx.auth.siteId} and period = ${period}
    `;
    return json({
      ...budget,
      run: run ? { ...run, totalCents: toCents(run.totalCents) } : null,
    });
  });

  admin.post("/dues/run", async (ctx) => {
    const input = await body(ctx.req, z.object({ period: periodField }));
    return json(await runDues(ctx.auth.siteId, input.period, ctx.auth.membershipId));
  });

  auth.get("/dues", async (ctx) => {
    const period = Number(ctx.url.searchParams.get("period")) || currentPeriod();
    const mineOnly = ctx.auth.view !== "admin";
    const pg = paging(ctx.url);
    const rows = await sql`
      select d.id, d.period, d.amount_cents as "amountCents", d.arsa_payi as "arsaPayi",
             d.owner_cents as "ownerCents", d.tenant_cents as "tenantCents",
             d.due_date as "dueDate", d.breakdown,
             u.block, u.no,
             coalesce(u.owner_membership_id, u.tenant_membership_id) as "membershipId",
             coalesce(te.full_name, ow.full_name) as "residentName"
        from dues d
        join units u on u.id = d.unit_id
        left join memberships om on om.id = u.owner_membership_id
        left join users ow on ow.id = om.user_id
        left join memberships tm on tm.id = u.tenant_membership_id
        left join users te on te.id = tm.user_id
       where d.site_id = ${ctx.auth.siteId} and d.period = ${period}
         and (${!mineOnly}::boolean
              or u.owner_membership_id = ${ctx.auth.membershipId}
              or u.tenant_membership_id = ${ctx.auth.membershipId})
       order by u.block, length(u.no), u.no
       limit ${pg.limit} offset ${pg.offset}
    `;
    return json({
      period,
      ...paged(rows, pg, (d: Row) => ({
        ...d,
        amountCents: toCents(d.amountCents),
        ownerCents: toCents(d.ownerCents),
        tenantCents: toCents(d.tenantCents),
        arsaPayi: toNumber(d.arsaPayi),
        // jsonb sürücüden dize gelir; istemciye çözülmüş hâlde gitsin.
        breakdown: parseBreakdown(d.breakdown),
        residentName: ctx.auth.view === "admin" ? d.residentName : undefined,
      })),
    });
  });

  /** Sakinin kendi dairelerinin tüm aidat geçmişi. */
  auth.get("/dues/mine", async (ctx) => {
    const rows = await sql`
      select d.period, d.amount_cents as "amountCents", u.block, u.no, u.id as "unitId"
        from dues d
        join units u on u.id = d.unit_id
       where d.site_id = ${ctx.auth.siteId}
         and (u.owner_membership_id = ${ctx.auth.membershipId}
              or u.tenant_membership_id = ${ctx.auth.membershipId}
              or d.membership_id = ${ctx.auth.membershipId})
       order by d.period desc
    `;
    return json({
      dues: rows.map((d: any) => ({ ...d, amountCents: toCents(d.amountCents) })),
    });
  });

  // ─── Tahsilat ────────────────────────────────────────────────────────────
  auth.get("/payments", async (ctx) => {
    const mineOnly = ctx.auth.view !== "admin";
    const pg = paging(ctx.url);
    const rows = await sql`
      select p.id, p.amount_cents as "amountCents", p.method, p.status, p.reference,
             p.receipt_url as "receiptUrl", p.note, p.paid_at as "paidAt",
             p.created_at as "createdAt", p.unit_id as "unitId",
             u.block, u.no, us.full_name as "payerName"
        from payments p
        join units u on u.id = p.unit_id
        left join memberships m on m.id = p.membership_id
        left join users us on us.id = m.user_id
       where p.site_id = ${ctx.auth.siteId}
         and (${!mineOnly}::boolean
              or u.owner_membership_id = ${ctx.auth.membershipId}
              or u.tenant_membership_id = ${ctx.auth.membershipId}
              or p.membership_id = ${ctx.auth.membershipId})
       order by p.created_at desc
       limit ${pg.limit} offset ${pg.offset}
    `;
    return json(
      paged(rows, pg, (p: Row) => ({ ...p, amountCents: toCents(p.amountCents) })),
    );
  });

  /**
   * Sakin havale bildirimi yapar; yönetim onaylayana kadar kasaya girmez.
   * Yeni kayıt oluşturduğu için siteden çıkarılmış üyeye kapalıdır.
   */
  active.post("/payments/declare", async (ctx) => {
    const input = await body(
      ctx.req,
      z.object({
        unitId: z.uuid(),
        amountCents: cents,
        paidAt: z.iso.date(),
        reference: z.string().trim().max(120).nullable().default(null),
        receiptUrl: z.url().nullable().default(null),
      }),
    );
    await assertUnitAccess(ctx.auth, input.unitId);
    if (input.receiptUrl && !belongsToSite(input.receiptUrl, ctx.auth.siteId)) {
      throw badRequest("Dekont bu siteye ait değil");
    }
    const [row] = await sql`
      insert into payments (site_id, unit_id, membership_id, amount_cents, method,
                            status, reference, receipt_url, paid_at)
      values (${ctx.auth.siteId}, ${input.unitId}, ${ctx.auth.membershipId},
              ${input.amountCents}, 'transfer', 'pending', ${input.reference},
              ${input.receiptUrl}, ${input.paidAt})
      returning id
    `;
    return json({ id: row.id }, { status: 201 });
  });

  /** Yönetim elden/havaleyle alınan ödemeyi doğrudan işler. */
  admin.post("/payments", async (ctx) => {
    const input = await body(
      ctx.req,
      z.object({
        unitId: z.uuid(),
        amountCents: cents,
        method: z.enum(["transfer", "cash"]),
        paidAt: z.iso.date(),
        reference: z.string().trim().max(120).nullable().default(null),
        note: z.string().trim().max(300).nullable().default(null),
      }),
    );
    const [unit] = await sql`
      select coalesce(tenant_membership_id, owner_membership_id) as "membershipId"
        from units where id = ${input.unitId} and site_id = ${ctx.auth.siteId}
    `;
    if (!unit) throw notFound("Daire bulunamadı");
    const [row] = await sql`
      insert into payments (site_id, unit_id, membership_id, amount_cents, method,
                            status, reference, note, paid_at, decided_by, decided_at)
      values (${ctx.auth.siteId}, ${input.unitId}, ${unit.membershipId}, ${input.amountCents},
              ${input.method}, 'confirmed', ${input.reference}, ${input.note},
              ${input.paidAt}, ${ctx.auth.membershipId}, now())
      returning id
    `;
    return json({ id: row.id }, { status: 201 });
  });

  admin.post("/payments/:id/decide", async (ctx) => {
    const input = await body(
      ctx.req,
      z.object({
        status: z.enum(["confirmed", "rejected"]),
        note: z.string().trim().max(300).nullable().default(null),
      }),
    );
    const [row] = await sql`
      update payments
         set status = ${input.status}, note = ${input.note},
             decided_by = ${ctx.auth.membershipId}, decided_at = now()
       where id = ${ctx.params.id!} and site_id = ${ctx.auth.siteId} and status = 'pending'
      returning id
    `;
    if (!row) throw notFound("Bekleyen ödeme bulunamadı");
    return json({ ok: true });
  });

  /*
   * ─── Borç yapılandırma ─────────────────────────────────────────────────
   *
   * Yönetim, bir dairenin birikmiş borcunu taksite bağlar. Anapara
   * değişmez; isteğe bağlı vade farkı eklenir. Yürürlükteyken gecikme
   * tazminatı taksit vadelerine göre işler (bkz. `unitBalances`).
   */
  auth.get("/restructurings", async (ctx) => {
    if (ctx.auth.view === "admin") {
      return json({ restructurings: await listRestructurings(ctx.auth.siteId) });
    }
    // Sakine yalnızca kendi dairelerininki döner.
    const own = (
      await sql`
      select id from units
       where site_id = ${ctx.auth.siteId}
         and ${ctx.auth.membershipId} in (owner_membership_id, tenant_membership_id)
    `
    ).map((u: Row) => u.id as string);
    return json({
      restructurings: own.length ? await listRestructurings(ctx.auth.siteId, own) : [],
    });
  });

  /**
   * Kaydetmeden planı gösterir: yönetim taksit sayısını ve vade farkını
   * deneyebilsin. Saf bir hesap olduğu için GET.
   */
  admin.get("/restructurings/preview", async (ctx) => {
    const q = ctx.url.searchParams;
    const input = restructureSchema.parse({
      unitId: q.get("unitId"),
      installments: Number(q.get("installments")),
      interestPct: Number(q.get("interestPct") ?? 0),
      firstDueDate: q.get("firstDueDate"),
    });
    const principal = await outstandingOf(ctx.auth.siteId, input.unitId);
    return json(
      restructurePreview(
        principal,
        input.interestPct,
        input.installments,
        input.firstDueDate,
      ),
    );
  });

  admin.post("/restructurings", async (ctx) => {
    const input = await body(ctx.req, restructureSchema);
    const principal = await outstandingOf(ctx.auth.siteId, input.unitId);
    const created = await createRestructuring({
      siteId: ctx.auth.siteId,
      unitId: input.unitId,
      principalCents: principal,
      interestPct: input.interestPct,
      installments: input.installments,
      firstDueDate: input.firstDueDate,
      note: input.note,
      createdBy: ctx.auth.membershipId,
    });
    return json(created, { status: 201 });
  });

  admin.delete("/restructurings/:id", async (ctx) => {
    await cancelRestructuring(ctx.auth.siteId, ctx.params.id!);
    return json({ ok: true });
  });

  // ─── Raporlar ────────────────────────────────────────────────────────────
  auth.get("/reports/treasury", async (ctx) => json(await treasury(ctx.auth.siteId)));

  auth.get("/reports/balances", async (ctx) => {
    const isAdmin = ctx.auth.view === "admin";
    const [site] = await sql`
      select debt_visibility as "debtVisibility" from sites where id = ${ctx.auth.siteId}
    `;
    const openToAll = site?.debtVisibility === "herkes";

    /**
     * Daire bazlı borç listesi kişisel veridir (KVKK). Yönetim ve denetim her
     * zaman görür. Sakine varsayılan olarak yalnızca KENDİ daireleri döner;
     * başkalarının satırı gizlenmez, hiç sorgulanmaz. Site "herkese açık"
     * seçtiyse tüm liste paylaşılır. Kasa ve gider şeffaflığı bundan
     * etkilenmez: toplamlar her durumda herkese açıktır.
     */
    const pg = paging(ctx.url);
    const { items, hasMore } = await unitBalances(ctx.auth.siteId, {
      page: pg,
      memberOf: isAdmin || openToAll ? undefined : ctx.auth.membershipId,
    });

    return json({
      debtVisibility: site?.debtVisibility ?? "yonetim",
      items: items.map((b) =>
        isAdmin ? b : { ...b, ownerEmail: null, tenantEmail: null },
      ),
      page: pg.page,
      size: pg.size,
      hasMore,
    });
  });

  /** Son 12 ayın tahakkuk / tahsilat / harcama serisi — panodaki grafik için. */
  auth.get("/reports/monthly", async (ctx) => {
    const rows = await sql`
      with aylar as (
        select (date_trunc('month', current_date) - (n || ' month')::interval)::date as ay
          from generate_series(11, 0, -1) as n
      )
      select (extract(year from ay) * 100 + extract(month from ay))::int as period,
             coalesce((select sum(p.amount_cents) from payments p
                        where p.site_id = ${ctx.auth.siteId} and p.status = 'confirmed'
                          and p.paid_at >= ay and p.paid_at < ay + interval '1 month'), 0)
               as "collectedCents",
             coalesce((select sum(e.amount_cents) from expenses e
                        where e.site_id = ${ctx.auth.siteId}
                          and e.incurred_on >= ay
                          and e.incurred_on < ay + interval '1 month'), 0)
               as "spentCents",
             coalesce((select sum(d.amount_cents) from dues d
                        where d.site_id = ${ctx.auth.siteId}
                          and d.period = extract(year from ay) * 100 + extract(month from ay)), 0)
               as "accruedCents"
        from aylar order by ay
    `;
    return json({
      months: rows.map((row: Row) => ({
        period: toNumber(row.period),
        collectedCents: toCents(row.collectedCents),
        spentCents: toCents(row.spentCents),
        accruedCents: toCents(row.accruedCents),
      })),
    });
  });

  auth.get("/reports/year-end/:year", async (ctx) => {
    const year = Number(ctx.params.year);
    if (!Number.isInteger(year) || year < 2000 || year > 2999)
      throw badRequest("Geçersiz yıl");
    const settlement = await yearEndSettlement(ctx.auth.siteId, year);
    if (ctx.auth.view === "admin") return json(settlement);

    /**
     * Sakine yıl toplamları (tahakkuk, harcama, fark) aynen gösterilir —
     * mahsuplaşmanın doğruluğu ancak böyle denetlenebilir. Daire dökümünden
     * ise yalnızca kendi daireleri döner.
     */
    const own = new Set(
      (
        await sql`
        select id from units
         where site_id = ${ctx.auth.siteId}
           and ${ctx.auth.membershipId} in (owner_membership_id, tenant_membership_id)
      `
      ).map((u: Row) => u.id as string),
    );
    return json({
      ...settlement,
      units: settlement.units.filter((u) => own.has(u.unitId)),
    });
  });

  admin.post("/reports/year-end/:year/apply", async (ctx) =>
    json(
      await applyYearEnd(ctx.auth.siteId, Number(ctx.params.year), ctx.auth.membershipId),
    ),
  );

  /**
   * Mahsuplaşmayı geri alır. Yanlış yıl seçmek ya da eksik gider girmiş olmak
   * mümkün olduğu için bu işlem dönüşsüz olmamalı: yıl için üretilen iade ve
   * ek tahsilat kayıtları silinir, daire bakiyeleri eski hâline döner.
   */
  admin.delete("/reports/year-end/:year/apply", async (ctx) => {
    const year = Number(ctx.params.year);
    if (!Number.isInteger(year) || year < 2000 || year > 2999) {
      throw badRequest("Geçersiz yıl");
    }
    const removed = await sql`
      delete from adjustments
       where site_id = ${ctx.auth.siteId} and year = ${year}
      returning id
    `;
    if (removed.length === 0) throw notFound("Bu yıl için mahsuplaşma kaydı yok");
    return json({ ok: true, removed: removed.length });
  });
}

export async function assertUnitAccess(auth: Auth, unitId: string) {
  const [unit] = await sql`
    select owner_membership_id as "ownerId", tenant_membership_id as "tenantId",
           coalesce(owner_membership_id, tenant_membership_id) as "membershipId"
      from units where id = ${unitId} and site_id = ${auth.siteId}
  `;
  if (!unit) throw notFound("Daire bulunamadı");
  // Malik de kiracı da kendi dairesi için ödeme yapabilir (KMK m.22).
  const belongs = unit.ownerId === auth.membershipId || unit.tenantId === auth.membershipId;
  if (auth.role !== "admin" && !belongs) {
    throw badRequest("Bu daire size ait değil");
  }
  return unit;
}
