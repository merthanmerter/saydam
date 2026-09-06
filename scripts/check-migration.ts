/**
 * Şema göçünü sıfırdan VE eski veritabanları üzerinde dener.
 *
 * `bun run db:migrate` geliştirme veritabanında hep geçer, çünkü orada bütün
 * sütunlar zaten vardır. Üretimdeki veritabanı ise eski bir şemadan gelir:
 * "sütun ekleyen ifade, o sütuna değinen ifadeden sonra geliyor" türü bir hata
 * ancak eski bir kopya üzerinde ortaya çıkar. Bu betik o kopyaları git
 * geçmişinden üretir.
 *
 * Kullanım:  bun run db:check
 */
import { SQL } from "bun";
import { SCHEMA_SQL } from "../src/server/schema.ts";

const url = process.env.DATABASE_URL ?? process.env.POSTGRES_URL;
if (!url) throw new Error("DATABASE_URL gerekli");

const admin = new SQL({ url, max: 1 });
const dbUrl = (name: string) => url.replace(/\/[^/?]+(\?|$)/, `/${name}$1`);

/** Geçmişteki her şema sürümü bir "eski veritabanı" senaryosudur. */
const revisions = (await Bun.$`git log --format=%h --follow -- src/server/schema.ts`.text())
  .trim()
  .split("\n")
  .slice(1); // en yenisi zaten uygulanacak sürüm

const scenarios: { name: string; seed: string | null }[] = [
  { name: "sıfır veritabanı", seed: null },
  ...(await Promise.all(
    revisions.map(async (rev) => ({
      name: `eski şema ${rev}`,
      seed: extractSchema(await Bun.$`git show ${rev}:src/server/schema.ts`.text()),
    })),
  )),
];

/** Dosyadaki şablon dizeden ham SQL'i çıkarır. */
function extractSchema(source: string): string {
  const match = source.match(/SCHEMA_SQL[^`]*`([\s\S]*)`;/);
  if (!match) throw new Error("Şema dizesi bulunamadı");
  return match[1]!;
}

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
