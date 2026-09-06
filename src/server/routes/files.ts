import { type HandleUploadBody, handleUpload } from "@vercel/blob/client";
import type { Auth } from "../auth.ts";
import { env } from "../env.ts";
import { badRequest, json, type Router } from "../http.ts";

const MAX_BYTES = 20 * 1024 * 1024;
const ALLOWED = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
];

/**
 * Tarayıcı dosyayı doğrudan Vercel Blob'a yükler; bu uç yalnızca kısa ömürlü
 * bir yükleme jetonu verir. Yol `sites/<siteId>/` ile başlamak zorundadır,
 * böylece bir sitenin kullanıcısı başka sitenin klasörüne yazamaz.
 */
export function fileRoutes(active: Router<Auth>) {
  active.post("/blob/upload", async (ctx) => {
    if (!env.blobToken)
      throw badRequest("Dosya yükleme yapılandırılmamış (BLOB_READ_WRITE_TOKEN)");
    const payload = (await ctx.req.json()) as HandleUploadBody;

    const result = await handleUpload({
      body: payload,
      request: ctx.req,
      token: env.blobToken,
      onBeforeGenerateToken: async (pathname) => {
        if (!pathname.startsWith(`sites/${ctx.auth.siteId}/`)) {
          throw new Error("Geçersiz yükleme yolu");
        }
        return {
          allowedContentTypes: ALLOWED,
          maximumSizeInBytes: MAX_BYTES,
          addRandomSuffix: true,
          tokenPayload: ctx.auth.membershipId,
        };
      },
    });
    return json(result);
  });
}
