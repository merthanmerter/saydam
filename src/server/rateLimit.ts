import { sql } from "./db.ts";
import { HttpError } from "./http.ts";

/**
 * Giriş denemesi sınırı. Şifre denemesi herkese açık bir uçta yapıldığı için
 * sınırsız bırakıldığında kaba kuvvet saldırısına açık kalır.
 *
 * Sayaç veritabanında tutulur: sunucusuz ortamda istekler farklı örneklere
 * düştüğü için bellekteki bir sayaç hiçbir şey korumaz.
 */
const WINDOW_MINUTES = 15;
/** Aynı hesaba art arda deneme sınırı. */
const ACCOUNT_LIMIT = 8;
/** Aynı adresten farklı hesaplara deneme sınırı. */
const IP_LIMIT = 30;

export const clientIp = (req: Request) =>
  req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
  req.headers.get("x-real-ip") ||
  "bilinmiyor";

const keysFor = (siteId: string, email: string, ip: string) => [
  `hesap:${siteId}:${email}`,
  `ip:${ip}`,
];

/** Sınır aşıldıysa 429 fırlatır. */
export async function assertLoginAllowed(siteId: string, email: string, ip: string) {
  const [accountKey, ipKey] = keysFor(siteId, email, ip);
  const rows = await sql`
    select key, count(*)::int as n
      from login_attempts
     where key in (${accountKey!}, ${ipKey!})
       and created_at > now() - (${WINDOW_MINUTES} || ' minutes')::interval
     group by key
  `;
  const count = (key: string) =>
    Number(rows.find((r: { key: string }) => r.key === key)?.n ?? 0);

  if (count(accountKey!) >= ACCOUNT_LIMIT || count(ipKey!) >= IP_LIMIT) {
    throw new HttpError(
      429,
      `Çok fazla başarısız giriş denemesi. ${WINDOW_MINUTES} dakika sonra tekrar deneyin.`,
    );
  }
}

export async function recordFailedLogin(siteId: string, email: string, ip: string) {
  const [accountKey, ipKey] = keysFor(siteId, email, ip);
  await sql`insert into login_attempts ${sql([{ key: accountKey }, { key: ipKey }])}`;
  // Fırsat buldukça eski kayıtları temizle; ayrı bir zamanlanmış iş gerekmesin.
  if (Math.random() < 0.05) {
    await sql`delete from login_attempts where created_at < now() - interval '1 hour'`;
  }
}

export async function clearLoginAttempts(siteId: string, email: string, ip: string) {
  const [accountKey, ipKey] = keysFor(siteId, email, ip);
  await sql`delete from login_attempts where key in (${accountKey!}, ${ipKey!})`;
}
