/**
 * Şema göçünü sıfırdan VE eski veritabanları üzerinde dener.
 *
 * `bun run db:migrate` geliştirme veritabanında hep geçer, çünkü orada bütün
 * sütunlar zaten vardır. Üretimdeki veritabanı ise eski bir şemadan gelir:
 * "sütun ekleyen ifade, o sütuna değinen ifadeden sonra geliyor" türü bir hata
 * ancak eski bir kopya üzerinde ortaya çıkar.
 *
 * Eski sürümler `db/snapshots/` altında birer düz SQL dosyası — git geçmişinde
 * değil, çünkü geçmiş yeniden yazılabiliyor ve bu ağın ona bağlı olmaması
 * gerekir. Senaryolar geçtiğinde şemanın o anki hâli, sondaki görüntüden
 * farklıysa, yeni bir görüntü olarak yazılır: ayrı bir komut olsaydı
 * unutulurdu ve kaçırılan her sürüm, göçün hiç denenmediği bir üretim
 * veritabanı demek olurdu.
 *
 * Kullanım:  bun run db:check
 */
import { Glob, SQL } from "bun";
import { SCHEMA_SQL } from "../src/server/schema.ts";

const DIR = "db/snapshots";
const url = process.env.DATABASE_URL ?? process.env.POSTGRES_URL;
if (!url) throw new Error("DATABASE_URL gerekli");

const admin = new SQL({ url, max: 1 });
const dbUrl = (name: string) => url.replace(/\/[^/?]+(\?|$)/, `/${name}$1`);

const files = [...new Glob("*.sql").scanSync(DIR)].sort();
const scenarios = [
  { name: "sıfır veritabanı", seed: null as string | null },
  ...(await Promise.all(
    files.map(async (file) => ({
      name: `eski şema ${file.replace(/\.sql$/, "")}`,
      seed: await Bun.file(`${DIR}/${file}`).text(),
    })),
  )),
];

let failed = 0;
for (const { name, seed } of scenarios) {
  const db = `saydam_gocdeneme_${Math.random().toString(36).slice(2, 8)}`;
  await admin.unsafe(`create database ${db}`);
  const target = new SQL({ url: dbUrl(db), max: 1 });
  try {
    if (seed) await target.unsafe(seed);
    // İki kez: göç idempotent olmalı.
    await target.unsafe(SCHEMA_SQL);
    await target.unsafe(SCHEMA_SQL);
    console.log(`✓ ${name}`);
  } catch (error) {
    failed++;
    console.log(`✗ ${name}\n   ${(error as Error).message}`);
  } finally {
    await target.close();
    await admin.unsafe(`drop database ${db}`);
  }
}
await admin.close();

if (failed) {
  console.log(`\n${failed} senaryo başarısız`);
  process.exit(1);
}
console.log(`\n${scenarios.length} senaryonun tamamı geçti`);

if (scenarios.at(-1)?.seed !== SCHEMA_SQL) {
  const file = `${DIR}/${String(files.length + 1).padStart(3, "0")}-${new Date().toISOString().slice(0, 10)}.sql`;
  await Bun.write(file, SCHEMA_SQL);
  console.log(`+ yeni anlık görüntü: ${file}`);
}
