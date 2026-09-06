import { SQL } from "bun";
import { env } from "./env.ts";

/**
 * Tek bir havuz. Vercel'de Fluid Compute sayesinde process yeniden kullanıldığı
 * için havuz küçük tutulur; Neon'un pooler ("-pooler" hostname) endpoint'i önerilir.
 */
export const sql = new SQL({
  url: env.databaseUrl,
  max: Number(process.env.DB_POOL_MAX ?? (env.isProduction ? 4 : 10)),
  idleTimeout: 20,
  connectionTimeout: 15,
});

/** Sorgu sonucu satırı. Bun SQL dinamik döner; sınır burada çizilir. */
export type Row = Record<string, any>;

/*
 * Sayısal sütunlar hakkında.
 *
 * Sürücü `int8` ve `numeric` değerlerini — büyüklüklerine bakmaksızın —
 * string döndürür. Bu yüzden para, oran ve sayaç döndüren her sütun
 * sorgunun kendisinde `::float8` ile dökülür; JavaScript tarafında ayrıca
 * dönüştürme yapılmaz.
 *
 * `float8` burada kesinlik kaybı değildir: değer zaten JS `number`'a, yani
 * aynı IEEE-754 çift duyarlıklı sayıya çevrilecekti. Tam sayılar 2^53'e
 * (≈ 90 trilyon TL) kadar birebir temsil edilir; tek bir tutar için üst
 * sınırımız 1 milyar TL.
 *
 * Dönüşüm neden sorguda: JavaScript'te yapıldığında her *kullanım* yerinde
 * hatırlanması gerekiyordu ve unutulduğunda hata sessizdi — "12" + "34"
 * aritmetikte "1234" verir. Sorguda yapılınca değer kaynağında doğru olur.
 * `tests/api-numeric.test.ts` bütün uçları gezip bunu doğruluyor.
 */
