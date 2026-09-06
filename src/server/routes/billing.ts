import { z } from "zod";
import type { Auth } from "../auth.ts";
import { sql, toCents } from "../db.ts";
import { env } from "../env.ts";
import { badRequest, body, HttpError, json, notFound, type Router } from "../http.ts";
import {
  type ProviderAccount,
  platformAccount,
  retrieveCheckout,
  startCheckout,
  toMerchantOid,
  verifyPaytrCallback,
} from "../lib/payment/index.ts";
import { decryptSecret } from "../lib/secrets.ts";
import { cardFee } from "../money.ts";
import { planPrice } from "../subscription.ts";
import { assertUnitAccess } from "./finance.ts";

/** conversationId, iyzico panelinde mutabakat için işlemi etiketler. */
const DUE = "aidat";
const SUB = "abonelik";

/**
 * Sitenin kendi iyzico hesabı. Aidat tahsilatı doğrudan siteye gider; platform
 * bu paraya hiçbir şekilde aracılık etmez. Tanımlı değilse online ödeme kapalı
 * demektir ve yalnızca havale akışı çalışır.
 */
async function siteAccount(
  siteId: string,
): Promise<(ProviderAccount & { feePct: number }) | null> {
  const [row] = await sql`
    select payment_provider as "provider", payment_credentials as "credentials",
           payment_sandbox as "sandbox", card_fee_pct as "feePct"
      from sites where id = ${siteId}
  `;
  if (!row?.provider || !row.credentials) return null;
  return {
    provider: row.provider,
    sandbox: row.sandbox,
    credentials: JSON.parse(decryptSecret(row.credentials)),
    feePct: toCents(row.feePct),
  } as ProviderAccount & { feePct: number };
}

/** Sağlayıcıların ortak ihtiyacı: alıcı bilgisi ve dönüş adresleri. */
const buyerOf = (
  auth: { membershipId: string; fullName: string; email: string; siteName: string },
  req: Request,
) => ({
  id: auth.membershipId,
  fullName: auth.fullName,
  email: auth.email,
  address: auth.siteName,
  phone: "",
  ip: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "127.0.0.1",
});

export function billingRoutes(
  pub: Router,
  auth: Router<Auth>,
  active: Router<Auth>,
  admin: Router<Auth>,
) {
  pub.get("/billing/plans", () =>
    json({
      saasMode: env.saasMode,
      plans: [
        { id: "monthly", label: "Aylık", priceCents: planPrice("monthly") },
        { id: "yearly", label: "Yıllık", priceCents: planPrice("yearly") },
      ],
    }),
  );

  // ─── Sakinin online aidat ödemesi ────────────────────────────────────────
  active.post("/payments/checkout", async (ctx) => {
    const account = await siteAccount(ctx.auth.siteId);
    if (!account) {
      throw badRequest(
        "Bu sitede kartla ödeme açık değil. Havale ile ödeyip bildirim yapabilirsiniz.",
      );
    }
    const input = await body(
      ctx.req,
      z.object({ unitId: z.uuid(), amountCents: z.number().int().min(100) }),
    );
    await assertUnitAccess(ctx.auth, input.unitId);

    /**
     * Komisyon farkı borcun ÜSTÜNE eklenir: karttan çekilen tutar
     * `amountCents + fee`, borca işlenen tutar ise yalnızca `amountCents`.
     * Fark sağlayıcıya gider, kasaya girmez.
     */
    const fee = cardFee(input.amountCents, account.feePct);

    const [payment] = await sql`
      insert into payments (site_id, unit_id, membership_id, amount_cents, fee_cents,
                            method, status, provider, paid_at)
      values (${ctx.auth.siteId}, ${input.unitId}, ${ctx.auth.membershipId},
              ${input.amountCents}, ${fee}, 'online', 'pending', ${account.provider},
              now())
      returning id
    `;

    // PayTR sipariş numarası harf-rakam olmalı; iyzico'da da sorun çıkarmaz.
    const reference = toMerchantOid(DUE, payment.id);
    const checkout = await startCheckout(account, {
      reference,
      amountCents: input.amountCents + fee,
      description: `${ctx.auth.siteName} aidat odemesi`,
      buyer: buyerOf(ctx.auth, ctx.req),
      notifyUrl: `${env.appUrl}/api/payments/${account.provider}/callback`,
      successUrl: `${env.appUrl}/panel/odemeler?odeme=alindi`,
      failureUrl: `${env.appUrl}/panel/odemeler?odeme=hata`,
    });

    await sql`
      update payments set provider_ref = ${checkout.providerRef} where id = ${payment.id}
    `;
    return json({ paymentPageUrl: checkout.redirectUrl, feeCents: fee });
  });

  // ─── Platform aboneliği (bulut sürümü) ───────────────────────────────────
  admin.post("/billing/subscribe", async (ctx) => {
    if (!env.saasMode) throw badRequest("Bu kurulum self-host modunda, abonelik gerekmez");
    const input = await body(
      ctx.req,
      z.object({
        plan: z.enum(["monthly", "yearly"]),
        billToSite: z.boolean().default(true),
      }),
    );
    const account = platformAccount();
    if (!account) {
      throw new HttpError(
        503,
        "Ödeme sağlayıcısı yapılandırılmadığı için abonelik başlatılamıyor.",
      );
    }

    // Kayıt geçerlilik ÜRETMEZ: `past_due` olarak açılır ve ancak ödeme
    // doğrulandıktan sonra callback tarafından `active` yapılır.
    await sql`
      insert into subscriptions (site_id, plan, status, price_cents, bill_to_site,
                                 current_period_start, current_period_end)
      values (${ctx.auth.siteId}, ${input.plan}, 'past_due', ${planPrice(input.plan)},
              ${input.billToSite}, current_date, current_date)
      on conflict (site_id) do update
        set plan = excluded.plan, price_cents = excluded.price_cents,
            bill_to_site = excluded.bill_to_site
    `;

    const reference = toMerchantOid(SUB, `${ctx.auth.siteId}${Date.now()}`);
    const checkout = await startCheckout(account, {
      reference,
      amountCents: planPrice(input.plan),
      description: `say-dam ${input.plan === "yearly" ? "yillik" : "aylik"} abonelik`,
      buyer: buyerOf(ctx.auth, ctx.req),
      notifyUrl: `${env.appUrl}/api/payments/${account.provider}/callback`,
      successUrl: `${env.appUrl}/panel/ayarlar?abonelik=alindi`,
      failureUrl: `${env.appUrl}/panel/ayarlar?abonelik=hata`,
    });
    await sql`
      update subscriptions set provider_ref = ${checkout.providerRef}
       where site_id = ${ctx.auth.siteId}
    `;
    return json({ paymentPageUrl: checkout.redirectUrl });
  });

  admin.post("/billing/cancel", async (ctx) => {
    const [row] = await sql`
      update subscriptions set status = 'canceled' where site_id = ${ctx.auth.siteId}
      returning id
    `;
    if (!row) throw notFound("Abonelik bulunamadı");
    return json({ ok: true });
  });

  auth.get("/billing/subscription", async (ctx) => {
    const [row] = await sql`
      select plan, status, price_cents as "priceCents", bill_to_site as "billToSite",
             current_period_start as "currentPeriodStart",
             current_period_end as "currentPeriodEnd"
        from subscriptions where site_id = ${ctx.auth.siteId}
    `;
    return json({
      subscription: row ? { ...row, priceCents: toCents(row.priceCents) } : null,
    });
  });

  // ─── Sağlayıcı geri dönüşleri ───────────────────────────────────────────
  /**
   * Ortak sonuç işleme. Aynı bildirim birden çok kez gelebileceği için
   * güncelleme yalnızca `pending` kayda uygulanır; tekrarlar etkisizdir.
   */
  const settle = async (providerRef: string, paid: boolean, error?: string) => {
    const [payment] = await sql`
      update payments
         set status = ${paid ? "confirmed" : "rejected"},
             decided_at = now(),
             note = ${paid ? null : (error ?? "Ödeme başarısız")}
       where provider_ref = ${providerRef} and status = 'pending'
      returning id
    `;
    if (payment) return "payment" as const;

    if (!paid) return "none" as const;
    const [subscription] = await sql`
      select site_id as "siteId", plan from subscriptions where provider_ref = ${providerRef}
    `;
    if (!subscription) return "none" as const;

    const end = new Date();
    end.setMonth(end.getMonth() + (subscription.plan === "yearly" ? 12 : 1));
    await sql`
      update subscriptions
         set status = 'active', current_period_start = current_date,
             current_period_end = ${end.toISOString().slice(0, 10)}
       where site_id = ${subscription.siteId}
    `;
    return "subscription" as const;
  };

  /** Hangi hesapla doğrulayacağımızı, işlemin başında kaydettiğimiz referanstan buluruz. */
  const accountFor = async (providerRef: string): Promise<ProviderAccount | null> => {
    const [payment] = await sql`
      select site_id as "siteId" from payments where provider_ref = ${providerRef}
    `;
    if (payment) return siteAccount(payment.siteId);
    const [subscription] = await sql`
      select 1 from subscriptions where provider_ref = ${providerRef}
    `;
    return subscription ? platformAccount() : null;
  };

  /**
   * iyzico kullanıcıyı buraya POST ile yönlendirir ve yalnızca `token` gelir.
   * Sonuç, forma güvenilmeden sunucu-sunucu `retrieve` çağrısıyla okunur.
   */
  pub.post("/payments/iyzico/callback", async (ctx) => {
    const form = await ctx.req.formData().catch(() => null);
    const token = String(form?.get("token") ?? "");
    if (!token) return redirect("/panel/odemeler?odeme=hata");

    const account = await accountFor(token);
    if (account?.provider !== "iyzico") {
      return redirect("/panel/odemeler?odeme=hata");
    }

    const result = await retrieveCheckout(account, token);
    const paid = result.status === "success" && result.paymentStatus === "SUCCESS";
    const kind = await settle(token, paid, result.errorMessage);
    const page =
      kind === "subscription" ? "/panel/ayarlar?abonelik" : "/panel/odemeler?odeme";
    return redirect(`${page}=${paid ? "basarili" : "hata"}`);
  });

  /**
   * PayTR sonucu kullanıcıyla göndermez: kullanıcı `merchant_ok_url`e giderken
   * kesin sonuç bu sunucu-sunucu bildirimiyle ulaşır. İmza doğrulanır ve
   * PayTR'ın tekrar denememesi için düz metin "OK" yanıtı verilir.
   */
  pub.post("/payments/paytr/callback", async (ctx) => {
    const form = Object.fromEntries(await ctx.req.formData()) as Record<string, string>;
    const account = await accountFor(form.merchant_oid ?? "");
    if (account?.provider !== "paytr") {
      return new Response("OK", { headers: { "content-type": "text/plain" } });
    }

    try {
      const result = verifyPaytrCallback(account, form);
      await settle(result.providerRef, result.paid, result.error);
    } catch (error) {
      console.error("PayTR bildirimi reddedildi:", error);
      return new Response("bad hash", { status: 400 });
    }
    return new Response("OK", { headers: { "content-type": "text/plain" } });
  });
}

const redirect = (path: string) =>
  new Response(null, { status: 303, headers: { location: env.appUrl + path } });
