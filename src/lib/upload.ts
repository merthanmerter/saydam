import { upload } from "@vercel/blob/client";

/** Dosyayı doğrudan Blob deposuna yükler; sunucu yalnızca jeton üretir. */
export async function uploadFile(siteId: string, folder: string, file: File) {
  const safeName = file.name.replace(/[^\w.-]+/g, "_").slice(-80);
  const blob = await upload(`sites/${siteId}/${folder}/${safeName}`, file, {
    access: "public",
    handleUploadUrl: "/api/blob/upload",
  });
  return { url: blob.url, name: file.name, size: file.size };
}
