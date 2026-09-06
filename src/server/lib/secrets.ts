import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";
import { env } from "../env.ts";

/**
 * Sitelerin ödeme sağlayıcı anahtarları veritabanında açık metin durmasın diye
 * AES-256-GCM ile şifrelenir. Biçim: `iv.authTag.ciphertext` (base64url).
 *
 * Anahtar türetme scrypt ile pahalıdır; ilk kullanımda hesaplanıp saklanır.
 */
let cached: Buffer | undefined;
const key = () => {
  cached ??= scryptSync(env.secretsKey, "saydam-secrets-v1", 32);
  return cached;
};

export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const body = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), body].map((b) => b.toString("base64url")).join(".");
}

export function decryptSecret(payload: string): string {
  const [iv, tag, body] = payload.split(".");
  if (!iv || !tag || !body) throw new Error("Şifreli değer bozuk");
  const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(body, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

/** Ekranda göstermek için: `sandbox-…7hQa`, kısa değerlerde `12…56`. */
export const maskKey = (value: string) =>
  value.length <= 8
    ? `${value.slice(0, 2)}…${value.slice(-2)}`
    : `${value.slice(0, 8)}…${value.slice(-4)}`;
