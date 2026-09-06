import { env } from "../../env.ts";
import * as iyzico from "./iyzico.ts";
import * as paytr from "./paytr.ts";
import type {
  CheckoutRequest,
  CheckoutSession,
  ProviderAccount,
  ProviderName,
} from "./types.ts";

export { toMerchantOid } from "./paytr.ts";
export * from "./types.ts";

export const PROVIDERS: { id: ProviderName; label: string; fields: string[] }[] = [
  { id: "iyzico", label: "iyzico", fields: ["apiKey", "secretKey"] },
  { id: "paytr", label: "PayTR", fields: ["merchantId", "merchantKey", "merchantSalt"] },
];

/** Ödeme sayfasını başlatır ve kullanıcının yönlendirileceği adresi döndürür. */
export function startCheckout(
  account: ProviderAccount,
  request: CheckoutRequest,
): Promise<CheckoutSession> {
  return account.provider === "iyzico"
    ? iyzico.startCheckout(account, request)
    : paytr.startCheckout(account, request);
}

/** Anahtarları kaydetmeden önce sağlayıcıya sorarak doğrular. */
export function verifyAccount(account: ProviderAccount): Promise<void> {
  return account.provider === "iyzico"
    ? iyzico.verifyAccount(account)
    : paytr.verifyAccount(account);
}

export { retrieveCheckout } from "./iyzico.ts";
export { verifyCallback as verifyPaytrCallback } from "./paytr.ts";

/**
 * Bulut aboneliğini tahsil ettiğimiz kendi hesabımız — PayTR.
 * Sitelerin aidat tahsilatıyla hiçbir ilgisi yoktur.
 */
export const platformAccount = (): ProviderAccount | null => {
  const { merchantId, merchantKey, merchantSalt, sandbox } = env.platformPaytr;
  if (!merchantId || !merchantKey || !merchantSalt) return null;
  return {
    provider: "paytr",
    sandbox,
    credentials: { merchantId, merchantKey, merchantSalt },
  };
};
