/** Ortam değişkenleri tek noktadan, eksikse anlamlı hata ile. */
const required = (key: string): string => {
  const value = process.env[key];
  if (!value) throw new Error(`Eksik ortam değişkeni: ${key}`);
  return value;
};

export const env = {
  get databaseUrl() {
    return process.env.DATABASE_URL ?? process.env.POSTGRES_URL ?? required("DATABASE_URL");
  },
  get sessionSecret() {
    return process.env.SESSION_SECRET ?? required("SESSION_SECRET");
  },
  /** Mutlak URL üretmek için (davet linkleri, ödeme callback'i). */
  get appUrl() {
    const explicit = process.env.APP_URL;
    if (explicit) return explicit.replace(/\/$/, "");
    const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL ?? process.env.VERCEL_URL;
    return vercel ? `https://${vercel}` : "http://localhost:3000";
  },
  /** true → bulut (SaaS) sürümü: abonelik ve fiyatlandırma aktif. */
  get saasMode() {
    return process.env.SAAS_MODE === "true";
  },
  isProduction: process.env.NODE_ENV === "production" || !!process.env.VERCEL,

  resendApiKey: process.env.RESEND_API_KEY,
  mailFrom: process.env.MAIL_FROM ?? "say-dam <onboarding@resend.dev>",

  blobToken: process.env.BLOB_READ_WRITE_TOKEN,

  /**
   * Platformun KENDİ PayTR hesabı — yalnızca bulut sürümü abonelik
   * tahsilatında kullanılır. Sitelerin aidat tahsilatı, her sitenin kendi
   * seçtiği sağlayıcıyla yapılır ve bu anahtarlarla ilgisi yoktur.
   */
  platformPaytr: {
    merchantId: process.env.PLATFORM_PAYTR_MERCHANT_ID,
    merchantKey: process.env.PLATFORM_PAYTR_MERCHANT_KEY,
    merchantSalt: process.env.PLATFORM_PAYTR_MERCHANT_SALT,
    sandbox: process.env.PLATFORM_PAYTR_SANDBOX !== "false",
  },

  /**
   * Sitelerin iyzico anahtarlarını veritabanında şifrelemek için kullanılır.
   * Tanımlı değilse SESSION_SECRET'ten türetilir; bu durumda SESSION_SECRET'i
   * değiştirmek kayıtlı anahtarların çözülememesine yol açar.
   */
  get secretsKey() {
    return process.env.SECRETS_KEY ?? this.sessionSecret;
  },
} as const;

/** Bulut sürümü fiyatları (kuruş). */
export const PLAN_PRICES = {
  monthly: 190_000,
  yearly: 1_900_000,
} as const;
