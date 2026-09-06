import type { Member } from "../lib/types.ts";
import { sql } from "./db.ts";
import { env } from "./env.ts";
import { type Ctx, forbidden, HttpError, unauthorized } from "./http.ts";
import { subscriptionState } from "./subscription.ts";

const COOKIE = "sd_session";
const SESSION_DAYS = 30;

/**
 * Yetki bağlamı. İstemcinin gördüğü `me` ile aynı şekil; tanım paylaşılan
 * tip modülünde durur ki iki taraf ayrışmasın.
 */
export type Auth = Member;

const VIEW_HEADER = "x-saydam-view";

export const hashPassword = (plain: string) => Bun.password.hash(plain);
export const verifyPassword = (plain: string, hash: string) =>
  Bun.password.verify(plain, hash);

/** Ham token yalnızca kullanıcıya gider; veritabanında SHA-256 özeti durur. */
export const tokenDigest = (token: string) =>
  new Bun.CryptoHasher("sha256").update(token).digest("hex");
const digest = tokenDigest;

const newToken = () =>
  Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString("base64url");

export async function createSession(membershipId: string): Promise<string> {
  const token = newToken();
  const expires = new Date(Date.now() + SESSION_DAYS * 86_400_000);
  await sql`
    insert into sessions (token_hash, membership_id, expires_at)
    values (${digest(token)}, ${membershipId}, ${expires})
  `;
  // Süresi dolmuş oturumlar arada bir temizlenir; ayrı bir zamanlanmış iş
  // gerekmesin diye giriş akışına yayılmış hâlde.
  if (Math.random() < 0.05) {
    await sql`delete from sessions where expires_at < now()`;
  }
  return token;
}

export async function destroySession(token: string) {
  await sql`delete from sessions where token_hash = ${digest(token)}`;
}

export function sessionCookie(token: string, maxAgeSeconds = SESSION_DAYS * 86_400) {
  const flags = [
    `${COOKIE}=${token}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${maxAgeSeconds}`,
  ];
  if (env.isProduction) flags.push("Secure");
  return flags.join("; ");
}

export const clearCookie = () => sessionCookie("", 0);

export function readToken(req: Request): string | null {
  const header = req.headers.get("cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name === COOKIE) return rest.join("=") || null;
  }
  return null;
}

export async function currentAuth(req: Request): Promise<Auth | null> {
  const token = readToken(req);
  if (!token) return null;

  const [row] = await sql`
    select m.id      as "membershipId",
           m.site_id as "siteId",
           m.user_id as "userId",
           m.role, m.status,
           u.email, u.full_name as "fullName",
           s.name    as "siteName",
           s.slug    as "siteSlug",
           (select count(*)::int from units un
             where un.owner_membership_id = m.id
                or un.tenant_membership_id = m.id) as "unitCount",
           sub.status                as "subStatus",
           sub.current_period_end    as "subPeriodEnd"
      from sessions ss
      join memberships m on m.id = ss.membership_id
      join users u on u.id = m.user_id
      join sites s on s.id = m.site_id
      left join subscriptions sub on sub.site_id = s.id
     where ss.token_hash = ${digest(token)}
       and ss.expires_at > now()
     limit 1
  `;
  if (!row) return null;

  const { subStatus, subPeriodEnd, ...rest } = row as Record<string, unknown>;
  const auth = rest as Auth;
  auth.subscription = subscriptionState(
    subStatus
      ? {
          status: subStatus as never,
          currentPeriodEnd: subPeriodEnd as string | Date | null,
        }
      : null,
  );
  auth.view =
    auth.role === "admin" && req.headers.get(VIEW_HEADER) === "resident"
      ? "resident"
      : auth.role;
  return auth;
}

/** Oturum şart; arşiv erişimi olan (siteden çıkarılmış) üyeler de geçer. */
export async function requireAuth(ctx: Ctx<unknown>): Promise<Auth> {
  const auth = await currentAuth(ctx.req);
  if (!auth) throw unauthorized();
  return auth;
}

/** Yazma işlemleri: siteden çıkarılmış üyeler geçemez. */
export async function requireActive(ctx: Ctx<unknown>): Promise<Auth> {
  const auth = await requireAuth(ctx);
  if (auth.status !== "active") {
    throw forbidden("Bu siteden ayrıldınız, yalnızca geçmişi görüntüleyebilirsiniz");
  }
  return auth;
}

/**
 * Abonelik kilidinden muaf yollar. Yönetimin ödeme yapabilmesi, ayarlarına ve
 * kendi hesabına erişebilmesi gerekir; aksi hâlde kilidi açmanın yolu kalmaz.
 */
const UNLOCKED = ["/billing/", "/site/payment-provider", "/auth/"];

export async function requireAdmin(ctx: Ctx<unknown>): Promise<Auth> {
  const auth = await requireActive(ctx);
  if (auth.role !== "admin") throw forbidden("Yalnızca site yönetimi yapabilir");

  if (auth.subscription.locked && !UNLOCKED.some((p) => ctx.path.startsWith(p))) {
    throw new HttpError(
      402,
      "Bulut aboneliğiniz sona erdi. Sakinler kayıtları görmeye ve ödeme yapmaya devam ediyor; yönetim işlemleri için aboneliğinizi yenileyin.",
    );
  }
  return auth;
}

/** Davet / şifre sıfırlama tokenı üretir, ham hâlini döndürür. */
export async function issueAuthToken(
  membershipId: string,
  purpose: "invite" | "reset",
  hours = 72,
): Promise<string> {
  const token = newToken();
  await sql`
    insert into auth_tokens (membership_id, token_hash, purpose, expires_at)
    values (${membershipId}, ${digest(token)}, ${purpose},
            ${new Date(Date.now() + hours * 3_600_000)})
  `;
  return token;
}

export async function consumeAuthToken(token: string): Promise<string> {
  const [row] = await sql`
    update auth_tokens
       set used_at = now()
     where token_hash = ${digest(token)}
       and used_at is null
       and expires_at > now()
    returning membership_id as "membershipId"
  `;
  if (!row) throw unauthorized("Bağlantı geçersiz veya süresi dolmuş");
  return (row as { membershipId: string }).membershipId;
}
