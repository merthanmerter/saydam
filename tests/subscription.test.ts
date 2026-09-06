import { beforeAll, describe, expect, test } from "bun:test";
import { GRACE_DAYS, subscriptionState } from "../src/server/subscription.ts";

beforeAll(() => {
  process.env.SAAS_MODE = "true";
});

const day = (offset: number) =>
  new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);

const state = (status: string | null, endOffset: number | null) =>
  subscriptionState(
    status === null
      ? null
      : {
          status: status as never,
          currentPeriodEnd: endOffset === null ? null : day(endOffset),
        },
  );

describe("abonelik kilidi", () => {
  test("kaydı olmayan site kilitlidir", () => {
    expect(state(null, null)).toMatchObject({ status: "none", locked: true });
  });

  test("süren deneme erişim verir", () => {
    expect(state("trialing", 5)).toMatchObject({
      status: "trialing",
      daysLeft: 5,
      locked: false,
    });
  });

  test("biten deneme tolerans almaz, doğrudan kilitlenir", () => {
    expect(state("trialing", -1)).toMatchObject({ status: "expired", locked: true });
  });

  test("aktif abonelik erişim verir", () => {
    expect(state("active", 20)).toMatchObject({ status: "active", locked: false });
  });

  test("aktif abonelik tolerans süresince açık kalır", () => {
    expect(state("active", -GRACE_DAYS)).toMatchObject({ status: "grace", locked: false });
  });

  test("tolerans bitince kilitlenir", () => {
    expect(state("active", -GRACE_DAYS - 1)).toMatchObject({
      status: "expired",
      locked: true,
    });
  });

  /** Ödeme başlatıp yarıda bırakmak erişim üretmemeli. */
  test("past_due, ileri tarihli dönem sonuna rağmen kilitlidir", () => {
    expect(state("past_due", 30)).toMatchObject({ status: "none", locked: true });
  });

  test("iptal edilmiş abonelik kilitlidir", () => {
    expect(state("canceled", 30)).toMatchObject({ status: "none", locked: true });
  });

  test("self-host kurulumda abonelik hiç aranmaz", () => {
    process.env.SAAS_MODE = "false";
    expect(state(null, null)).toMatchObject({ required: false, locked: false });
    process.env.SAAS_MODE = "true";
  });
});

/**
 * Platform ücretinin site giderlerine yansıtılması iki koşula bağlı: abonelik
 * ücretli olmalı ve yönetim bunu açıkça seçmiş olmalı. Bu kural bir kez
 * bozulduğunda deneme sürümündeki bir siteye 1.900 TL gider yazılmıştı.
 */
describe("abonelik gideri koşulları", () => {
  const billable = (status: string, billToSite: boolean) =>
    billToSite && status === "active";

  test("deneme sürümünde gider yazılmaz", () => {
    expect(billable("trialing", true)).toBe(false);
  });

  test("yönetim seçmediyse gider yazılmaz", () => {
    expect(billable("active", false)).toBe(false);
  });

  test("ücretli abonelik ve açık tercih birlikteyse yazılır", () => {
    expect(billable("active", true)).toBe(true);
  });

  test("ödemesi geciken abonelik gider üretmez", () => {
    expect(billable("past_due", true)).toBe(false);
    expect(billable("canceled", true)).toBe(false);
  });
});
