import { del } from "@vercel/blob";
import { env } from "../env.ts";

/**
 * Dosyalar tarayıcıdan doğrudan Vercel Blob'a yüklenir (sunucu gövde limiti
 * yok). Yol her zaman `sites/<siteId>/...` ile başlar, böylece kiracı ayrımı
 * dosya düzeyinde de korunur.
 */
export const belongsToSite = (url: string, siteId: string) =>
  url.includes(`/sites/${siteId}/`);

export async function deleteBlob(url: string) {
  if (!env.blobToken) return;
  await del(url, { token: env.blobToken }).catch((error) =>
    console.error("Blob silinemedi:", error),
  );
}
