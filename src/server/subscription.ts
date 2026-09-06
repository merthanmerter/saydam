import type { SubscriptionState } from "../lib/types.ts";
import { env, PLAN_PRICES } from "./env.ts";

/** Yeni sitelere tanınan ücretsiz deneme süresi: 1 ay. */
const TRIAL_DAYS = 30;
/** Dönem bittikten sonra kilit devreye girmeden önceki tolerans. */
export const GRACE_DAYS = 7;

type SubscriptionRow = {
  status: "trialing" | "active" | "past_due" | "canceled" | null;
  currentPeriodEnd: string | Date | null;
};

export type { SubscriptionState } from "../lib/types.ts";

const startOfDay = (date: Date) =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();

/**
 * Aboneliğin o anki durumu. Kilit yalnızca **site yönetiminin yazma
 * işlemlerini** kapatır: sakinler kayıtlarını görmeye ve ödeme yapmaya devam
 * eder. Ödemeyen taraf yönetim olduğu için baskı da orada olmalı; sakinlerin
 * geçmiş aidat ve gider kayıtları hiçbir koşulda rehin tutulmaz.
 */
export function subscriptionState(row: SubscriptionRow | null): SubscriptionState {
  if (!env.saasMode) {
    return {
      required: false,
      status: "active",
      validUntil: null,
      daysLeft: 0,
      locked: false,
    };
  }
  // Yalnızca deneme ve ödenmiş abonelik erişim sağlar. `past_due` (ödeme
  // başlatıldı ama tamamlanmadı) ve `canceled` hiçbir geçerlilik doğurmaz;
  // aksi hâlde abonelik kaydı oluşturmak tek başına erişim üretirdi.
  const grants = row?.status === "trialing" || row?.status === "active";
  if (!grants || !row?.currentPeriodEnd) {
    return {
      required: true,
      status: "none",
      validUntil: null,
      daysLeft: 0,
      locked: true,
    };
  }

  const end = new Date(row.currentPeriodEnd);
  const validUntil = end.toISOString().slice(0, 10);
  const daysLeft = Math.round((startOfDay(end) - startOfDay(new Date())) / 86_400_000);

  if (daysLeft >= 0) {
    return {
      required: true,
      status: row.status === "trialing" ? "trialing" : "active",
      validUntil,
      daysLeft,
      locked: false,
    };
  }
  // Tolerans yalnızca ödeme geçmişi olan aboneye tanınır; biten deneme uzamaz.
  if (row.status === "active" && daysLeft >= -GRACE_DAYS) {
    return { required: true, status: "grace", validUntil, daysLeft, locked: false };
  }
  return { required: true, status: "expired", validUntil, daysLeft, locked: true };
}

/** Deneme süresinin bitiş tarihi (YYYY-AA-GG). */
export const trialEnd = () =>
  new Date(Date.now() + TRIAL_DAYS * 86_400_000).toISOString().slice(0, 10);

export const planPrice = (plan: "monthly" | "yearly") => PLAN_PRICES[plan];
