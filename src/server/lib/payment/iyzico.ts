import type { CheckoutRequest, CheckoutSession, IyzicoCredentials } from "./types.ts";

/**
 * iyzico Checkout Form (CF) istemcisi — resmî SDK yerine ~60 satır fetch.
 * Kimlik doğrulama: IYZWSv2
 *   signature = HMAC-SHA256(randomKey + uriPath + body, secretKey) (hex)
 *   header    = "IYZWSv2 " + base64("apiKey:…&randomKey:…&signature:…")
 * https://docs.iyzico.com/en/getting-started/preliminaries/authentication/hmacsha256-auth
 *
 * Her çağrı bir hesapla yapılır: aidat tahsilatında sitenin kendi hesabı,
 * bulut aboneliğinde platformun hesabı. Modül genel bir yapılandırmaya bakmaz.
 */
const LIVE_URL = "https://api.iyzipay.com";
const SANDBOX_URL = "https://sandbox-api.iyzipay.com";

type Account = { sandbox: boolean; credentials: IyzicoCredentials };

async function call<T>(account: Account, uriPath: string, payload: unknown): Promise<T> {
  const { apiKey, secretKey } = account.credentials;
  const baseUrl = account.sandbox ? SANDBOX_URL : LIVE_URL;
  const body = JSON.stringify(payload);
  const randomKey = `${Date.now()}${Math.floor(Math.random() * 1e9)}`;
  const signature = new Bun.CryptoHasher("sha256", secretKey)
    .update(randomKey + uriPath + body)
    .digest("hex");
  const authorization = Buffer.from(
    `apiKey:${apiKey}&randomKey:${randomKey}&signature:${signature}`,
  ).toString("base64");

  const response = await fetch(baseUrl + uriPath, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-iyzi-rnd": randomKey,
      authorization: `IYZWSv2 ${authorization}`,
    },
    body,
  });
  return (await response.json()) as T;
}

type InitializeResult = {
  status: "success" | "failure";
  errorMessage?: string;
  token?: string;
  paymentPageUrl?: string;
  checkoutFormContent?: string;
};

type RetrieveResult = {
  status: "success" | "failure";
  errorMessage?: string;
  paymentStatus?: string;
  paymentId?: string;
  conversationId?: string;
  price?: number;
  paidPrice?: number;
  fraudStatus?: number;
  token?: string;
};

const money = (cents: number) => (cents / 100).toFixed(2);

export async function startCheckout(
  account: Account,
  request: CheckoutRequest,
): Promise<CheckoutSession> {
  const price = money(request.amountCents);
  const [name = "", ...rest] = request.buyer.fullName.split(" ");
  const address = {
    contactName: request.buyer.fullName || "Site Sakini",
    city: "Istanbul",
    country: "Turkey",
    address: request.buyer.address || "-",
  };

  const result = await call<InitializeResult>(
    account,
    "/payment/iyzipos/checkoutform/initialize/auth/ecom",
    {
      locale: "tr",
      conversationId: request.reference,
      price,
      paidPrice: price,
      currency: "TRY",
      basketId: request.reference,
      paymentGroup: "SUBSCRIPTION",
      callbackUrl: request.notifyUrl,
      enabledInstallments: [1],
      buyer: {
        id: request.buyer.id,
        name: name || "Site",
        surname: rest.join(" ") || "Sakini",
        email: request.buyer.email,
        identityNumber: "11111111111",
        registrationAddress: address.address,
        city: address.city,
        country: "Turkey",
        ip: request.buyer.ip,
      },
      billingAddress: address,
      basketItems: [
        {
          id: request.reference,
          name: request.description,
          category1: "Aidat",
          itemType: "VIRTUAL",
          price,
        },
      ],
    },
  );

  if (result.status !== "success" || !result.paymentPageUrl || !result.token) {
    throw new Error(result.errorMessage ?? "iyzico ödeme formu başlatılamadı");
  }
  return { redirectUrl: result.paymentPageUrl, providerRef: result.token };
}

/** Ödeme sonucu yalnızca bu sunucu-sunucu sorgusuyla doğrulanır. */
export const retrieveCheckout = (account: Account, token: string) =>
  call<RetrieveResult>(account, "/payment/iyzipos/checkoutform/auth/ecom/detail", {
    locale: "tr",
    token,
  });

/**
 * Anahtarların gerçekten çalıştığını doğrular. BIN sorgusu en ucuz kimlik
 * doğrulamalı uçtur; kaydetmeden önce yanlış anahtarı yakalamak için.
 */
export async function verifyAccount(account: Account) {
  const result = await call<{ status: string; errorMessage?: string }>(
    account,
    "/payment/bin/check",
    { locale: "tr", binNumber: "535805" },
  );
  if (result.status !== "success") {
    throw new Error(result.errorMessage ?? "iyzico anahtarları doğrulanamadı");
  }
}
