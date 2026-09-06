import { describe, expect, test } from "bun:test";

/**
 * Sayısal alanlar API'den gerçekten sayı olarak mı dönüyor?
 *
 * Postgres sürücüsü `int8` ve `numeric` değerlerini string döndürür. Sorgularda
 * `::float8` dökümü atlanırsa JSON'a string sızar; hata sessizdir, çünkü
 * JavaScript "12" * 2 işlemini yapar ama "12" + 2 için "122" üretir. Bu test
 * uçları gezip adı sayısal olan her alanı denetler.
 *
 * Çalışan bir sunucu ve tohumlanmış demo verisi ister; yoksa atlanır.
 */
const BASE = process.env.API_BASE ?? "http://localhost:3000/api";

/** Adı bu kalıba uyan alanlar sayı olmalı. `no` daire numarasıdır, metindir. */
const NUMERIC =
  /(Cents|Count|Pct|Bytes|arsaPayi|daysLeft|installments|period|page|size|unread)/;

const stringNumbers = (value: unknown, path: string, found: string[] = []) => {
  if (Array.isArray(value)) {
    for (const [i, item] of value.entries()) stringNumbers(item, `${path}[${i}]`, found);
    return found;
  }
  if (value === null || typeof value !== "object") return found;
  for (const [key, item] of Object.entries(value)) {
    if (NUMERIC.test(key) && typeof item === "string" && /^-?\d+(\.\d+)?$/.test(item)) {
      found.push(`${path}.${key} = "${item}"`);
    }
    stringNumbers(item, `${path}.${key}`, found);
  }
  return found;
};

const reachable = await fetch(`${BASE}/health`)
  .then((r) => r.ok)
  .catch(() => false);

describe.skipIf(!reachable)("API sayısal alanları", () => {
  test("hiçbir sayısal alan string dönmüyor", async () => {
    const { sites } = (await (await fetch(`${BASE}/sites?q=Papatya`)).json()) as {
      sites: { id: string }[];
    };
    const login = await fetch(`${BASE}/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        siteId: sites[0]!.id,
        email: "yonetim@saydam.test",
        password: "saydam1234",
      }),
    });
    const cookie = (login.headers.getSetCookie?.() ?? [])
      .map((c) => c.split(";")[0])
      .join("; ");

    const paths = [
      "/auth/me",
      "/site",
      "/reports/treasury",
      "/reports/monthly",
      "/reports/balances?page=1&size=25",
      "/units?page=1&size=25",
      "/payments?page=1&size=25",
      "/expenses?year=2026&page=1&size=25",
      "/recurring",
      "/documents?page=1&size=25",
      "/restructurings",
    ];

    const problems: string[] = [];
    for (const path of paths) {
      const response = await fetch(BASE + path, { headers: { cookie } });
      if (!response.ok) continue;
      problems.push(...stringNumbers(await response.json(), path));
    }
    expect(problems).toEqual([]);
  });
});
