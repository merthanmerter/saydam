import { describe, expect, test } from "bun:test";
import { computeLateFee } from "../src/server/lateFee.ts";
import { cardFee, restructurePlan } from "../src/server/money.ts";

describe("borç yapılandırma planı", () => {
  test("vade farkı yoksa anapara eşit taksitlere bölünür", () => {
    const plan = restructurePlan(120_000, 0, 6, "2026-10-10");
    expect(plan.interestCents).toBe(0);
    expect(plan.totalCents).toBe(120_000);
    expect(plan.rows).toHaveLength(6);
    expect(plan.rows.every((r) => r.amountCents === 20_000)).toBe(true);
  });

  test("vade farkı toplama eklenir, taksitler toplamı toplamı verir", () => {
    const plan = restructurePlan(100_000, 12, 4, "2026-01-15");
    expect(plan.interestCents).toBe(12_000);
    expect(plan.totalCents).toBe(112_000);
    expect(plan.rows.reduce((a, r) => a + r.amountCents, 0)).toBe(112_000);
  });

  test("bölünmeyen kuruş kaybolmaz", () => {
    const plan = restructurePlan(100_001, 7.5, 7, "2026-03-01");
    expect(plan.rows.reduce((a, r) => a + r.amountCents, 0)).toBe(plan.totalCents);
  });

  test("taksitler birer ay arayla, seçilen güne düşer", () => {
    const plan = restructurePlan(30_000, 0, 3, "2026-01-10");
    expect(plan.rows.map((r) => r.dueDate)).toEqual([
      "2026-01-10",
      "2026-02-10",
      "2026-03-10",
    ]);
  });

  test("kısa ayda vade ayın son gününe taşar, sonraki aya sarkmaz", () => {
    const plan = restructurePlan(30_000, 0, 3, "2026-01-31");
    expect(plan.rows.map((r) => r.dueDate)).toEqual([
      "2026-01-31",
      "2026-02-28",
      "2026-03-31",
    ]);
  });
});

describe("kart komisyon farkı", () => {
  test("oran sıfırsa fark yoktur", () => {
    expect(cardFee(100_000, 0)).toBe(0);
  });

  test("fark borcun üstüne eklenir, borcu değiştirmez", () => {
    const debt = 100_000;
    const fee = cardFee(debt, 2.5);
    expect(fee).toBe(2_500);
    // Karttan çekilen tutar borç + fark; borca işlenen tutar yalnızca borç.
    expect(debt + fee).toBe(102_500);
  });

  test("kuruş yuvarlaması yapılır", () => {
    expect(cardFee(3_333, 1.5)).toBe(50);
  });
});

/**
 * Yapılandırma, borcun aylara dağılımını değiştirir: bu ay yalnızca vadesi
 * gelmiş taksitler istenir, kalanı sonraki aylara düşer.
 */
describe("bu ay ödenecek tutar", () => {
  const ay = (offset: number) => {
    const d = new Date();
    d.setUTCMonth(d.getUTCMonth() + offset);
    return d.toISOString().slice(0, 10);
  };

  test("vadesi gelecek aylara düşen taksit bu ay istenmez", () => {
    const rows = [
      { amountCents: 10_000, dueDate: ay(0) },
      { amountCents: 10_000, dueDate: ay(1) },
      { amountCents: 10_000, dueDate: ay(2) },
    ];
    const result = computeLateFee(rows, 0, 5);
    expect(result.outstandingCents).toBe(30_000);
    expect(result.notYetDueCents).toBe(20_000);
  });

  test("geciken taksitler bu ayınkiyle birlikte istenir", () => {
    const rows = [
      { amountCents: 10_000, dueDate: ay(-2) },
      { amountCents: 10_000, dueDate: ay(-1) },
      { amountCents: 10_000, dueDate: ay(0) },
      { amountCents: 10_000, dueDate: ay(1) },
    ];
    const result = computeLateFee(rows, 0, 5);
    expect(result.notYetDueCents).toBe(10_000);
    // Vadesi geçen iki taksite tazminat işler, bu ayınkine henüz işlemez.
    expect(result.overdueCents).toBe(30_000);
    expect(result.lateFeeCents).toBeGreaterThan(0);
  });

  test("ödeme en eski taksitten başlayarak mahsup edilir", () => {
    const rows = [
      { amountCents: 10_000, dueDate: ay(-1) },
      { amountCents: 10_000, dueDate: ay(0) },
      { amountCents: 10_000, dueDate: ay(1) },
    ];
    const result = computeLateFee(rows, 15_000, 5);
    expect(result.outstandingCents).toBe(15_000);
    // Geriye kalan 15.000'in 10.000'i gelecek aya ait.
    expect(result.notYetDueCents).toBe(10_000);
    // Bu ayın taksitinden kalan 5.000'in vadesi bugün: gelmiş sayılır ama
    // üzerinden tam ay geçmediği için tazminat işlemez.
    expect(result.overdueCents).toBe(5_000);
    expect(result.lateFeeCents).toBe(0);
  });
});
