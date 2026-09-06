import { requireActive, requireAdmin, requireAuth } from "./auth.ts";
import { sql } from "./db.ts";
import { errorResponse, json, Router } from "./http.ts";
import { authRoutes } from "./routes/auth.ts";
import { billingRoutes } from "./routes/billing.ts";
import { cronRoutes } from "./routes/cron.ts";
import { fileRoutes } from "./routes/files.ts";
import { financeRoutes } from "./routes/finance.ts";
import { siteRoutes } from "./routes/site.ts";
import { socialRoutes } from "./routes/social.ts";
import { withSecurityHeaders } from "./securityHeaders.ts";

const router = new Router();
/** Oturum var (siteden çıkarılmış üyeler dahil — salt okunur arşiv erişimi). */
const auth = router.guarded(requireAuth);
/** Oturum var ve üyelik aktif. */
const active = router.guarded(requireActive);
/** Site yönetimi. */
const admin = router.guarded(requireAdmin);

/**
 * Sağlık kontrolü. Veritabanına da bakar: uygulama ayakta ama veritabanı
 * erişilemezken 200 dönmek, izleme sistemlerine "her şey yolunda" demek olur.
 */
router.get("/health", async () => {
  try {
    // Havuzun bağlantı zaman aşımı 15 sn; bir sağlık ucunun o kadar beklemesi
    // izleme sistemlerini kilitler, o yüzden ayrıca kısa bir sınır konur.
    // Yarışı kaybeden sorgunun reddi sahipsiz kalmasın: Bun'da yakalanmamış
    // promise reddi süreci düşürebilir.
    const probe = sql`select 1`;
    probe.catch(() => {});
    await Promise.race([
      probe,
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("veritabanı 3 sn içinde yanıt vermedi")), 3000),
      ),
    ]);
    return json({ ok: true, db: "up" });
  } catch (error) {
    console.error("Sağlık kontrolü: veritabanına erişilemiyor", error);
    return json({ ok: false, db: "down" }, { status: 503 });
  }
});

authRoutes(router, auth);
siteRoutes(auth, admin);
financeRoutes(auth, active, admin);
socialRoutes(auth, active, admin);
fileRoutes(active);
billingRoutes(router, auth, active, admin);
cronRoutes(router);

/**
 * Tüm API'nin tek giriş noktası.
 *
 * Vercel'de bu işlev `/api/server` altında yayınlanır ve `vercel.json`
 * yeniden yazma kuralı `/api/*` isteklerini buraya yollar; yerelde ise
 * `Bun.serve` doğrudan `/api/*` yolunu verir. İki durumda da yolu aynı
 * biçime indirgeriz.
 */
export async function handleApi(req: Request): Promise<Response> {
  const { pathname } = new URL(req.url);
  const path =
    (pathname.startsWith("/api/server")
      ? pathname.slice("/api/server".length)
      : pathname.startsWith("/api")
        ? pathname.slice("/api".length)
        : pathname) || "/";

  try {
    return withSecurityHeaders(await router.handle(req, path));
  } catch (error) {
    return withSecurityHeaders(errorResponse(error));
  }
}
