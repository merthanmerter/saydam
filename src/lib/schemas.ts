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
