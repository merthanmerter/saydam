import { describe, expect, test } from "bun:test";
import { toCents } from "../src/lib/format.ts";
import { addMonths, isValidPeriod, periodLabel, periodOf } from "../src/lib/period.ts";
import {
  distribute,
  installmentPlan,
  payerFor,
  shareBy,
  splitEvenly,
  withSurcharge,
} from "../src/server/money.ts";

describe("dağıtım", () => {
  test("parçaların toplamı her zaman bölünen tutara eşittir", () => {
    for (const total of [1, 7, 100, 10_001, 999_999]) {
      for (const weights of [[1, 1, 1], [95, 110, 78], [1], [50, 50, 50, 50, 33]]) {
        const parts = distribute(total, weights);
        expect(parts.reduce((a, b) => a + b, 0)).toBe(total);
      }
    }
  });

  test("ağırlıksız dağıtımda kimseye eksi düşmez", () => {
    expect(distribute(10, [0, 0])).toEqual([0, 0]);
    expect(distribute(0, [1, 2])).toEqual([0, 0]);
  });

  test("arsa payı büyük daireye daha çok yazar", () => {
    const units = [{ arsaPayi: 60 }, { arsaPayi: 120 }];
    const [small, big] = shareBy(30_000, units, "arsa_payi");
    expect(small! + big!).toBe(30_000);
    expect(big).toBe(20_000);
  });

  test("eşit yöntem arsa payını yok sayar (KMK m.20/a: kapıcı gideri)", () => {
    const units = [{ arsaPayi: 10 }, { arsaPayi: 90 }];
    expect(shareBy(28_000, units, "esit")).toEqual([14_000, 14_000]);
  });

  test("ondalıklı arsa payında da toplam korunur", () => {
    const units = [{ arsaPayi: 3.3333 }, { arsaPayi: 3.3333 }, { arsaPayi: 3.3334 }];
    const parts = shareBy(100_001, units, "arsa_payi");
    expect(parts.reduce((a, b) => a + b, 0)).toBe(100_001);
  });

  test("eşit taksitte kalan kuruş ilk taksitlere gider", () => {
    const parts = splitEvenly(1000, 3);
    expect(parts).toEqual([334, 333, 333]);
    expect(parts.reduce((a, b) => a + b, 0)).toBe(1000);
  });
});

describe("işletme payı ve taksit planı", () => {
  test("yüzde eklenir", () => {
    expect(withSurcharge(100_000, 10)).toBe(110_000);
    expect(withSurcharge(100_000, 0)).toBe(100_000);
  });

  test("12 aya bölünen masrafın planı toplamı korur", () => {
    const plan = installmentPlan(1_200_000, 202603, 12, 15);
    expect(plan).toHaveLength(12);
    expect(plan.reduce((sum, p) => sum + p.amountCents, 0)).toBe(1_380_000);
    expect(plan[0]!.period).toBe(202603);
    expect(plan[11]!.period).toBe(202702);
  });
});

describe("dönem", () => {
  test("ay taşması yıla yansır", () => {
    expect(addMonths(202612, 1)).toBe(202701);
    expect(addMonths(202601, -1)).toBe(202512);
    expect(addMonths(202606, 12)).toBe(202706);
  });

  test("geçerlilik kontrolü", () => {
    expect(isValidPeriod(202613)).toBe(false);
    expect(isValidPeriod(202600)).toBe(false);
    expect(isValidPeriod(202612)).toBe(true);
  });

  test("etiket ve tarihten üretim", () => {
    expect(periodOf(new Date("2026-03-15T00:00:00"))).toBe(202603);
    expect(periodLabel(202603)).toBe("Mart 2026");
  });
});

describe("tutar ayrıştırma", () => {
  test("Türkçe ve nokta biçimini kabul eder", () => {
    expect(toCents("1.234,56")).toBe(123_456);
    expect(toCents("1234.56")).toBe(123_456);
    expect(toCents("1234")).toBe(123_400);
    expect(toCents(" 1.234,56 ₺ ")).toBe(123_456);
  });

  test("geçersiz girdide NaN döner", () => {
    expect(toCents("abc")).toBeNaN();
    expect(toCents("")).toBeNaN();
  });
});

describe("yükümlü ayrımı", () => {
  test("kiracıya yazılan kalem, daire kirada değilse malike düşer", () => {
    expect(payerFor("kiraci", false)).toBe("malik");
    expect(payerFor("kiraci", true)).toBe("kiraci");
  });

  test("malike yazılan kalem kiracıya hiçbir durumda geçmez", () => {
    expect(payerFor("malik", true)).toBe("malik");
    expect(payerFor("malik", false)).toBe("malik");
  });
});
