import { useNavigate } from "@tanstack/react-router";
import { CreditCard, KeyRound, Landmark, Repeat, Scale, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import type { z } from "zod";
import { Field, Money, PageHeader } from "@/app/components/bits";
import { Form, useAppForm, validate } from "@/app/components/form";
import { settingsRoute } from "@/app/router";
import { useSession } from "@/app/session";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { del, patch, post, put, useAction, useSuspenseApi } from "@/lib/api";
import { date, money } from "@/lib/format";
import {
  bankSchema,
  cardFeeSchema,
  changePasswordSchema,
  duesRulesSchema,
  siteProfileSchema,
  switchSiteSchema,
} from "@/lib/schemas";
import {
  type OnlinePayment,
  type ProviderName,
  SHARE_METHODS,
  type Site,
  type Subscription,
  type UnitsSummary,
} from "@/lib/types";

export default function Settings() {
  const { isAdmin } = useSession();
  const site = useSuspenseApi<{
    site: Site;
    area: UnitsSummary;
    subscription: Subscription;
    onlinePayment: OnlinePayment;
    saasMode: boolean;
  }>("/site");

  return (
    <>
      <PageHeader
        title="Ayarlar"
        description="Site profili, tahsilat bilgileri ve hesabınız."
      />

      <div className="grid items-start gap-4 lg:grid-cols-2">
        {isAdmin && site.data && <SiteForm site={site.data.site} />}
        {isAdmin && site.data && <IbanForm site={site.data.site} />}
        {isAdmin && site.data && <DuesRulesForm site={site.data.site} />}
        {isAdmin && site.data && <OnlinePaymentForm current={site.data.onlinePayment} />}
        <PasswordForm />
        <SiteSwitcher />
        {isAdmin && site.data?.saasMode && (
          <SubscriptionCard subscription={site.data.subscription} />
        )}
      </div>
    </>
  );
}

function SiteForm({ site }: { site: Site }) {
  const save = useAction(
    (value: z.infer<typeof siteProfileSchema>) =>
      patch("/site", {
        ...value,
        iban: site.iban,
        ibanHolder: site.ibanHolder,
        bankName: site.bankName,
      }),
    { invalidate: ["/site", "/units"], success: "Site bilgileri güncellendi" },
  );

  const form = useAppForm({
    defaultValues: { name: site.name, city: site.city, address: site.address },
    ...validate(siteProfileSchema),
    onSubmit: ({ value }) => save.mutateAsync(value),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">Site profili</CardTitle>
        <CardDescription>
          Sakinlerin ve resmî yazışmaların gördüğü site künyesi.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Form form={form} className="grid gap-4">
          <form.AppField name="name">
            {(f) => <f.TextField label="Site adı" />}
          </form.AppField>
          <form.AppField name="city">{(f) => <f.TextField label="Şehir" />}</form.AppField>
          <form.AppField name="address">
            {(f) => <f.TextField label="Adres" />}
          </form.AppField>
          <form.AppForm>
            <form.Submit className="justify-self-start">Kaydet</form.Submit>
          </form.AppForm>
        </Form>
      </CardContent>
    </Card>
  );
}

function CardFeeForm({ feePct }: { feePct: number }) {
  const save = useAction((value: number) => put("/site/card-fee", { feePct: value }), {
    invalidate: ["/site"],
    success: "Komisyon farkı güncellendi",
  });

  const form = useAppForm({
    defaultValues: { feePct: String(feePct) },
    ...validate(cardFeeSchema),
    onSubmit: ({ value }) => save.mutateAsync(Number(value.feePct.replace(",", "."))),
  });

  return (
    <CardContent className="border-t pt-6">
      <Form form={form} className="grid gap-4">
        <form.AppField name="feePct">
          {(f) => (
            <f.TextField
              label="Kart komisyon farkı (%)"
              hint="0 → yansıtılmaz. Sakinden borcun üstüne bu oran kadar fazla tahsil edilir; borca işlenen tutar değişmez."
              inputMode="decimal"
              className="tabular sm:max-w-[160px]"
            />
          )}
        </form.AppField>

        <form.Subscribe
          selector={(state) => Number(state.values.feePct.replace(",", ".")) || 0}
        >
          {(pct) => (
            <p className="rounded-lg border bg-muted/40 px-3 py-2 text-muted-foreground text-xs">
              {pct > 0 ? (
                <>
                  Örnek: <Money cents={100_000} /> borç için karttan{" "}
                  <Money cents={Math.round(100_000 * (1 + pct / 100))} /> çekilir, daire
                  bakiyesinden <Money cents={100_000} /> düşer. Aradaki fark sağlayıcıya
                  gider, kasaya girmez.
                </>
              ) : (
                "Komisyonu sakine yansıtmak, kartlı ödemeyi nakitten pahalı hâle getirir. Uygulamadan önce yönetim planınıza ve sağlayıcı sözleşmenize bakın: üye işyerlerinin kart komisyonunu müşteriye yansıtması mevzuatla sınırlıdır (5464 sayılı Kanun)."
              )}
            </p>
          )}
        </form.Subscribe>

        <form.AppForm>
          <form.Submit className="justify-self-start">Kaydet</form.Submit>
        </form.AppForm>
      </Form>
    </CardContent>
  );
}

/**
 * Aidat kuralları. KMK m.20/c gecikme tazminatını aylık %5 olarak belirliyor;
 * yönetim planı farklı bir oran ya da paylaşım yöntemi öngörebildiği için
 * ikisi de ayarlanabilir. Borç listesi görünürlüğü KVKK gerekçesiyle
 * varsayılan olarak yalnızca yönetime açıktır.
 */
function DuesRulesForm({ site }: { site: Site }) {
  const save = useAction(
    (value: z.infer<typeof duesRulesSchema>) =>
      put("/site/dues-rules", {
        dueDay: Number(value.dueDay),
        lateFeePct: Number(value.lateFeePct.replace(",", ".")),
        defaultShareMethod: value.defaultShareMethod,
        debtVisibility: value.debtVisibility,
        accrualDay: value.accrualDay === "off" ? null : Number(value.accrualDay),
      }),
    { invalidate: ["/site", "/reports"], success: "Aidat kuralları güncellendi" },
  );

  const form = useAppForm({
    defaultValues: {
      dueDay: String(site.dueDay),
      lateFeePct: String(site.lateFeePct),
      defaultShareMethod: site.defaultShareMethod,
      debtVisibility: site.debtVisibility,
      accrualDay: site.accrualDay === null ? "off" : String(site.accrualDay),
    },
    ...validate(duesRulesSchema),
    onSubmit: ({ value }) => save.mutateAsync(value),
  });

  const days = Array.from({ length: 28 }, (_, i) => i + 1);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Scale className="size-4" /> Aidat kuralları
        </CardTitle>
        <CardDescription>
          Kat Mülkiyeti Kanunu m.20 varsayılanları. Yönetim planınız farklı bir düzen
          öngörüyorsa buradan uyarlayın.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Form form={form} className="grid gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <form.AppField name="dueDay">
              {(f) => (
                <f.ChoiceField label="Son ödeme günü" hint="Ayın kaçında vade dolar">
                  {(value, onChange) => (
                    <Select value={value} onValueChange={onChange}>
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {days.map((day) => (
                          <SelectItem key={day} value={String(day)}>
                            Ayın {day}'i
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </f.ChoiceField>
              )}
            </form.AppField>
            <form.AppField name="lateFeePct">
              {(f) => (
                <f.TextField
                  label="Gecikme tazminatı (aylık %)"
                  hint="KMK m.20/c: %5"
                  inputMode="decimal"
                />
              )}
            </form.AppField>
          </div>

          <form.AppField name="defaultShareMethod">
            {(f) => (
              <f.ChoiceField
                label="Varsayılan paylaşım yöntemi"
                hint="Yeni gider kalemlerine önerilir; her kalem ayrıca değiştirilebilir"
              >
                {(value, onChange) => (
                  <Select value={value} onValueChange={onChange}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {SHARE_METHODS.map((method) => (
                        <SelectItem key={method.id} value={method.id}>
                          {method.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </f.ChoiceField>
            )}
          </form.AppField>

          <form.AppField name="accrualDay">
            {(f) => (
              <f.ChoiceField
                label="Otomatik tahakkuk"
                hint="O ay elle hesaplanmadıysa sistem kendisi tahakkuk ettirir"
              >
                {(value, onChange) => (
                  <Select value={value} onValueChange={onChange}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="off">Kapalı</SelectItem>
                      {days.map((day) => (
                        <SelectItem key={day} value={String(day)}>
                          Her ayın {day}. günü
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </f.ChoiceField>
            )}
          </form.AppField>

          <form.AppField name="debtVisibility">
            {(f) => (
              <f.ChoiceField
                label="Daire borç listesi"
                hint="Kasa ve gider şeffaflığı her hâlükârda herkese açıktır"
              >
                {(value, onChange) => (
                  <Select value={value} onValueChange={onChange}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="yonetim">
                        Yalnızca yönetim (KVKK açısından güvenli)
                      </SelectItem>
                      <SelectItem value="herkes">Tüm sakinler görebilir</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              </f.ChoiceField>
            )}
          </form.AppField>

          <form.AppForm>
            <form.Submit className="justify-self-start">Kaydet</form.Submit>
          </form.AppForm>
        </Form>
      </CardContent>
    </Card>
  );
}

function IbanForm({ site }: { site: Site }) {
  const save = useAction(
    (value: z.infer<typeof bankSchema>) =>
      patch("/site", {
        name: site.name,
        city: site.city,
        address: site.address,
        iban: value.iban || null,
        ibanHolder: value.ibanHolder || null,
        bankName: value.bankName || null,
      }),
    { invalidate: ["/site"], success: "Tahsilat bilgileri güncellendi" },
  );

  const form = useAppForm({
    defaultValues: {
      bankName: site.bankName ?? "",
      ibanHolder: site.ibanHolder ?? "",
      iban: site.iban ?? "",
    },
    ...validate(bankSchema),
    onSubmit: ({ value }) => save.mutateAsync(value),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Landmark className="size-4" /> Havale bilgileri
        </CardTitle>
        <CardDescription>
          Sakinler ödeme sayfasında bu bilgileri görür ve havale bildirimi yapar.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Form form={form} className="grid gap-4">
          <form.AppField name="bankName">
            {(f) => <f.TextField label="Banka" placeholder="Ziraat Bankası" />}
          </form.AppField>
          <form.AppField name="ibanHolder">
            {(f) => <f.TextField label="Hesap sahibi" />}
          </form.AppField>
          <form.AppField name="iban">
            {(f) => (
              <f.TextField
                label="IBAN"
                className="tabular"
                placeholder="TR00 0000 0000 0000 0000 0000 00"
              />
            )}
          </form.AppField>
          <form.AppForm>
            <form.Submit className="justify-self-start">Kaydet</form.Submit>
          </form.AppForm>
        </Form>
      </CardContent>
    </Card>
  );
}

/**
 * Sitenin kendi ödeme hesabı. Tahsilat doğrudan siteye gider; say-dam bu paraya
 * aracılık etmez. Boş bırakılırsa yalnızca havale akışı çalışır.
 */
const PROVIDER_FIELDS = {
  iyzico: [
    { name: "apiKey", label: "API anahtarı", secret: false, placeholder: "sandbox-…" },
    { name: "secretKey", label: "Gizli anahtar (secret key)", secret: true },
  ],
  paytr: [
    {
      name: "merchantId",
      label: "Mağaza no (merchant id)",
      secret: false,
      placeholder: "123456",
    },
    { name: "merchantKey", label: "Mağaza anahtarı (merchant key)", secret: true },
    { name: "merchantSalt", label: "Mağaza gizli anahtarı (merchant salt)", secret: true },
  ],
} as const;

function OnlinePaymentForm({ current }: { current: OnlinePayment }) {
  const [provider, setProvider] = useState<ProviderName>(current.provider ?? "iyzico");
  const [values, setValues] = useState<Record<string, string>>({});
  const [sandbox, setSandbox] = useState(current.sandbox);

  const fields = PROVIDER_FIELDS[provider];
  const complete = fields.every((field) => (values[field.name] ?? "").trim().length > 0);

  const save = useAction(
    () => put("/site/payment-provider", { provider, sandbox, ...values }),
    {
      invalidate: ["/site"],
      success: "Ödeme hesabınız doğrulandı ve kaydedildi",
      onDone: () => setValues({}),
    },
  );

  const disable = useAction(() => del("/site/payment-provider"), {
    invalidate: ["/site"],
    success: "Kartla ödeme kapatıldı",
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <ShieldCheck className="size-4" /> Kartla ödeme
          {current.enabled && (
            <Badge variant={current.sandbox ? "secondary" : "default"}>
              {current.provider === "paytr" ? "PayTR" : "iyzico"}
              {current.sandbox ? " · test" : ""}
            </Badge>
          )}
        </CardTitle>
        <CardDescription>
          iyzico ya da PayTR hesabınızın anahtarlarını girin; tahsil edilen aidat doğrudan
          sizin hesabınıza geçer, say-dam aracılık etmez. Boş bırakırsanız sakinler yalnızca
          havale ile öder.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form
          className="grid gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            save.mutate(undefined);
          }}
        >
          {current.enabled && (
            <p className="rounded-lg border bg-muted/40 px-3 py-2 text-muted-foreground text-sm">
              Kayıtlı hesap: <span className="tabular">{current.maskedKey}</span>
            </p>
          )}

          <Field label="Sağlayıcı">
            <Select
              value={provider}
              onValueChange={(value) => {
                setProvider(value as ProviderName);
                setValues({});
              }}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {current.providers.map((item) => (
                  <SelectItem key={item.id} value={item.id}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          {fields.map((field) => (
            <Field
              key={field.name}
              label={field.label}
              hint={
                current.enabled && current.provider === provider
                  ? "Değiştirmek için yeni değeri girin"
                  : undefined
              }
            >
              <Input
                type={field.secret ? "password" : "text"}
                autoComplete="off"
                placeholder={"placeholder" in field ? field.placeholder : undefined}
                value={values[field.name] ?? ""}
                onChange={(e) =>
                  setValues((previous) => ({ ...previous, [field.name]: e.target.value }))
                }
              />
            </Field>
          ))}

          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              className="mt-0.5 size-4 accent-[var(--primary)]"
              checked={sandbox}
              onChange={(e) => setSandbox(e.target.checked)}
            />
            <span>
              Test ortamı
              <span className="block text-muted-foreground text-xs">
                İşaretliyken gerçek para çekilmez; canlıya geçerken kaldırın.
              </span>
            </span>
          </label>

          <div className="flex gap-2">
            <Button type="submit" disabled={save.isPending || !complete}>
              {save.isPending ? "Doğrulanıyor…" : "Doğrula ve kaydet"}
            </Button>
            {current.enabled && (
              <Button
                type="button"
                variant="outline"
                disabled={disable.isPending}
                onClick={() => disable.mutate(undefined)}
              >
                Kartla ödemeyi kapat
              </Button>
            )}
          </div>
        </form>
      </CardContent>

      {current.enabled && <CardFeeForm feePct={current.feePct} />}
    </Card>
  );
}

function PasswordForm() {
  const save = useAction(
    (value: z.infer<typeof changePasswordSchema>) => post("/auth/change-password", value),
    { success: "Şifreniz güncellendi", onDone: () => form.reset() },
  );

  const form = useAppForm({
    defaultValues: { current: "", next: "" },
    ...validate(changePasswordSchema),
    onSubmit: ({ value }) => save.mutateAsync(value),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <KeyRound className="size-4" /> Şifre değiştir
        </CardTitle>
        <CardDescription>Şifreniz yalnızca bu site için geçerlidir.</CardDescription>
      </CardHeader>
      <CardContent>
        <Form form={form} className="grid gap-4">
          <form.AppField name="current">
            {(f) => (
              <f.TextField
                label="Mevcut şifre"
                type="password"
                autoComplete="current-password"
              />
            )}
          </form.AppField>
          <form.AppField name="next">
            {(f) => (
              <f.TextField
                label="Yeni şifre"
                hint="En az 8 karakter"
                type="password"
                autoComplete="new-password"
              />
            )}
          </form.AppField>
          <form.AppForm>
            <form.Submit className="justify-self-start">Güncelle</form.Submit>
          </form.AppForm>
        </Form>
      </CardContent>
    </Card>
  );
}

type MySite = {
  membershipId: string;
  siteId: string;
  name: string;
  city: string;
  role: string;
  status: string;
};

function SiteSwitcher() {
  const { me } = useSession();
  const mine = useSuspenseApi<{ sites: MySite[] }>("/auth/my-sites");
  const others = (mine.data?.sites ?? []).filter((site) => site.siteId !== me?.siteId);

  const switchSite = useAction(
    (value: z.infer<typeof switchSiteSchema>) => post("/auth/switch-site", value),
    {
      onDone: () => {
        window.location.href = "/panel";
      },
    },
  );

  const form = useAppForm({
    defaultValues: { siteId: "", password: "" },
    ...validate(switchSiteSchema),
    onSubmit: ({ value }) => switchSite.mutateAsync(value),
  });

  if (others.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Repeat className="size-4" /> Site değiştir
        </CardTitle>
        <CardDescription>
          Aynı e-posta ile kayıtlı olduğunuz diğer siteler. Her sitenin şifresi ayrıdır.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Form form={form} className="grid gap-4">
          <form.AppField name="siteId">
            {(f) => (
              <f.ChoiceField label="Site">
                {(value, onChange) => (
                  <Select value={value} onValueChange={onChange}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Site seçin" />
                    </SelectTrigger>
                    <SelectContent>
                      {others.map((site) => (
                        <SelectItem key={site.siteId} value={site.siteId}>
                          {site.name}
                          {site.city ? ` · ${site.city}` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </f.ChoiceField>
            )}
          </form.AppField>
          <form.AppField name="password">
            {(f) => (
              <f.TextField
                label="O sitedeki şifreniz"
                type="password"
                autoComplete="current-password"
              />
            )}
          </form.AppField>
          <form.AppForm>
            <form.Submit className="justify-self-start">Bu siteye geç</form.Submit>
          </form.AppForm>
        </Form>
      </CardContent>
    </Card>
  );
}

const SUB_LABEL = {
  trialing: "Deneme",
  active: "Aktif",
  grace: "Ödeme gecikti",
  expired: "Süresi doldu",
  none: "Abonelik yok",
} as const;

function SubscriptionCard({ subscription }: { subscription: Subscription }) {
  const { me } = useSession();
  const state = me?.subscription;
  const [plan, setPlan] = useState<"monthly" | "yearly">(subscription?.plan ?? "monthly");
  const [billToSite, setBillToSite] = useState(subscription?.billToSite ?? true);
  // Ödeme sağlayıcısı kullanıcıyı sonuçla birlikte buraya döndürür; sonucu
  // bildirip adresi temizliyoruz ki sayfa yenilenince tekrar görünmesin.
  const { abonelik } = settingsRoute.useSearch();
  const navigate = useNavigate();

  useEffect(() => {
    if (!abonelik) return;
    if (abonelik === "hata") toast.error("Ödeme tamamlanamadı");
    else toast.success("Ödemeniz alındı, aboneliğiniz kısa süre içinde etkinleşecek");
    navigate({ to: "/panel/ayarlar", search: {}, replace: true });
  }, [abonelik, navigate]);

  const subscribe = useAction<undefined, { paymentPageUrl?: string; status?: string }>(
    () => post("/billing/subscribe", { plan, billToSite }),
    {
      invalidate: ["/site", "/billing"],
      onDone: (result) => {
        if (result.paymentPageUrl) window.location.assign(result.paymentPageUrl);
        else toast.success("Abonelik kaydedildi");
      },
    },
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <CreditCard className="size-4" /> say-dam aboneliği
          {state && (
            <Badge
              variant={
                state.locked
                  ? "destructive"
                  : state.status === "active"
                    ? "default"
                    : "secondary"
              }
            >
              {SUB_LABEL[state.status]}
            </Badge>
          )}
        </CardTitle>
        <CardDescription>
          {state?.validUntil
            ? state.daysLeft >= 0
              ? `${date(state.validUntil)} tarihine kadar geçerli — ${state.daysLeft} gün kaldı.`
              : `${date(state.validUntil)} tarihinde sona erdi.`
            : "Bulut sürümü aboneliği. Ücret istenirse site giderlerine otomatik eklenir."}
          {state?.locked &&
            " Yönetim işlemleri kilitli; sakinler kayıtları görmeye ve ödeme yapmaya devam ediyor."}
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <Field label="Plan">
          <Select value={plan} onValueChange={(value) => setPlan(value as typeof plan)}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="monthly">Aylık — {money(190_000)}</SelectItem>
              <SelectItem value="yearly">Yıllık — {money(1_900_000)}</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            className="mt-0.5 size-4 accent-[var(--primary)]"
            checked={billToSite}
            onChange={(e) => setBillToSite(e.target.checked)}
          />
          <span>
            Abonelik ücretini site giderlerine otomatik ekle
            <span className="block text-muted-foreground text-xs">
              Aylık payı her tahakkukta platform gideri olarak aidata yansır.
            </span>
          </span>
        </label>
        <Button
          disabled={subscribe.isPending}
          onClick={() => subscribe.mutate(undefined)}
          className="justify-self-start"
        >
          {subscription ? "Planı güncelle" : "Aboneliği başlat"}
        </Button>
      </CardContent>
    </Card>
  );
}
