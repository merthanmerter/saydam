import type {
  CallbackResult,
  CheckoutRequest,
  CheckoutSession,
  PaytrCredentials,
} from "./types.ts";

/**
 * PayTR iFrame API istemcisi.
 *
 * İmza (1. adım):
 *   hashStr = merchant_id + user_ip + merchant_oid + email + payment_amount +
 *             user_basket + no_installment + max_installment + currency + test_mode
 *   paytr_token = base64(HMAC-SHA256(hashStr + merchant_salt, merchant_key))
 *
 * Bildirim (2. adım):
 *   hash = base64(HMAC-SHA256(merchant_oid + merchant_salt + status + total_amount,
 *                             merchant_key))
 *
 * https://dev.paytr.com/iframe-api
 *
 * iyzico'dan önemli farkı: sonuç kullanıcıyla birlikte dönmez. Kullanıcı
 * `merchant_ok_url`e yönlendirilirken kesin sonuç ayrı bir sunucu-sunucu
 * bildirimiyle gelir ve bu bildirime düz metin "OK" yanıtı verilmelidir.
 */
const TOKEN_URL = "https://www.paytr.com/odeme/api/get-token";
const FORM_URL = "https://www.paytr.com/odeme/guvenli";

type Account = { sandbox: boolean; credentials: PaytrCredentials };

const sign = (key: string, value: string) =>
  new Bun.CryptoHasher("sha256", key).update(value).digest("base64");

/** PayTR sipariş numarası yalnızca harf ve rakam kabul eder. */
export const toMerchantOid = (prefix: string, id: string) =>
  `${prefix}${id.replace(/[^a-zA-Z0-9]/g, "")}`.slice(0, 64);

const basketOf = (description: string, amountCents: number) =>
  Buffer.from(
    JSON.stringify([[description.slice(0, 60), (amountCents / 100).toFixed(2), 1]]),
  ).toString("base64");

async function getToken(account: Account, fields: Record<string, string>) {
  const { merchantId, merchantKey, merchantSalt } = account.credentials;
  const hashStr =
    merchantId +
    fields.user_ip +
    fields.merchant_oid +
    fields.email +
    fields.payment_amount +
    fields.user_basket +
    fields.no_installment +
    fields.max_installment +
    fields.currency +
    fields.test_mode;

  const response = await fetch(TOKEN_URL, {
    method: "POST",
    body: new URLSearchParams({
      ...fields,
      merchant_id: merchantId,
      paytr_token: sign(merchantKey, hashStr + merchantSalt),
    }),
  });
  return (await response.json()) as { status: string; token?: string; reason?: string };
}

const commonFields = (account: Account, request: CheckoutRequest) => ({
  user_ip: request.buyer.ip,
  merchant_oid: request.reference,
  email: request.buyer.email,
  payment_amount: String(request.amountCents),
  user_basket: basketOf(request.description, request.amountCents),
  no_installment: "0",
  max_installment: "0",
  currency: "TL",
  test_mode: account.sandbox ? "1" : "0",
  user_name: request.buyer.fullName || "Site Sakini",
  user_address: request.buyer.address || "-",
  user_phone: request.buyer.phone || "0000000000",
  merchant_ok_url: request.successUrl,
  merchant_fail_url: request.failureUrl,
  timeout_limit: "30",
  debug_on: "0",
});

export async function startCheckout(
  account: Account,
  request: CheckoutRequest,
): Promise<CheckoutSession> {
  const result = await getToken(account, commonFields(account, request));
  if (result.status !== "success" || !result.token) {
    throw new Error(result.reason ?? "PayTR ödeme formu başlatılamadı");
  }
  return {
    redirectUrl: `${FORM_URL}/${result.token}`,
    providerRef: request.reference,
  };
}

/**
 * Bildirimi doğrular. İmza tutmuyorsa istek PayTR'dan gelmemiş demektir ve
 * hiçbir kayıt güncellenmemelidir.
 */
export function verifyCallback(
  account: Account,
  form: Record<string, string>,
): CallbackResult {
  const { merchantKey, merchantSalt } = account.credentials;
  const expected = sign(
    merchantKey,
    `${form.merchant_oid}${merchantSalt}${form.status}${form.total_amount}`,
  );
  if (expected !== form.hash) throw new Error("PayTR bildirimi doğrulanamadı: hatalı imza");

  const total = Number(form.total_amount);
  return {
    providerRef: form.merchant_oid ?? "",
    paid: form.status === "success",
    amountCents: Number.isFinite(total) ? total : null,
    error: form.status === "success" ? undefined : form.failed_reason_msg,
  };
}

/**
 * Anahtarları test modunda bir jeton isteyerek doğrular; para hareketi
 * oluşmaz. PayTR'ın kimlik doğrulamalı en hafif ucu budur.
 */
export async function verifyAccount(account: Account) {
  const probe = { ...account, sandbox: true };
  const result = await getToken(
    probe,
    commonFields(probe, {
      reference: toMerchantOid("saydamdogrulama", crypto.randomUUID()),
      amountCents: 100,
      description: "Anahtar dogrulama",
      buyer: {
        id: "verify",
        fullName: "say-dam Dogrulama",
        email: "dogrulama@saydam.test",
        address: "-",
        phone: "0000000000",
        ip: "127.0.0.1",
      },
      notifyUrl: "",
      successUrl: "https://saydam.test/ok",
      failureUrl: "https://saydam.test/fail",
    }),
  );
  if (result.status !== "success") {
    throw new Error(result.reason ?? "PayTR anahtarları doğrulanamadı");
  }
}
