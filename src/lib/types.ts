export type Treasury = {
  collectedCents: number;
  pendingCents: number;
  spentCents: number;
  balanceCents: number;
  accruedCents: number;
  receivableCents: number;
  /** Alacağın yürürlükteki yapılandırmalar kapsamındaki kısmı. */
  restructuredCents: number;
};

/** Daire sayısı ve toplam arsa payı. Paylaşım her zaman bu toplama bölünür. */
export type UnitsSummary = {
  unitCount: number;
  totalArsaPayi: number;
};

/**
 * Daire içinde kimin yükümlü olduğu. Yönetime karşı asıl sorumlu her zaman
 * maliktir (KMK m.20); kiracı kira bedeli kadar müteselsil sorumludur (m.22).
 * Bu ayrım malik ile kiracı arasındaki paylaşımı gösterir (TBK m.303).
 */
export type Payer = "malik" | "kiraci";

export const PAYERS: { id: Payer; label: string; hint: string }[] = [
  {
    id: "malik",
    label: "Malik",
    hint: "Anayapıya ilişkin giderler: sigorta, büyük onarım, demirbaş, yenileme fonu",
  },
  {
    id: "kiraci",
    label: "Kiracı",
    hint: "Kullanıma bağlı yan giderler: kapıcı, yakıt, ortak elektrik, temizlik (TBK m.303)",
  },
];

/** KMK m.20 paylaşım yöntemleri. */
export type ShareMethod = "esit" | "arsa_payi";

export const SHARE_METHODS: {
  id: ShareMethod;
  label: string;
  /** Kalem listelerinde kullanılan tam cümle. */
  phrase: string;
  hint: string;
}[] = [
  {
    id: "esit",
    label: "Eşit",
    phrase: "Daireler arasında eşit",
    hint: "Kapıcı, kaloriferci, bahçıvan, bekçi giderleri (KMK m.20/a)",
  },
  {
    id: "arsa_payi",
    label: "Arsa payı",
    phrase: "Arsa payı oranında",
    hint: "Sigorta, ortak yer bakım-onarım, yönetici aylığı, ortak tesisler (KMK m.20/b)",
  },
];

export type Site = {
  id: string;
  slug: string;
  name: string;
  city: string;
  address: string;
  iban: string | null;
  ibanHolder: string | null;
  bankName: string | null;
  /** Ayın kaçında otomatik tahakkuk edilecek; null → yalnızca elle. */
  accrualDay: number | null;
  /** Aidatın son ödeme günü. */
  dueDay: number;
  /** Aylık gecikme tazminatı oranı (KMK m.20/c varsayılanı %5). */
  lateFeePct: number;
  defaultShareMethod: ShareMethod;
  debtVisibility: "yonetim" | "herkes";
};

export type ProviderName = "iyzico" | "paytr";

export type OnlinePayment = {
  enabled: boolean;
  provider: ProviderName | null;
  sandbox: boolean;
  /** Yalnızca yöneticiye döner, gizli anahtar hiçbir zaman gönderilmez. */
  maskedKey: string | null;
  providers: { id: ProviderName; label: string; fields: string[] }[];
  /** Kartla ödemede sakine yansıtılan komisyon farkı (%). 0 → yansıtılmaz. */
  feePct: number;
};

export type Subscription = {
  plan: "monthly" | "yearly";
  status: "trialing" | "active" | "past_due" | "canceled";
  priceCents: number;
  billToSite: boolean;
  currentPeriodEnd: string;
} | null;

export type Unit = {
  id: string;
  block: string;
  no: string;
  floor: number | null;
  arsaPayi: number;
  ownerMembershipId: string | null;
  tenantMembershipId: string | null;
  ownerName: string | null;
  tenantName: string | null;
};

export type Resident = {
  id: string;
  role: "admin" | "resident";
  status: "active" | "removed";
  hasPassword?: boolean;
  createdAt: string;
  email?: string;
  fullName: string;
  phone?: string | null;
  units: { id: string; block: string; no: string; role: "malik" | "kiraci" }[];
};

export type Recurring = {
  id: string;
  title: string;
  category: string;
  amountCents: number;
  shareMethod: ShareMethod;
  payer: Payer;
  startPeriod: number;
  endPeriod: number | null;
  note: string | null;
};

export type Expense = {
  id: string;
  kind: "budgeted" | "one_off" | "system";
  title: string;
  category: string;
  vendor: string | null;
  amountCents: number;
  incurredOn: string;
  period: number;
  installments: number;
  surchargePct: number;
  shareMethod: ShareMethod;
  payer: Payer;
  invoiceUrl: string | null;
  invoiceName: string | null;
  note: string | null;
  budgetTitle: string | null;
  allocations: { period: number; amountCents: number }[];
};

export type BudgetLine = {
  source: "recurring" | "one_off" | "system";
  id: string;
  title: string;
  category: string;
  amountCents: number;
  shareMethod: ShareMethod;
  payer: Payer;
  detail?: string;
};

export type Budget = {
  period: number;
  lines: BudgetLine[];
  recurringCents: number;
  oneOffCents: number;
  systemCents: number;
  totalCents: number;
  run: { id: string; totalCents: number; createdAt: string } | null;
};

export type Due = {
  id: string;
  period: number;
  amountCents: number;
  /** Dairenin payının malik/kiracı dağılımı; toplamı amountCents'e eşittir. */
  ownerCents: number;
  tenantCents: number;
  arsaPayi: number;
  dueDate: string;
  /** Payın kalem kalem dökümü — şeffaflığın kaynağı. */
  breakdown: { title: string; method: ShareMethod; payer: Payer; amountCents: number }[];
  block: string;
  no: string;
  membershipId: string | null;
  residentName?: string;
};

export type Payment = {
  id: string;
  amountCents: number;
  method: "transfer" | "online" | "cash";
  status: "pending" | "confirmed" | "rejected";
  reference: string | null;
  receiptUrl: string | null;
  note: string | null;
  paidAt: string | null;
  createdAt: string;
  unitId: string;
  block: string;
  no: string;
  payerName: string | null;
};

export type Balance = {
  id: string;
  block: string;
  no: string;
  arsaPayi: number;
  ownerId: string | null;
  ownerName: string | null;
  ownerEmail: string | null;
  tenantId: string | null;
  tenantName: string | null;
  tenantEmail: string | null;
  accruedCents: number;
  /** Tahakkukun malik/kiracı dağılımı (KMK m.22 · TBK m.303). */
  ownerAccruedCents: number;
  tenantAccruedCents: number;
  /**
   * Bu ay istenecek tutar. Yapılandırılmış dairede sıradaki taksit(ler);
   * yapılandırılmamışta pratikte borcun tamamı.
   */
  dueNowCents: number;
  /** Yürürlükteki yapılandırmanın vade farkı; yoksa 0. */
  restructuringInterestCents: number;
  hasRestructuring: boolean;
  paidCents: number;
  pendingCents: number;
  /** İşlemiş gecikme tazminatı (KMK m.20/c). */
  lateFeeCents: number;
  /** Ödenmemiş anaparanın tamamı. */
  outstandingCents: number;
  /** Yalnızca vadesi geçmiş anapara. */
  overdueCents: number;
  balanceCents: number;
};

export type YearEnd = {
  year: number;
  billedCents: number;
  spentCents: number;
  differenceCents: number;
  kind: "refund" | "charge";
  alreadyApplied: boolean;
  units: { unitId: string; label: string; arsaPayi: number; amountCents: number }[];
};

export type Doc = {
  id: string;
  title: string;
  category: "yonetmelik" | "toplanti" | "sozlesme" | "proje" | "diger";
  fileUrl: string;
  fileName: string;
  sizeBytes: number;
  createdAt: string;
  uploaderName: string | null;
};

/**
 * Pano gönderisi. Duyuru da bir gönderidir: farkı yönetim tarafından yazılması
 * (`kind`) ve listenin başına sabitlenebilmesidir (`pinned`).
 */
export type Post = {
  id: string;
  kind: "topic" | "announcement";
  pinned: boolean;
  title: string;
  body: string;
  createdAt: string;
  /** Yazar siteden çıkarılmışsa boş kalır; gönderi listede durur. */
  authorId: string | null;
  authorName: string | null;
  commentCount: number;
};

export type Comment = {
  id: string;
  body: string;
  createdAt: string;
  authorId: string | null;
  authorName: string | null;
};

export type Conversation = {
  peer: string;
  peerName: string;
  peerRole: "admin" | "resident";
  id: string;
  body: string;
  createdAt: string;
  senderId: string;
  unreadCount: number;
};

export type Peer = { id: string; fullName: string; role: "admin" | "resident" };

export type Message = {
  id: string;
  body: string;
  senderId: string;
  createdAt: string;
};

/** Borç yapılandırma taksiti. */
export type Installment = {
  no: number;
  dueDate: string;
  amountCents: number;
};

/**
 * Borç yapılandırma. Anaparayı değiştirmez; isteğe bağlı bir vade farkı ekler
 * ve ödemeyi takvime bağlar. Yürürlükteyken gecikme tazminatı bu taksitlerin
 * vadesine göre işler.
 */
export type Restructuring = {
  id: string;
  unitId: string;
  block: string;
  no: string;
  principalCents: number;
  interestPct: number;
  interestCents: number;
  totalCents: number;
  installments: number;
  coversThrough: string;
  status: "active" | "completed" | "canceled";
  note: string | null;
  createdAt: string;
  rows: Installment[];
};

/** Kaydedilmeden önce gösterilen plan. */
export type RestructurePreview = {
  principalCents: number;
  interestCents: number;
  totalCents: number;
  rows: Installment[];
};
