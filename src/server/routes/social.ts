import { z } from "zod";
import type { Auth } from "../auth.ts";
import { type Row, sql } from "../db.ts";
import {
  badRequest,
  body,
  forbidden,
  json,
  notFound,
  paged,
  paging,
  type Router,
} from "../http.ts";
import { belongsToSite, deleteBlob } from "../lib/blob.ts";

const text = (max: number) => z.string().trim().min(1).max(max);

export function socialRoutes(
  auth: Router<Auth>,
  active: Router<Auth>,
  admin: Router<Auth>,
) {
  // ─── Dokümanlar ──────────────────────────────────────────────────────────
  auth.get("/documents", async (ctx) => {
    const pg = paging(ctx.url);
    const rows = await sql`
      select d.id, d.title, d.category, d.file_url as "fileUrl", d.file_name as "fileName",
             d.size_bytes::float8 as "sizeBytes", d.created_at as "createdAt",
             u.full_name as "uploaderName"
        from documents d
        left join memberships m on m.id = d.uploaded_by
        left join users u on u.id = m.user_id
       where d.site_id = ${ctx.auth.siteId}
       order by d.created_at desc
       limit ${pg.limit} offset ${pg.offset}
    `;
    return json(paged(rows, pg, (d: Row) => ({ ...d, sizeBytes: d.sizeBytes })));
  });

  admin.post("/documents", async (ctx) => {
    const input = await body(
      ctx.req,
      z.object({
        title: text(160),
        category: z.enum(["yonetmelik", "toplanti", "sozlesme", "proje", "diger"]),
        fileUrl: z.url(),
        fileName: text(200),
        sizeBytes: z.number().int().nonnegative().default(0),
      }),
    );
    if (!belongsToSite(input.fileUrl, ctx.auth.siteId)) {
      throw badRequest("Dosya bu siteye ait değil");
    }
    const [row] = await sql`
      insert into documents (site_id, title, category, file_url, file_name, size_bytes, uploaded_by)
      values (${ctx.auth.siteId}, ${input.title}, ${input.category}, ${input.fileUrl},
              ${input.fileName}, ${input.sizeBytes}, ${ctx.auth.membershipId})
      returning id
    `;
    return json({ id: row.id }, { status: 201 });
  });

  admin.delete("/documents/:id", async (ctx) => {
    const [row] = await sql`
      delete from documents where id = ${ctx.params.id!} and site_id = ${ctx.auth.siteId}
      returning file_url as "fileUrl"
    `;
    if (!row) throw notFound("Doküman bulunamadı");
    await deleteBlob(row.fileUrl);
    return json({ ok: true });
  });

  /*
   * ─── Pano ──────────────────────────────────────────────────────────────
   *
   * Duyuru da bir gönderidir; farkı yönetim tarafından yazılması ve listenin
   * başına sabitlenebilmesidir. Yazarı siteden çıkarılmış gönderiler de
   * listede kalır, o yüzden birleşimler `left join`.
   */
  auth.get("/posts", async (ctx) => {
    const pg = paging(ctx.url);
    const rows = await sql`
      select p.id, p.kind, p.pinned, p.title, p.body, p.created_at as "createdAt",
             p.membership_id as "authorId", u.full_name as "authorName",
             (select count(*)::int from post_comments c where c.post_id = p.id) as "commentCount"
        from posts p
        left join memberships m on m.id = p.membership_id
        left join users u on u.id = m.user_id
       where p.site_id = ${ctx.auth.siteId}
       order by p.pinned desc, p.created_at desc
       limit ${pg.limit} offset ${pg.offset}
    `;
    return json(paged(rows, pg, (p: Row) => p));
  });

  auth.get("/posts/:id", async (ctx) => {
    const [post] = await sql`
      select p.id, p.kind, p.pinned, p.title, p.body, p.created_at as "createdAt",
             p.membership_id as "authorId", u.full_name as "authorName"
        from posts p
        left join memberships m on m.id = p.membership_id
        left join users u on u.id = m.user_id
       where p.id = ${ctx.params.id!} and p.site_id = ${ctx.auth.siteId}
    `;
    if (!post) throw notFound("Gönderi bulunamadı");
    const comments = await sql`
      select c.id, c.body, c.created_at as "createdAt",
             c.membership_id as "authorId", u.full_name as "authorName"
        from post_comments c
        left join memberships m on m.id = c.membership_id
        left join users u on u.id = m.user_id
       where c.post_id = ${ctx.params.id!}
       order by c.created_at
    `;
    return json({ post, comments });
  });

  active.post("/posts", async (ctx) => {
    const input = await body(
      ctx.req,
      z.object({
        title: text(160),
        body: text(8000),
        /** Duyuru ve sabitleme yalnızca yönetimin elinde. */
        kind: z.enum(["topic", "announcement"]).default("topic"),
        pinned: z.boolean().default(false),
      }),
    );
    const isAdmin = ctx.auth.role === "admin";
    if (!isAdmin && (input.kind === "announcement" || input.pinned)) {
      throw forbidden("Duyuru yayınlamak ve sabitlemek yönetime aittir");
    }
    const [row] = await sql`
      insert into posts (site_id, membership_id, kind, pinned, title, body)
      values (${ctx.auth.siteId}, ${ctx.auth.membershipId}, ${input.kind},
              ${input.pinned}, ${input.title}, ${input.body})
      returning id
    `;
    return json({ id: row.id }, { status: 201 });
  });

  /** Sabitleme yönetimin: listede hangi gönderinin başta duracağını belirler. */
  admin.patch("/posts/:id/pin", async (ctx) => {
    const input = await body(ctx.req, z.object({ pinned: z.boolean() }));
    const [row] = await sql`
      update posts set pinned = ${input.pinned}
       where id = ${ctx.params.id!} and site_id = ${ctx.auth.siteId}
      returning id
    `;
    if (!row) throw notFound("Gönderi bulunamadı");
    return json({ ok: true });
  });

  active.post("/posts/:id/comments", async (ctx) => {
    const input = await body(ctx.req, z.object({ body: text(4000) }));
    const [post] = await sql`
      select 1 from posts where id = ${ctx.params.id!} and site_id = ${ctx.auth.siteId}
    `;
    if (!post) throw notFound("Gönderi bulunamadı");
    const [row] = await sql`
      insert into post_comments (post_id, site_id, membership_id, body)
      values (${ctx.params.id!}, ${ctx.auth.siteId}, ${ctx.auth.membershipId}, ${input.body})
      returning id
    `;
    return json({ id: row.id }, { status: 201 });
  });

  /** Yazar kendi gönderisini, yönetim her gönderiyi silebilir. */
  active.delete("/posts/:id", async (ctx) => {
    const [post] = await sql`
      select membership_id as "authorId" from posts
       where id = ${ctx.params.id!} and site_id = ${ctx.auth.siteId}
    `;
    if (!post) throw notFound("Gönderi bulunamadı");
    if (post.authorId !== ctx.auth.membershipId && ctx.auth.role !== "admin") {
      throw forbidden("Yalnızca kendi gönderinizi silebilirsiniz");
    }
    await sql`delete from posts where id = ${ctx.params.id!}`;
    return json({ ok: true });
  });

  // ─── Mesajlar ────────────────────────────────────────────────────────────
  /** Konuşma listesi: her muhatapla son mesaj ve okunmamış sayısı. */
  auth.get("/messages", async (ctx) => {
    const conversations = await sql`
      with mine as (
        select m.*,
               case when m.sender_id = ${ctx.auth.membershipId}
                    then m.recipient_id else m.sender_id end as peer
          from messages m
         where m.site_id = ${ctx.auth.siteId}
           and (m.sender_id = ${ctx.auth.membershipId}
                or m.recipient_id = ${ctx.auth.membershipId})
      ),
      son as (
        select distinct on (peer) peer, id, body, created_at, sender_id
          from mine order by peer, created_at desc
      ),
      okunmamis as (
        select peer, count(*)::int as n from mine
         where recipient_id = ${ctx.auth.membershipId} and read_at is null
         group by peer
      )
      select son.peer, son.id, son.body,
             son.created_at as "createdAt", son.sender_id as "senderId",
             coalesce(okunmamis.n, 0) as "unreadCount",
             u.full_name as "peerName", m.role as "peerRole"
        from son
        join memberships m on m.id = son.peer
        join users u on u.id = m.user_id
        left join okunmamis on okunmamis.peer = son.peer
       order by son.created_at desc
    `;
    return json({
      conversations,
      peers: await sql`
        select m.id, u.full_name as "fullName", m.role
          from memberships m join users u on u.id = m.user_id
         where m.site_id = ${ctx.auth.siteId} and m.status = 'active'
           and m.id <> ${ctx.auth.membershipId}
         order by m.role, u.full_name
      `,
      unread: conversations.reduce(
        (total: number, row: { unreadCount: number }) => total + row.unreadCount,
        0,
      ),
    });
  });

  /** Yalnızca okur. Okundu işareti ayrı bir uçtur; GET yan etki üretmez. */
  auth.get("/messages/:peer", async (ctx) => {
    // Muhatabın bu siteye ait olduğu doğrulanmazsa, site dışı bir kimlikle
    // yapılan istek boş bir konuşmayla "başarılı" dönerdi.
    const [known] = await sql`
      select 1 from memberships
       where id = ${ctx.params.peer!} and site_id = ${ctx.auth.siteId}
    `;
    if (!known) throw notFound("Muhatap bulunamadı");

    /*
     * Yazışmanın SONU okunur: sayfa 1 en yeni mesajlar, sonraki sayfalar
     * geriye doğru. Sorgu azalan sırada kesilir, ekrana artan sırada verilir.
     */
    const pg = paging(ctx.url, 50);
    const rows = await sql`
      select id, body, sender_id as "senderId", created_at as "createdAt"
        from messages
       where site_id = ${ctx.auth.siteId}
         and ((sender_id = ${ctx.auth.membershipId} and recipient_id = ${ctx.params.peer!})
           or (sender_id = ${ctx.params.peer!} and recipient_id = ${ctx.auth.membershipId}))
       order by created_at desc
       limit ${pg.limit} offset ${pg.offset}
    `;
    const page = paged(rows, pg, (m: Row) => m);
    return json({ ...page, items: page.items.reverse() });
  });

  auth.post("/messages/:peer/read", async (ctx) => {
    await sql`
      update messages set read_at = now()
       where site_id = ${ctx.auth.siteId} and read_at is null
         and sender_id = ${ctx.params.peer!}
         and recipient_id = ${ctx.auth.membershipId}
    `;
    return json({ ok: true });
  });

  active.post("/messages", async (ctx) => {
    const input = await body(
      ctx.req,
      z.object({ recipientId: z.uuid(), body: text(4000) }),
    );
    const [peer] = await sql`
      select 1 from memberships
       where id = ${input.recipientId} and site_id = ${ctx.auth.siteId} and status = 'active'
    `;
    if (!peer) throw notFound("Alıcı bulunamadı");
    const [row] = await sql`
      insert into messages (site_id, sender_id, recipient_id, body)
      values (${ctx.auth.siteId}, ${ctx.auth.membershipId}, ${input.recipientId}, ${input.body})
      returning id
    `;
    return json({ id: row.id }, { status: 201 });
  });
}
