/** Desteklenen ödeme sağlayıcıları. Siteler ikisinden birini seçer. */
export type ProviderName = "iyzico" | "paytr";

export type IyzicoCredentials = { apiKey: string; secretKey: string };
export type PaytrCredentials = {
  merchantId: string;
  merchantKey: string;
  merchantSalt: string;
};

export type ProviderAccount =
  | { provider: "iyzico"; sandbox: boolean; credentials: IyzicoCredentials }
  | { provider: "paytr"; sandbox: boolean; credentials: PaytrCredentials };

export type CheckoutRequest = {
  /** Bizim tarafımızdaki kayıt kimliği (ödeme ya da abonelik). */
  reference: string;
  amountCents: number;
  description: string;
  buyer: {
    id: string;
    fullName: string;
    email: string;
    address: string;
    phone: string;
    ip: string;
  };
  /** Sağlayıcının sonucu bildireceği sunucu adresi. */
  notifyUrl: string;
  /** Kullanıcının ödeme sonrası döneceği sayfalar. */
  successUrl: string;
  failureUrl: string;
};

export type CheckoutSession = {
  /** Kullanıcının yönlendirileceği ödeme sayfası. */
  redirectUrl: string;
  /** Sağlayıcı tarafındaki işlem kimliği; geri dönüşte kaydı buradan buluruz. */
  providerRef: string;
};

/** Sağlayıcıdan gelen bildirimin çözümlenmiş hâli. */
export type CallbackResult = {
  providerRef: string;
  paid: boolean;
  amountCents: number | null;
  error?: string;
};
