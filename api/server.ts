/**
 * Vercel Bun Runtime giriş noktası. `vercel.json` içindeki yeniden yazma
 * kuralı bütün `/api/*` isteklerini bu işleve yönlendirir; statik dosyalar
 * `dist/` klasöründen CDN üzerinden sunulur.
 */
import { handleApi } from "../src/server/app.ts";

Bun.serve({ fetch: handleApi });
