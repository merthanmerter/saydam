import { describe, expect, test } from "bun:test";
import { computeLateFee, monthsBetween } from "../src/server/lateFee.ts";

const day = (iso: string) => new Date(`${iso}T00:00:00Z`);

describe("tam ay sayımı", () => {
  test("gün dolmadan ay sayılmaz", () => {
    expect(monthsBetween(day("2026-01-10"), day("2026-02-09"))).toBe(0);
    expect(monthsBetween(day("2026-01-10"), day("2026-02-10"))).toBe(1);
    expect(monthsBetween(day("2026-01-10"), day("2026-04-15"))).toBe(3);
  });

  test("vadesi gelmemiş borçta negatif ay olmaz", () => {
    expect(monthsBetween(day("2026-06-10"), day("2026-01-10"))).toBe(0);
  });
});

describe("gecikme tazminatı", () => {
  const dues = [
    { amountCents: 100_000, dueDate: "2026-01-10" },
    { amountCents: 100_000, dueDate: "2026-02-10" },
    { amountCents: 100_000, dueDate: "2026-03-10" },
  ];

  test("borcu olmayan daireye tazminat işlemez", () => {
    const r = computeLateFee(dues, 300_000, 5, day("2026-06-10"));
    expect(r).toMatchObject({ outstandingCents: 0, lateFeeCents: 0 });
  });

  test("ödeme en eski borçtan mahsup edilir", () => {
    // 150.000 ödeme: ocak tamamen, şubatın yarısı kapanır.
    const r = computeLateFee(dues, 150_000, 5, day("2026-04-10"));
    expect(r.outstandingCents).toBe(150_000);
    expect(r.items.map((i) => [i.dueDate, i.remainingCents, i.months])).toEqual([
      ["2026-02-10", 50_000, 2],
      ["2026-03-10", 100_000, 1],
    ]);
    // 50.000×%5×2 + 100.000×%5×1 = 5.000 + 5.000
    expect(r.lateFeeCents).toBe(10_000);
  });

  test("vadesi gelmemiş borç anaparaya girer ama gecikmiş sayılmaz", () => {
    const r = computeLateFee(dues, 0, 5, day("2026-01-10"));
    expect(r.outstandingCents).toBe(300_000);
    expect(r.overdueCents).toBe(100_000); // yalnızca 10 Ocak vadeli olan
    expect(r.lateFeeCents).toBe(0);
  });

  test("oran sıfırsa tazminat işlemez", () => {
    const r = computeLateFee(dues, 0, 0, day("2026-12-10"));
    expect(r.lateFeeCents).toBe(0);
    expect(r.outstandingCents).toBe(300_000);
  });

  test("KMK varsayılanı aylık %5", () => {
    const r = computeLateFee(
      [{ amountCents: 100_000, dueDate: "2026-01-10" }],
      0,
      5,
      day("2026-07-10"),
    );
    expect(r.items[0]!.months).toBe(6);
    expect(r.lateFeeCents).toBe(30_000);
  });
});
