import { describe, expect, test } from "bun:test";
import { createHmac } from "node:crypto";
import { toMerchantOid, verifyCallback } from "../src/server/lib/payment/paytr.ts";

const account = {
  sandbox: true,
  credentials: {
    merchantId: "123456",
    merchantKey: "MERCHANTKEY123",
    merchantSalt: "MERCHANTSALT456",
  },
};

/** Dokümandaki referans uygulama (PHP/Python örnekleriyle birebir aynı). */
const referenceHash = (merchantOid: string, status: string, total: string) =>
  createHmac("sha256", account.credentials.merchantKey)
    .update(merchantOid + account.credentials.merchantSalt + status + total)
    .digest("base64");

describe("PayTR bildirimi", () => {
  test("geçerli imza kabul edilir ve tutar okunur", () => {
    const form = {
      merchant_oid: "aidat123abc",
      status: "success",
      total_amount: "52165",
      hash: referenceHash("aidat123abc", "success", "52165"),
    };
    expect(verifyCallback(account, form)).toEqual({
      providerRef: "aidat123abc",
      paid: true,
      amountCents: 52165,
      error: undefined,
    });
  });

  test("başarısız ödeme sebebiyle birlikte döner", () => {
    const form = {
      merchant_oid: "aidat123abc",
      status: "failed",
      total_amount: "52165",
      failed_reason_msg: "Yetersiz bakiye",
      hash: referenceHash("aidat123abc", "failed", "52165"),
    };
    expect(verifyCallback(account, form)).toMatchObject({
      paid: false,
      error: "Yetersiz bakiye",
    });
  });

  /** İmza doğrulaması olmadan tutar veya durum değiştirilebilirdi. */
  test("kurcalanmış tutar reddedilir", () => {
    const form = {
      merchant_oid: "aidat123abc",
      status: "success",
      total_amount: "1",
      hash: referenceHash("aidat123abc", "success", "52165"),
    };
    expect(() => verifyCallback(account, form)).toThrow(/imza/);
  });

  test("başka mağazanın anahtarıyla üretilen imza reddedilir", () => {
    const form = {
      merchant_oid: "aidat123abc",
      status: "success",
      total_amount: "52165",
      hash: createHmac("sha256", "BASKAKEY").update("x").digest("base64"),
    };
    expect(() => verifyCallback(account, form)).toThrow(/imza/);
  });
});

describe("sipariş numarası", () => {
  test("yalnızca harf ve rakam bırakır", () => {
    expect(toMerchantOid("aidat", "0a1b2c3d-4e5f-6789-abcd-ef0123456789")).toBe(
      "aidat0a1b2c3d4e5f6789abcdef0123456789",
    );
  });

  test("PayTR sınırını aşmaz", () => {
    expect(toMerchantOid("abonelik", "x".repeat(200)).length).toBeLessThanOrEqual(64);
  });
});
