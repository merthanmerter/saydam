/**
 * Tanıtım sayfasındaki ekran görüntülerini demo veriden üretir.
 *
 *   bun run db:seed && bun run shots
 *
 * Yerel sunucuyu kendisi başlatır, yönetici ve sakin oturumlarıyla gezinip
 * `src/assets/shots/` altına webp yazar. Playwright ve sharp yalnızca bu
 * betik için gereklidir; arayüz değiştikçe yeniden çalıştırın.
 */
import { chromium, type Page } from "playwright";
import sharp from "sharp";

const BASE = process.env.SHOTS_BASE_URL ?? "http://localhost:3000";
const OUT = "src/assets/shots";
const WIDTH = 1440;
/** Sayfa başına yükseklik: altta boş alan kalmasın. */
const HEIGHT = 900;

const shots = [
  {
    file: "kasa",
    height: 964,
    as: "yonetim@saydam.test",
    path: "/panel",
    wait: "text=Kasa bakiyesi",
  },
  {
    file: "aidatlar",
    height: 668,
    as: "yonetim@saydam.test",
    path: "/panel/aidatlar",
    wait: "text=Dönem kalemleri",
  },
  {
    file: "giderler",
    height: 900,
    as: "yonetim@saydam.test",
    path: "/panel/giderler",
    wait: "text=Çatı yalıtım yenileme",
  },
  {
    file: "odemeler",
    height: 900,
    as: "yonetim@saydam.test",
    path: "/panel/odemeler",
    wait: "text=Onay bekliyor",
  },
  {
    file: "bakiyeler",
    height: 636,
    as: "yonetim@saydam.test",
    path: "/panel/raporlar",
    wait: "text=Daire bakiyeleri",
  },
  {
    file: "yil-sonu",
    height: 652,
    as: "yonetim@saydam.test",
    path: "/panel/raporlar",
    wait: "text=Daire bakiyeleri",
    tab: "Yıl sonu mahsuplaşma",
  },
  {
    file: "sakin",
    height: 1016,
    as: "deniz@saydam.test",
    path: "/panel",
    wait: "text=Dairelerim",
  },
] as const;

async function login(page: Page, email: string) {
  const { sites } = (await (await fetch(`${BASE}/api/sites`)).json()) as {
    sites: { id: string; name: string }[];
  };
  const site = sites.find((s) => s.name === "Papatya Sitesi");
  if (!site) throw new Error("Demo site yok — önce `bun run db:seed` çalıştırın");

  const response = await page.request.post(`${BASE}/api/auth/login`, {
    data: { siteId: site.id, email, password: "saydam1234" },
  });
  if (!response.ok()) throw new Error(`Giriş başarısız: ${email}`);
}

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: WIDTH, height: HEIGHT },
  deviceScaleFactor: 2,
  locale: "tr-TR",
  timezoneId: "Europe/Istanbul",
  colorScheme: "light",
});
const page = await context.newPage();

let current = "";
for (const shot of shots) {
  if (shot.as !== current) {
    await context.clearCookies();
    await login(page, shot.as);
    current = shot.as;
  }

  await page.setViewportSize({ width: WIDTH, height: shot.height ?? HEIGHT });
  await page.goto(BASE + shot.path, { waitUntil: "networkidle" });
  await page.waitForSelector(shot.wait, { timeout: 15_000 });
  if ("tab" in shot && shot.tab) {
    await page.getByRole("tab", { name: shot.tab }).click();
    await page.waitForTimeout(800);
  }
  // Yazı tipleri otursun.
  await page.evaluate(() => document.fonts.ready);
  // Grafik varsa giriş animasyonunun bitmesini bekle: yarım çizilmiş bir
  // grafik ekran görüntüsünde hata gibi görünür.
  if (await page.locator("svg.recharts-surface").count()) {
    await page.waitForTimeout(1600);
  }
  await page.waitForTimeout(400);

  const png = await page.screenshot({ type: "png" });
  await sharp(png)
    .resize({ width: WIDTH })
    .webp({ quality: 82 })
    .toFile(`${OUT}/${shot.file}.webp`);
  console.log(`✓ ${shot.file}.webp`);
}

await browser.close();
