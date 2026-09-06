import { z } from "zod";

/**
 * Sunucu ile istemcinin paylaştığı doğrulama kuralları.
 *
 * Aynı kuralı iki yerde yazmak, ikisinin er geç ayrışması demek: sunucu
 * "en az 8 karakter" derken formun 6'ya izin vermesi kullanıcıya boşuna bir
 * gidiş dönüş yaşatır. Şema burada bir kez tanımlanır; sunucu isteği bununla
 * reddeder, form aynı kuralla alanın altında uyarır.
 *
 * İstemcideki doğrulama bir kolaylıktır, güvenlik sınırı değil: her istek
 * sunucuda yeniden doğrulanır.
 */

/**
 * Alan birlikleri.
 *
 * Şema, TypeScript tipi ve sunucu doğrulaması aynı satırdan türer; önce üç
 * ayrı yerde elle yazılıyorlardı ve birbirinden ayrışmaları an meselesiydi.
 */
export const payerEnum = z.enum(["malik", "kiraci"]);
export const shareMethodEnum = z.enum(["esit", "arsa_payi"]);

export type Payer = z.infer<typeof payerEnum>;
export type ShareMethod = z.infer<typeof shareMethodEnum>;

export const emailField = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email("Geçerli bir e-posta girin"));

export const passwordField = z.string().min(8, "Şifre en az 8 karakter olmalı").max(200);

export const registerSchema = z.object({
  siteName: z.string().trim().min(2, "Site adı en az 2 karakter").max(120),
  city: z.string().trim().max(80),
  address: z.string().trim().max(300),
  adminName: z.string().trim().min(2, "Ad soyad en az 2 karakter").max(120),
  adminEmail: emailField,
  password: passwordField,
});

export const loginSchema = z.object({
  email: emailField,
  password: z.string().min(1, "Şifrenizi girin"),
});

/** Tekrar alanı yalnızca formda var; sunucuya tek şifre gider. */
export const setPasswordSchema = z
  .object({ password: passwordField, repeat: z.string() })
  .refine((v) => v.password === v.repeat, {
    message: "Şifreler eşleşmiyor",
    path: ["repeat"],
  });

export const documentSchema = z.object({
  title: z.string().trim().min(2, "Başlık en az 2 karakter").max(200),
  category: z.enum(["yonetmelik", "toplanti", "sozlesme", "proje", "diger"]),
});

export const postSchema = z.object({
  title: z.string().trim().min(3, "Başlık en az 3 karakter").max(200),
  body: z.string().trim().min(3, "Birkaç kelime yazın").max(5000),
  announcement: z.boolean(),
  pinned: z.boolean(),
});

export const residentSchema = z.object({
  fullName: z.string().trim().min(2, "Ad soyad en az 2 karakter").max(120),
  email: emailField,
  phone: z.string().trim().max(30),
  role: z.enum(["resident", "admin"]),
});

/** Form alanları metin tutar; sayıya çevirme ve doğrulama burada. */
export const unitSchema = z.object({
  block: z.string().trim().max(20),
  no: z.string().trim().min(1, "Kapı numarası gerekli").max(20),
  floor: z
    .string()
    .trim()
    .refine((v) => v === "" || Number.isInteger(Number(v)), "Kat bir tam sayı olmalı"),
  arsaPayi: z
    .string()
    .trim()
    .refine((v) => Number(v.replace(",", ".")) > 0, "Arsa payı sıfırdan büyük olmalı"),
  ownerMembershipId: z.string(),
  tenantMembershipId: z.string(),
});

export const siteProfileSchema = z.object({
  name: z.string().trim().min(2, "Site adı en az 2 karakter").max(120),
  city: z.string().trim().max(80),
  address: z.string().trim().max(300),
});

/**
 * IBAN: 26 karakterli Türkiye biçimi, boşluklara izin verilir. Boş
 * bırakılabilir — havale bilgisi girmek zorunlu değil.
 */
export const bankSchema = z.object({
  bankName: z.string().trim().max(80),
  ibanHolder: z.string().trim().max(120),
  iban: z
    .string()
    .trim()
    .refine(
      (v) => v === "" || /^TR\d{24}$/.test(v.replace(/\s/g, "").toUpperCase()),
      "IBAN 'TR' ile başlayan 26 karakter olmalı",
    ),
});

export const changePasswordSchema = z.object({
  current: z.string().min(1, "Mevcut şifrenizi girin"),
  next: passwordField,
});

/** Yüzde alanları metin tutar; virgül de nokta da kabul edilir. */
export const percentField = (max: number, message: string) =>
  z
    .string()
    .trim()
    .refine((v) => {
      const n = Number(v.replace(",", "."));
      return Number.isFinite(n) && n >= 0 && n <= max;
    }, message);

export const cardFeeSchema = z.object({
  feePct: percentField(20, "Komisyon farkı 0 ile 20 arasında olmalı"),
});

export const duesRulesSchema = z.object({
  dueDay: z.string(),
  lateFeePct: percentField(100, "Gecikme tazminatı 0 ile 100 arasında olmalı"),
  defaultShareMethod: shareMethodEnum,
  debtVisibility: z.enum(["yonetim", "herkes"]),
  accrualDay: z.string(),
});

/** Tutar alanı TL metni tutar; kuruşa çevirme çağıran tarafta. */
export const amountField = z
  .string()
  .trim()
  .refine(
    (v) => Number(v.replace(/\./g, "").replace(",", ".")) > 0,
    "Tutar sıfırdan büyük olmalı",
  );

export const paymentSchema = z.object({
  unitId: z.string().min(1, "Daire seçin"),
  amount: amountField,
  paidAt: z.string().min(1, "Ödeme tarihi gerekli"),
  reference: z.string().trim().max(200),
});

export const manualPaymentSchema = paymentSchema.extend({
  method: z.enum(["transfer", "cash"]),
});

export const expenseSchema = z.object({
  title: z.string().trim().min(2, "Açıklama en az 2 karakter").max(200),
  category: z.string().trim().max(60),
  vendor: z.string().trim().max(120),
  amount: amountField,
  incurredOn: z.string().min(1, "Fatura tarihi gerekli"),
  period: z.number().int(),
  startPeriod: z.number().int(),
  shareMethod: shareMethodEnum,
  payer: payerEnum,
  installments: z.string().refine((v) => {
    const n = Number(v);
    return Number.isInteger(n) && n >= 1 && n <= 120;
  }, "Taksit sayısı 1 ile 120 arasında olmalı"),
  surchargePct: percentField(100, "İşletme payı 0 ile 100 arasında olmalı"),
  note: z.string().trim().max(1000),
});

export const checkoutSchema = z.object({
  unitId: z.string().min(1, "Daire seçin"),
  amount: amountField,
});

export const restructureSchema = z.object({
  installments: z.string().refine((v) => {
    const n = Number(v);
    return Number.isInteger(n) && n >= 1 && n <= 60;
  }, "Taksit sayısı 1 ile 60 arasında olmalı"),
  interestPct: percentField(100, "Vade farkı 0 ile 100 arasında olmalı"),
  firstDueDate: z.string().min(1, "İlk taksit vadesi gerekli"),
  note: z.string().trim().max(200),
});

export const switchSiteSchema = z.object({
  siteId: z.string().min(1, "Site seçin"),
  password: z.string().min(1, "O sitedeki şifrenizi girin"),
});
