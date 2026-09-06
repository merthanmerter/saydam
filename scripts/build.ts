/** Ön yüzü `dist/` klasörüne derler (Vercel bu klasörü statik olarak sunar). */
import { rm } from "node:fs/promises";
import tailwind from "bun-plugin-tailwind";

await rm("dist", { recursive: true, force: true });

const result = await Bun.build({
  entrypoints: ["src/index.html"],
  outdir: "dist",
  target: "browser",
  // Mutlak yol şart: `/panel/pano` gibi derin bir bağlantı yenilendiğinde
  // tarayıcı varlıkları o yola göre çözer ve SPA yönlendirmesi onlara da
  // index.html döndürür. Göreli yollarla sayfa boş açılır.
  publicPath: "/",
  minify: true,
  sourcemap: "linked",
  splitting: true,
  naming: { chunk: "[name]-[hash].[ext]", asset: "[name]-[hash].[ext]" },
  define: { "process.env.NODE_ENV": '"production"' },
  plugins: [tailwind],
});

if (!result.success) {
  for (const log of result.logs) console.error(log);
  process.exit(1);
}
// Regresyon koruması: göreli varlık yolu üretim dağıtımını sessizce bozar.
const html = await Bun.file("dist/index.html").text();
const relative = html.match(/(?:src|href)="\.\/[^"]+"/g);
if (relative) {
  console.error("Göreli varlık yolu bulundu, publicPath ayarını kontrol edin:", relative);
  process.exit(1);
}

console.log(`✓ ${result.outputs.length} dosya derlendi → dist/`);
