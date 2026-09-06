/**
 * Şu anki şemayı `db/snapshots/` altına dondurur.
 *
 * Şema değişikliğini dağıttıktan sonra çalıştırın: dosya, üretimin artık
 * hangi hâlde olduğunu kaydeder. `bun run db:check` sonraki göçleri bu
 * kopyaların hepsine karşı dener — bir sonraki değişiklik, bugünkü üretim
 * veritabanı üzerinde de sınanmış olur.
 *
 * Fazladan anlık görüntü zararsız, eksik olan tehlikelidir: kaçırılan sürüm,
 * göçün hiç denenmediği bir üretim veritabanı demektir.
 *
 * Kullanım:  bun run db:snapshot
 */
import { Glob } from "bun";
import { SCHEMA_SQL } from "../src/server/schema.ts";

const DIR = "db/snapshots";
const existing = [...new Glob("*.sql").scanSync(DIR)].sort();
const last = existing.at(-1);

if (last && (await Bun.file(`${DIR}/${last}`).text()).includes(SCHEMA_SQL.trim())) {
  console.log(`Şema son anlık görüntüden farksız (${last}) — yenisi yazılmadı.`);
  process.exit(0);
}

const next = String(existing.length + 1).padStart(3, "0");
const date = new Date().toISOString().slice(0, 10);
const file = `${DIR}/${next}-${date}.sql`;
await Bun.write(
  file,
  `-- ${date} tarihindeki şema (üretimde bu hâlde olan veritabanları için)\n${SCHEMA_SQL}`,
);
console.log(`✓ ${file}`);
