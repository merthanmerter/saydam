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
const percentField = (max: number, message: string) =>
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
  defaultShareMethod: z.enum(["esit", "arsa_payi"]),
  debtVisibility: z.enum(["yonetim", "herkes"]),
  accrualDay: z.string(),
});
