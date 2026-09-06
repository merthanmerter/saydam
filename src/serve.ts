/**
 * Yerel geliştirme ve self-host sunucusu: React uygulaması + API tek süreçte.
 *   bun dev    → HMR açık, uygulama anında derlenir
 *   bun start  → üretim modu, dist/ klasöründen sunulur
 */
import index from "./index.html";
import { handleApi } from "./server/app.ts";
import { withSecurityHeaders } from "./server/securityHeaders.ts";

const development = process.env.NODE_ENV !== "production";
const dist = new URL("../dist/", import.meta.url).pathname;
const built = await Bun.file(`${dist}index.html`).exists();

if (!development && !built) {
  console.error("dist/ bulunamadı — önce `bun run build` çalıştırın.");
  process.exit(1);
}

/**
 * Üretimde dosyalar dist/ içinden sunulur. Bilinmeyen yollar index.html'e
 * düşer (SPA); ancak varlık uzantılı istekler 404 döner, aksi hâlde eksik bir
 * betik dosyası HTML olarak dönüp tarayıcıda MIME hatasına yol açardı.
 */
async function serveStatic(req: Request): Promise<Response> {
  const { pathname } = new URL(req.url);
  const file = Bun.file(`${dist}${pathname.slice(1)}`);
  if (pathname !== "/" && (await file.exists())) {
    return withSecurityHeaders(
      new Response(file, {
        headers: {
          "Cache-Control": /-[a-z0-9]{8}\.\w+$/.test(pathname)
            ? "public, max-age=31536000, immutable"
            : "no-cache",
        },
      }),
    );
  }
  if (/\.\w{2,5}$/.test(pathname)) return new Response("Bulunamadı", { status: 404 });
  return withSecurityHeaders(
    new Response(Bun.file(`${dist}index.html`), {
      headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-cache" },
    }),
  );
}

const server = Bun.serve({
  port: Number(process.env.PORT ?? 3000),
  routes: {
    "/api/*": handleApi,
    // Geliştirmede HMR için paketleyicinin kendi HTML yolu gerekli; üretimde
    // başlıkları ekleyebilmek adına dosyaları kendimiz sunuyoruz.
    "/*": development ? index : serveStatic,
  },
  development: development && { hmr: true, console: true },
});

console.log(`▸ say-dam ${development ? "geliştirme" : "üretim"} sunucusu: ${server.url}`);
