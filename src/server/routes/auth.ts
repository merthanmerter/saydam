import { z } from "zod";
import type { Auth } from "../auth.ts";
import {
  clearCookie,
  consumeAuthToken,
  createSession,
  currentAuth,
  destroySession,
  hashPassword,
  issueAuthToken,
  readToken,
  sessionCookie,
  tokenDigest,
  verifyPassword,
} from "../auth.ts";
import { sql } from "../db.ts";
import { env } from "../env.ts";
import { body, json, type Router, unauthorized } from "../http.ts";
import { inviteMail, resetMail, sendMail } from "../lib/mail.ts";
import {
  assertLoginAllowed,
  clearLoginAttempts,
  clientIp,
  recordFailedLogin,
} from "../rateLimit.ts";
import { planPrice, trialEnd } from "../subscription.ts";

const email = z.string().trim().toLowerCase().pipe(z.email("Geçerli bir e-posta girin"));
const password = z.string().min(8, "Şifre en az 8 karakter olmalı").max(200);

const registerSchema = z.object({
  siteName: z.string().trim().min(2).max(120),
  city: z.string().trim().max(80).default(""),
  address: z.string().trim().max(300).default(""),
  adminName: z.string().trim().min(2).max(120),
  adminEmail: email,
  password,
});

const slugify = (value: string) =>
  value
    .toLowerCase()
    .replaceAll("ı", "i")
    .replaceAll("ğ", "g")
    .replaceAll("ü", "u")
    .replaceAll("ş", "s")
    .replaceAll("ö", "o")
    .replaceAll("ç", "c")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 48) || "site";

export function authRoutes(pub: Router, auth: Router<Auth>) {
  /**
   * Giriş ekranındaki site arama kutusu. Tüm siteleri dökmek yerine sunucuda
   * aranır ve sonuç sayısı sınırlanır: site sayısı büyüdükçe hem yanıt hem
   * açılır liste kullanılamaz hâle gelirdi.
   */
  pub.get("/sites", async (ctx) => {
    const raw = (ctx.url.searchParams.get("q") ?? "").trim().slice(0, 60);
    // LIKE joker karakterleri kullanıcı girdisinden gelmemeli.
    const term = `%${raw.replace(/[%_\\]/g, (c) => `\\${c}`)}%`;
    const prefix = `${raw.replace(/[%_\\]/g, (c) => `\\${c}`)}%`;

    const sites = raw
      ? await sql`
          select id, name, city from sites
           where name ilike ${term} or city ilike ${term}
           order by (case when name ilike ${prefix} then 0 else 1 end), name
           limit 20
        `
      : await sql`select id, name, city from sites order by name limit 20`;
    return json({ sites });
  });

  /** Site yönetimi kendi profilini oluşturur; ilk yönetici hesabı da burada açılır. */
  pub.post("/auth/register-site", async (ctx) => {
    const input = await body(ctx.req, registerSchema);

    const result = await sql.begin(async (tx) => {
      let slug = slugify(input.siteName);
      const [taken] = await tx`select 1 from sites where slug = ${slug}`;
      if (taken) slug = `${slug}-${Math.random().toString(36).slice(2, 6)}`;

      const [site] = await tx`
        insert into sites (slug, name, city, address)
        values (${slug}, ${input.siteName}, ${input.city}, ${input.address})
        returning id
      `;
      const [user] = await tx`
        insert into users (email, full_name)
        values (${input.adminEmail}, ${input.adminName})
        on conflict (email) do update set full_name = excluded.full_name
        returning id
      `;
      const [membership] = await tx`
        insert into memberships (site_id, user_id, role, password_hash)
        values (${site.id}, ${user.id}, 'admin', ${await hashPassword(input.password)})
        returning id
      `;
      // Bulut sürümünde her yeni site ücretsiz denemeyle başlar; süre dolduğunda
      // yönetim işlemleri kilitlenir, sakinlerin erişimi etkilenmez.
      if (env.saasMode) {
        await tx`
          insert into subscriptions (site_id, plan, status, price_cents, bill_to_site,
                                     current_period_start, current_period_end)
          values (${site.id}, 'monthly', 'trialing', ${planPrice("monthly")}, false,
                  current_date, ${trialEnd()})
        `;
      }
      return { siteId: site.id as string, membershipId: membership.id as string };
    });

    ctx.cookies.push(sessionCookie(await createSession(result.membershipId)));
    return json({ siteId: result.siteId }, { status: 201 });
  });

  pub.post("/auth/login", async (ctx) => {
    const input = await body(
      ctx.req,
      z.object({ siteId: z.uuid(), email, password: z.string().min(1) }),
    );

    const ip = clientIp(ctx.req);
    await assertLoginAllowed(input.siteId, input.email, ip);

    const [row] = await sql`
      select m.id, m.password_hash as "passwordHash", m.status
        from memberships m
        join users u on u.id = m.user_id
       where m.site_id = ${input.siteId} and u.email = ${input.email}
    `;

    if (!row?.passwordHash || !(await verifyPassword(input.password, row.passwordHash))) {
      await recordFailedLogin(input.siteId, input.email, ip);
      // Hesabın var olup olmadığı, şifresinin belirlenip belirlenmediği tek bir
      // mesajın arkasında kalır: aksi hâlde uç, hesap sayımı için kullanılabilir.
      throw unauthorized("E-posta veya şifre hatalı");
    }

    await clearLoginAttempts(input.siteId, input.email, ip);
    ctx.cookies.push(sessionCookie(await createSession(row.id)));
    return json({ ok: true });
  });

  pub.post("/auth/logout", async (ctx) => {
    const token = readToken(ctx.req);
    if (token) await destroySession(token);
    ctx.cookies.push(clearCookie());
    return json({ ok: true });
  });

  /** Oturum yoksa 200 + null döner; ön yüzün açılışta hata göstermemesi için. */
  pub.get("/auth/me", async (ctx) => {
    const me = await currentAuth(ctx.req);
    return json({ me, saasMode: env.saasMode });
  });

  /** Davet/sıfırlama bağlantısının geçerliliğini gösterir (şifre ekranı için). */
  pub.get("/auth/invite/:token", async (ctx) => {
    const [row] = await sql`
      select s.name as "siteName", u.email, u.full_name as "fullName"
        from auth_tokens t
        join memberships m on m.id = t.membership_id
        join users u on u.id = m.user_id
        join sites s on s.id = m.site_id
       where t.token_hash = ${tokenDigest(ctx.params.token!)}
         and t.used_at is null and t.expires_at > now()
    `;
    if (!row) throw unauthorized("Bağlantı geçersiz veya süresi dolmuş");
    return json(row);
  });

  pub.post("/auth/setup-password", async (ctx) => {
    const input = await body(ctx.req, z.object({ token: z.string().min(10), password }));
    const membershipId = await consumeAuthToken(input.token);
    await sql`
      update memberships set password_hash = ${await hashPassword(input.password)}
       where id = ${membershipId}
    `;
    ctx.cookies.push(sessionCookie(await createSession(membershipId)));
    return json({ ok: true });
  });

  /** Kullanıcı kendi şifresini değiştirir. */
  auth.post("/auth/change-password", async (ctx) => {
    const input = await body(
      ctx.req,
      z.object({ current: z.string().min(1), next: password }),
    );
    const [row] = await sql`
      select password_hash as "passwordHash" from memberships where id = ${ctx.auth.membershipId}
    `;
    if (!row?.passwordHash || !(await verifyPassword(input.current, row.passwordHash))) {
      throw unauthorized("Mevcut şifre hatalı");
    }
    await sql`
      update memberships set password_hash = ${await hashPassword(input.next)}
       where id = ${ctx.auth.membershipId}
    `;
    return json({ ok: true });
  });

  /** Aynı e-postanın kayıtlı olduğu diğer siteler — portal değiştirmek için. */
  auth.get("/auth/my-sites", async (ctx) => {
    const sites = await sql`
      select m.id as "membershipId", m.role, m.status, s.id as "siteId", s.name, s.city
        from memberships m
        join sites s on s.id = m.site_id
       where m.user_id = ${ctx.auth.userId}
       order by s.name
    `;
    return json({ sites });
  });

  /** Başka bir siteye (aynı kullanıcı) geçiş. Şifre siteye özgü olduğu için doğrulanır. */
  auth.post("/auth/switch-site", async (ctx) => {
    const input = await body(
      ctx.req,
      z.object({ siteId: z.uuid(), password: z.string().min(1) }),
    );
    const [row] = await sql`
      select id, password_hash as "passwordHash"
        from memberships
       where user_id = ${ctx.auth.userId} and site_id = ${input.siteId}
    `;
    if (!row?.passwordHash) throw unauthorized("Bu site için hesabınız yok");
    if (!(await verifyPassword(input.password, row.passwordHash))) {
      throw unauthorized("Şifre hatalı");
    }
    const token = readToken(ctx.req);
    if (token) await destroySession(token);
    ctx.cookies.push(sessionCookie(await createSession(row.id)));
    return json({ ok: true });
  });
}

/** Davet/sıfırlama bağlantısı üretir ve mail atmayı dener. */
export async function sendAccessLink(
  membershipId: string,
  purpose: "invite" | "reset",
  siteName: string,
  to: string,
) {
  const token = await issueAuthToken(membershipId, purpose);
  const link = `${env.appUrl}/sifre-belirle/${token}`;
  const { subject, html } = (purpose === "invite" ? inviteMail : resetMail)(siteName, link);
  const result = await sendMail(to, subject, html);
  return { link, ...result };
}
