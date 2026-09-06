import { z } from "zod";
import { shareMethodEnum } from "../../lib/schemas.ts";
import { unitsSummary } from "../accounting.ts";
import type { Auth } from "../auth.ts";
import { type Row, sql } from "../db.ts";
import { env } from "../env.ts";
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
import { PROVIDERS, type ProviderAccount, verifyAccount } from "../lib/payment/index.ts";
import { decryptSecret, encryptSecret, maskKey } from "../lib/secrets.ts";
import { sendAccessLink } from "./auth.ts";

const unitSchema = z.object({
  block: z.string().trim().max(30).default(""),
  no: z.string().trim().min(1).max(30),
  floor: z.number().int().min(-5).max(200).nullable().default(null),
  /** Tapudaki arsa payı: ortak gider paylaşımının yasal ölçüsü (KMK m.20). */
  arsaPayi: z.number().positive().max(1_000_000),
  ownerMembershipId: z.uuid().nullable().default(null),
  tenantMembershipId: z.uuid().nullable().default(null),
});

export function siteRoutes(auth: Router<Auth>, admin: Router<Auth>) {
  // ─── Site profili ────────────────────────────────────────────────────────
  auth.get("/site", async (ctx) => {
    const [site] = await sql`
      select id, slug, name, city, address,
             iban, iban_holder as "ibanHolder", bank_name as "bankName",
             accrual_day as "accrualDay", due_day as "dueDay",
             late_fee_pct::float8 as "lateFeePct",
             default_share_method as "defaultShareMethod",
             debt_visibility as "debtVisibility",
             payment_provider as "paymentProvider",
             payment_credentials as "paymentCredentials",
             payment_sandbox as "paymentSandbox", card_fee_pct::float8 as "cardFeePct"
        from sites where id = ${ctx.auth.siteId}
    `;
    const [subscription] = env.saasMode
      ? await sql`
          select plan, status, price_cents::float8 as "priceCents", bill_to_site as "billToSite",
                 current_period_end as "currentPeriodEnd"
            from subscriptions where site_id = ${ctx.auth.siteId}
        `
      : [null];
    const { paymentProvider, paymentCredentials, paymentSandbox, cardFeePct, ...profile } =
      site ?? {};
    return json({
      site: profile,
      summary: await unitsSummary(ctx.auth.siteId),
      subscription: subscription ?? null,
      saasMode: env.saasMode,
      // Anahtarlar hiçbir zaman istemciye gitmez; yalnızca durum ve maskeli ön ek.
      onlinePayment: {
        enabled: Boolean(paymentProvider && paymentCredentials),
        provider: (paymentProvider as "iyzico" | "paytr" | null) ?? null,
        sandbox: Boolean(paymentSandbox),
        maskedKey:
          ctx.auth.role === "admin" && paymentCredentials
            ? maskCredentials(paymentProvider, paymentCredentials)
            : null,
        providers: PROVIDERS,
        /** Kartla ödemede sakine yansıtılan komisyon farkı (%). */
        feePct: cardFeePct,
      },
    });
  });

  admin.patch("/site", async (ctx) => {
    const input = await body(
      ctx.req,
      z.object({
        name: z.string().trim().min(2).max(120),
        city: z.string().trim().max(80),
        address: z.string().trim().max(300),
        iban: z.string().trim().max(40).nullable(),
        ibanHolder: z.string().trim().max(120).nullable(),
        bankName: z.string().trim().max(120).nullable(),
      }),
    );
    const iban = input.iban?.replace(/\s/g, "").toUpperCase() || null;
    if (iban && !/^TR\d{24}$/.test(iban)) {
      throw badRequest("IBAN 'TR' ile başlayan 26 karakter olmalı");
    }
    await sql`
      update sites
         set name = ${input.name}, city = ${input.city}, address = ${input.address},
             iban = ${iban}, iban_holder = ${input.ibanHolder},
             bank_name = ${input.bankName || null}
       where id = ${ctx.auth.siteId}
    `;
    return json({ ok: true });
  });

  /**
   * Aidat kuralları. Site profili formundan ayrı bir uçtur: iki form aynı
   * kaydı güncellediğinde biri diğerinin alanlarını sıfırlar, bu alanlar da
   * hesaplamayı doğrudan etkilediği için o riski almaya değmez. Tahakkuku
   * etkileyen ayarların tamamı — otomatik tahakkuk günü dahil — bu uçtan geçer.
   */
  admin.put("/site/dues-rules", async (ctx) => {
    const input = await body(
      ctx.req,
      z.object({
        /** Aidatın son ödeme günü; gecikme tazminatı bundan sonra işler. */
        dueDay: z.number().int().min(1).max(28),
        /** KMK m.20/c varsayılanı aylık %5. */
        lateFeePct: z.number().min(0).max(100),
        /** Yönetim planı KMK m.20'den farklı bir yöntem öngörüyorsa. */
        defaultShareMethod: shareMethodEnum,
        /** Daire bazlı borç listesini kimler görebilir (KVKK). */
        debtVisibility: z.enum(["yonetim", "herkes"]),
        /** Tahakkukun kendiliğinden çalıştığı gün; null ise elle hesaplanır. */
        accrualDay: z.number().int().min(1).max(28).nullable(),
      }),
    );
    await sql`
      update sites
         set due_day = ${input.dueDay}, late_fee_pct = ${input.lateFeePct},
             default_share_method = ${input.defaultShareMethod},
             debt_visibility = ${input.debtVisibility},
             accrual_day = ${input.accrualDay}
       where id = ${ctx.auth.siteId}
    `;
    return json({ ok: true });
  });

  /**
   * Sitenin kendi ödeme hesabı (iyzico veya PayTR). Aidat tahsilatı doğrudan
   * siteye gider; platform bu paraya aracılık etmez. Anahtarlar kaydedilmeden
   * önce sağlayıcıya sorularak doğrulanır, sonra şifrelenerek saklanır.
   */
  admin.put("/site/payment-provider", async (ctx) => {
    const input = await body(
      ctx.req,
      z.discriminatedUnion("provider", [
        z.object({
          provider: z.literal("iyzico"),
          sandbox: z.boolean().default(false),
          apiKey: z.string().trim().min(8).max(200),
          secretKey: z.string().trim().min(8).max(200),
        }),
        z.object({
          provider: z.literal("paytr"),
          sandbox: z.boolean().default(false),
          merchantId: z.string().trim().regex(/^\d+$/, "Mağaza no yalnızca rakam olmalı"),
          merchantKey: z.string().trim().min(8).max(200),
          merchantSalt: z.string().trim().min(8).max(200),
        }),
      ]),
    );

    const account: ProviderAccount =
      input.provider === "iyzico"
        ? {
            provider: "iyzico",
            sandbox: input.sandbox,
            credentials: { apiKey: input.apiKey, secretKey: input.secretKey },
          }
        : {
            provider: "paytr",
            sandbox: input.sandbox,
            credentials: {
              merchantId: input.merchantId,
              merchantKey: input.merchantKey,
              merchantSalt: input.merchantSalt,
            },
          };

    try {
      await verifyAccount(account);
    } catch (error) {
      throw badRequest(
        `Anahtarlar doğrulanamadı: ${error instanceof Error ? error.message : "bilinmeyen hata"}`,
      );
    }

    await sql`
      update sites
         set payment_provider = ${account.provider},
             payment_credentials = ${encryptSecret(JSON.stringify(account.credentials))},
             payment_sandbox = ${account.sandbox}
       where id = ${ctx.auth.siteId}
    `;
    return json({
      enabled: true,
      provider: account.provider,
      sandbox: account.sandbox,
      maskedKey: maskCredentials(
        account.provider,
        encryptSecret(JSON.stringify(account.credentials)),
      ),
    });
  });

  /**
   * Kartla ödemede sakine yansıtılan komisyon farkı.
   *
   * Sağlayıcı anahtarlarından ayrı bir uçtur: oran değiştirmek için anahtarları
   * yeniden girmek gerekmesin. 0 → fark yansıtılmaz (varsayılan).
   */
  admin.put("/site/card-fee", async (ctx) => {
    const input = await body(ctx.req, z.object({ feePct: z.number().min(0).max(20) }));
    await sql`
      update sites set card_fee_pct = ${input.feePct} where id = ${ctx.auth.siteId}
    `;
    return json({ ok: true });
  });

  /** Kartla ödemeyi kapatır; havale akışı çalışmaya devam eder. */
  admin.delete("/site/payment-provider", async (ctx) => {
    await sql`
      update sites
         set payment_provider = null, payment_credentials = null, payment_sandbox = false
       where id = ${ctx.auth.siteId}
    `;
    return json({ enabled: false });
  });

  // ─── Daireler ────────────────────────────────────────────────────────────
  auth.get("/units", async (ctx) => {
    const pg = paging(ctx.url);
    const units = await sql`
      select u.id, u.block, u.no, u.floor, u.arsa_payi::float8 as "arsaPayi",
             u.owner_membership_id  as "ownerMembershipId",
             u.tenant_membership_id as "tenantMembershipId",
             ow.full_name as "ownerName", te.full_name as "tenantName"
        from units u
        left join memberships om on om.id = u.owner_membership_id
        left join users ow on ow.id = om.user_id
        left join memberships tm on tm.id = u.tenant_membership_id
        left join users te on te.id = tm.user_id
       where u.site_id = ${ctx.auth.siteId}
       order by u.block, length(u.no), u.no
       limit ${pg.limit} offset ${pg.offset}
    `;
    return json({
      ...paged(units, pg, (u: Row) => ({ ...u, arsaPayi: u.arsaPayi })),
      summary: await unitsSummary(ctx.auth.siteId),
    });
  });

  admin.post("/units", async (ctx) => {
    const input = await body(ctx.req, z.union([unitSchema, z.array(unitSchema).max(500)]));
    const list = Array.isArray(input) ? input : [input];
    if (!list.length) throw badRequest("En az bir daire girin");

    const rows = list.map((u) => ({
      site_id: ctx.auth.siteId,
      block: u.block,
      no: u.no,
      floor: u.floor,
      arsa_payi: u.arsaPayi,
      owner_membership_id: u.ownerMembershipId,
      tenant_membership_id: u.tenantMembershipId,
    }));
    try {
      await sql`insert into units ${sql(rows)}`;
    } catch (error) {
      if (String(error).includes("units_site_id_block_no_key")) {
        throw conflict("Aynı blok/daire numarası zaten var");
      }
      throw error;
    }
    return json({ ok: true, created: rows.length }, { status: 201 });
  });

  admin.patch("/units/:id", async (ctx) => {
    const input = await body(ctx.req, unitSchema);
    const [row] = await sql`
      update units
         set block = ${input.block}, no = ${input.no}, floor = ${input.floor},
             arsa_payi = ${input.arsaPayi},
             owner_membership_id = ${input.ownerMembershipId},
             tenant_membership_id = ${input.tenantMembershipId}
       where id = ${ctx.params.id!} and site_id = ${ctx.auth.siteId}
      returning id
    `;
    if (!row) throw notFound("Daire bulunamadı");
    return json({ ok: true });
  });

  admin.delete("/units/:id", async (ctx) => {
    const [unit] = await sql`
      select 1 from units
       where id = ${ctx.params.id!} and site_id = ${ctx.auth.siteId}
    `;
    if (!unit) throw notFound("Daire bulunamadı");

    const [used] = await sql`
      select 1 from dues
       where unit_id = ${ctx.params.id!} and site_id = ${ctx.auth.siteId} limit 1
    `;
    if (used)
      throw conflict("Tahakkuk geçmişi olan daire silinemez, dairenin sakinini boşaltın");
    await sql`delete from units where id = ${ctx.params.id!} and site_id = ${ctx.auth.siteId}`;
    return json({ ok: true });
  });

  // ─── Site sakinleri ──────────────────────────────────────────────────────
  auth.get("/residents", async (ctx) => {
    const pg = paging(ctx.url);
    const residents = await sql`
      select m.id, m.role, m.status, m.password_hash is not null as "hasPassword",
             m.created_at as "createdAt",
             u.email, u.full_name as "fullName", u.phone,
             coalesce(
               (select json_agg(json_build_object('id', un.id, 'block', un.block,
                                                 'no', un.no,
                                                 'role', case when un.owner_membership_id = m.id
                                                              then 'malik' else 'kiraci' end)
                                order by un.block, un.no)
                  from units un
                 where un.owner_membership_id = m.id
                    or un.tenant_membership_id = m.id), '[]'::json) as units
        from memberships m
        join users u on u.id = m.user_id
       where m.site_id = ${ctx.auth.siteId}
       order by m.role, u.full_name
       limit ${pg.limit} offset ${pg.offset}
    `;
    // Sakinler birbirlerinin e-postasını görmesin; yönetim görebilir.
    const isAdmin = ctx.auth.view === "admin";
    return json(
      paged(residents, pg, (r: Row) =>
        isAdmin ? r : { ...r, email: undefined, phone: undefined, hasPassword: undefined },
      ),
    );
  });

  admin.post("/residents", async (ctx) => {
    const input = await body(
      ctx.req,
      z.object({
        email: z.string().trim().toLowerCase().pipe(z.email()),
        fullName: z.string().trim().min(2).max(120),
        phone: z.string().trim().max(30).nullable().default(null),
        role: z.enum(["resident", "admin"]).default("resident"),
        unitIds: z.array(z.uuid()).default([]),
      }),
    );

    const membershipId = await sql.begin(async (tx) => {
      const [user] = await tx`
        insert into users (email, full_name, phone)
        values (${input.email}, ${input.fullName}, ${input.phone})
        on conflict (email) do update set full_name = excluded.full_name
        returning id
      `;
      const [existing] = await tx`
        select id, status from memberships
         where site_id = ${ctx.auth.siteId} and user_id = ${user.id}
      `;
      if (existing) {
        if (existing.status === "active")
          throw conflict("Bu e-posta bu sitede zaten kayıtlı");
        // Daha önce çıkarılmış sakin geri alınıyor: geçmişi korunur.
        await tx`
          update memberships set status = 'active', removed_at = null, role = ${input.role}
           where id = ${existing.id}
        `;
        return existing.id as string;
      }
      const [created] = await tx`
        insert into memberships (site_id, user_id, role)
        values (${ctx.auth.siteId}, ${user.id}, ${input.role})
        returning id
      `;
      return created.id as string;
    });

    if (input.unitIds.length) {
      await sql`
        update units set owner_membership_id = ${membershipId}
         where site_id = ${ctx.auth.siteId} and id = any(${input.unitIds})
      `;
    }

    const invite = await sendAccessLink(
      membershipId,
      "invite",
      ctx.auth.siteName,
      input.email,
    );
    return json({ id: membershipId, invite }, { status: 201 });
  });

  admin.post("/residents/:id/reset-password", async (ctx) => {
    const [row] = await sql`
      select u.email from memberships m join users u on u.id = m.user_id
       where m.id = ${ctx.params.id!} and m.site_id = ${ctx.auth.siteId}
    `;
    if (!row) throw notFound("Sakin bulunamadı");
    await sql`update memberships set password_hash = null where id = ${ctx.params.id!}`;
    return json(
      await sendAccessLink(ctx.params.id!, "reset", ctx.auth.siteName, row.email),
    );
  });

  /** Siteden çıkarma: hesap silinmez, geçmiş kayıtlar korunur, erişim salt-okunur olur. */
  admin.post("/residents/:id/remove", async (ctx) => {
    if (ctx.params.id === ctx.auth.membershipId) {
      throw badRequest("Kendinizi siteden çıkaramazsınız");
    }
    const [admins] = await sql`
      select count(*)::int as n from memberships
       where site_id = ${ctx.auth.siteId} and role = 'admin' and status = 'active'
    `;
    const [target] = await sql`
      select role from memberships where id = ${ctx.params.id!} and site_id = ${ctx.auth.siteId}
    `;
    if (!target) throw notFound("Sakin bulunamadı");
    if (target.role === "admin" && admins?.n <= 1) {
      throw conflict("Sitede en az bir yönetici kalmalı");
    }
    await sql.begin(async (tx) => {
      await tx`
        update memberships set status = 'removed', removed_at = now()
         where id = ${ctx.params.id!} and site_id = ${ctx.auth.siteId}
      `;
      await tx`
        update units set owner_membership_id = null
         where owner_membership_id = ${ctx.params.id!}
      `;
      await tx`
        update units set tenant_membership_id = null
         where tenant_membership_id = ${ctx.params.id!}
      `;
      await tx`delete from sessions where membership_id = ${ctx.params.id!}`;
    });
    return json({ ok: true });
  });

  admin.patch("/residents/:id", async (ctx) => {
    const input = await body(
      ctx.req,
      z.object({
        fullName: z.string().trim().min(2).max(120),
        phone: z.string().trim().max(30).nullable(),
        role: z.enum(["resident", "admin"]),
      }),
    );
    const [row] = await sql`
      select user_id as "userId" from memberships
       where id = ${ctx.params.id!} and site_id = ${ctx.auth.siteId}
    `;
    if (!row) throw notFound("Sakin bulunamadı");
    await sql.begin(async (tx) => {
      await tx`
        update users set full_name = ${input.fullName}, phone = ${input.phone}
         where id = ${row.userId}
      `;
      await tx`update memberships set role = ${input.role} where id = ${ctx.params.id!}`;
    });
    return json({ ok: true });
  });
}

/** Kayıtlı anahtarın tanınabilir ama gizli özeti. */
function maskCredentials(provider: unknown, encrypted: string) {
  const data = JSON.parse(decryptSecret(encrypted)) as Record<string, string>;
  const primary = provider === "paytr" ? data.merchantId : data.apiKey;
  return primary ? maskKey(primary) : null;
}
