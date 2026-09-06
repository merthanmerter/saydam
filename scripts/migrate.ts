/** Şemayı uygular. Idempotent: her deploy öncesi güvenle çalıştırılabilir. */
import { sql } from "../src/server/db.ts";
import { SCHEMA_SQL } from "../src/server/schema.ts";

await sql.unsafe(SCHEMA_SQL);
console.log("✓ Şema güncel");
await sql.close();
