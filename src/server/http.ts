import type { ZodType } from "zod";

export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
  }
}

export const badRequest = (m: string, d?: unknown) => new HttpError(400, m, d);
export const unauthorized = (m = "Oturum gerekli") => new HttpError(401, m);
export const forbidden = (m = "Bu işlem için yetkiniz yok") => new HttpError(403, m);
export const notFound = (m = "Kayıt bulunamadı") => new HttpError(404, m);
export const conflict = (m: string) => new HttpError(409, m);

export const json = (data: unknown, init?: ResponseInit) => Response.json(data, init);

export type Ctx<A = unknown> = {
  req: Request;
  url: URL;
  /** `/api` ön eki ayıklanmış yol — korumaların yol bazlı karar vermesi için. */
  path: string;
  params: Record<string, string>;
  /** Rota tanımında `auth`/`admin` istendiyse dolu gelir. */
  auth: A;
  /** İşlem sonrası yanıta eklenecek çerezler. */
  cookies: string[];
};

type Handler<A> = (ctx: Ctx<A>) => Response | Promise<Response>;
type Guard<A> = (ctx: Ctx<unknown>) => Promise<A>;

type Route<A> = {
  method: string;
  segments: string[];
  guard?: Guard<A>;
  handler: Handler<A>;
};

/** Dizi tabanlı minik yönlendirici: `/units/:id/payments` gibi kalıpları destekler. */
export class Router<G = unknown> {
  private routes: Route<never>[] = [];

  constructor(private guard?: Guard<G>) {}

  /**
   * Aynı rota tablosunu paylaşan, fakat her rotasına `guard` uygulanan bir
   * görünüm döndürür. `const admin = router.guarded(requireAdmin)` şeklinde
   * kullanılır; kayıtlar tek tabloda toplanır.
   */
  guarded<A>(guard: Guard<A>): Router<A> {
    const child = new Router<A>(guard);
    child.routes = this.routes;
    return child;
  }

  private add(method: string, path: string, handler: Handler<G>) {
    this.routes.push({
      method,
      segments: path.split("/").filter(Boolean),
      guard: this.guard,
      handler,
    } as unknown as Route<never>);
    return this;
  }

  get = (p: string, h: Handler<G>) => this.add("GET", p, h);
  post = (p: string, h: Handler<G>) => this.add("POST", p, h);
  patch = (p: string, h: Handler<G>) => this.add("PATCH", p, h);
  put = (p: string, h: Handler<G>) => this.add("PUT", p, h);
  delete = (p: string, h: Handler<G>) => this.add("DELETE", p, h);

  async handle(req: Request, pathname: string): Promise<Response> {
    const parts = pathname.split("/").filter(Boolean);
    let pathMatched = false;

    for (const route of this.routes) {
      const params = match(route.segments, parts);
      if (!params) continue;
      pathMatched = true;
      if (route.method !== req.method) continue;

      const ctx: Ctx<unknown> = {
        req,
        url: new URL(req.url),
        path: pathname,
        params,
        auth: undefined,
        cookies: [],
      };
      ctx.auth = route.guard ? await route.guard(ctx) : undefined;
      const response = await (route.handler as Handler<unknown>)(ctx);
      for (const cookie of ctx.cookies) {
        response.headers.append("set-cookie", cookie);
      }
      return response;
    }

    throw new HttpError(pathMatched ? 405 : 404, "Bulunamadı");
  }
}

function match(segments: string[], parts: string[]): Record<string, string> | null {
  if (segments.length !== parts.length) return null;
  const params: Record<string, string> = {};
  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i]!;
    const part = parts[i]!;
    if (segment.startsWith(":")) params[segment.slice(1)] = decodeURIComponent(part);
    else if (segment !== part) return null;
  }
  return params;
}

/** Gövdeyi zod şemasıyla doğrular; hata mesajları Türkçe ve alan bazlı döner. */
export async function body<T>(req: Request, schema: ZodType<T>): Promise<T> {
  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    throw badRequest("Geçersiz JSON gövdesi");
  }
  const result = schema.safeParse(payload);
  if (!result.success) {
    throw badRequest(
      "Girdiler geçersiz",
      result.error.issues.map((i) => ({
        field: i.path.join("."),
        message: i.message,
      })),
    );
  }
  return result.data;
}

export function errorResponse(error: unknown): Response {
  if (error instanceof HttpError) {
    return Response.json(
      { error: error.message, details: error.details },
      { status: error.status },
    );
  }
  console.error("Beklenmeyen hata:", error);
  return Response.json({ error: "Sunucu hatası" }, { status: 500 });
}

/**
 * Sayfalama.
 *
 * Listeler sunucuda kesilir: bin satırlık bir tabloyu tarayıcıya gönderip
 * orada dilimlemek hem ağı hem belleği boşuna yorar. Sayfa boyutunun üst
 * sınırı sunucuda; istemcinin `size=100000` göndererek tüm tabloyu çekmesi
 * engellenir.
 *
 * Toplam satır sayısı DÖNMEZ. `count(*) over()` ile tam sayı almak, her sayfa
 * isteğinde o siteye ait bütün satırların taranması demek; 200 bin ödemelik
 * bir tabloda ölçüldüğünde sayfa sorgusu 0,03 ms yerine 51 ms sürüyordu.
 * Onun yerine bir fazlası çekilir: gelen satır sayısı sayfa boyutunu aşıyorsa
 * devamı var demektir. Sıralama indeksinden geldiği için sorgu ilk 26 satırda
 * durur.
 */
export type Page = { page: number; size: number; limit: number; offset: number };

export function paging(url: URL, defaultSize = 25): Page {
  const page = Math.max(1, Number(url.searchParams.get("page")) || 1);
  const size = Math.min(
    500,
    Math.max(1, Number(url.searchParams.get("size")) || defaultSize),
  );
  // Bir fazlası: "devamı var mı" sorusunun cevabı.
  return { page, size, limit: size + 1, offset: (page - 1) * size };
}

export function paged<T>(rows: unknown[], p: Page, map: (row: never, index: number) => T) {
  const hasMore = rows.length > p.size;
  return {
    items: rows.slice(0, p.size).map(map as (row: unknown, index: number) => T),
    page: p.page,
    size: p.size,
    hasMore,
  };
}
