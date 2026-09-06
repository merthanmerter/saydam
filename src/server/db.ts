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

/**
 * Postgres bigint/numeric sürücüden string gelebilir; tek yerden normalize
 * edilir. Kuruş da adet de aynı dönüşümden geçer.
 */
export const toCents = (value: unknown): number => {
  if (value == null) return 0;
  return typeof value === "number" ? value : Number(value);
};
