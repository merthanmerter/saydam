import { currentPeriod, periodLabel } from "../../lib/period.ts";
import { runDues } from "../accounting.ts";
import { sql } from "../db.ts";
import { env } from "../env.ts";
import { json, type Router, unauthorized } from "../http.ts";

/**
 * Zamanlanmış işler. Vercel Cron her çağrıda `Authorization: Bearer $CRON_SECRET`
 * gönderir; self-host kurulumda aynı başlıkla herhangi bir zamanlayıcı
 * (systemd timer, cron, GitHub Actions) kullanılabilir.
 */
export function cronRoutes(pub: Router) {
  pub.get("/cron/accrual", async (ctx) => {
    const secret = process.env.CRON_SECRET;
    if (!secret || ctx.req.headers.get("authorization") !== `Bearer ${secret}`) {
      throw unauthorized("Geçersiz zamanlayıcı anahtarı");
    }

    const period = currentPeriod();
    const today = new Date().getDate();

    /**
     * Ayın 28'inden sonrası olmadığı için `accrual_day` en fazla 28'dir; yine de
     * kısa aylarda gün atlanmasın diye ayın son gününde geride kalanlar da alınır.
     */
    const lastDay = new Date(
      new Date().getFullYear(),
      new Date().getMonth() + 1,
      0,
    ).getDate();

    const sites = await sql`
      select s.id, s.name,
             coalesce((select m.id from memberships m
                        where m.site_id = s.id and m.role = 'admin' and m.status = 'active'
                        order by m.created_at limit 1), null) as "adminId"
        from sites s
       where s.accrual_day is not null
         and (s.accrual_day = ${today} or (${today} = ${lastDay} and s.accrual_day > ${today}))
         and not exists (
           select 1 from dues_runs r where r.site_id = s.id and r.period = ${period}
         )
    `;

    const results: { site: string; ok: boolean; detail: string }[] = [];
    for (const site of sites) {
      if (!site.adminId) {
        results.push({ site: site.name, ok: false, detail: "Aktif yönetici yok" });
        continue;
      }
      try {
        const run = await runDues(site.id, period, site.adminId);
        results.push({
          site: site.name,
          ok: true,
          detail: `${run.units} daireye tahakkuk edildi`,
        });
      } catch (error) {
        // Bir sitenin hatası diğerlerini durdurmamalı; sebebi kayda geçer.
        results.push({
          site: site.name,
          ok: false,
          detail: error instanceof Error ? error.message : "bilinmeyen hata",
        });
      }
    }

    console.info(`[cron] ${periodLabel(period)} otomatik tahakkuk:`, results);
    return json({ period, saasMode: env.saasMode, processed: results.length, results });
  });
}
