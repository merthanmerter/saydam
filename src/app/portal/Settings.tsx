import { CreditCard, KeyRound, Landmark, Repeat, Scale, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { useSearchParams } from "react-router";
import { toast } from "sonner";
import { Field, Money, PageHeader } from "@/app/components/bits";
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
  type OnlinePayment,
  type ProviderName,
  SHARE_METHODS,
  type ShareMethod,
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
  const [form, setForm] = useState({
    name: site.name,
    city: site.city,
    address: site.address,
  });

  const save = useAction(
    () =>
      patch("/site", {
        ...form,
        iban: site.iban,
        ibanHolder: site.ibanHolder,
        bankName: site.bankName,
      }),
    { invalidate: ["/site", "/units"], success: "Site bilgileri güncellendi" },
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">Site profili</CardTitle>
        <CardDescription>
          Sakinlerin ve resmî yazışmaların gördüğü site künyesi.
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
          <Field label="Site adı">
            <Input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </Field>
          <Field label="Şehir">
            <Input
              value={form.city}
              onChange={(e) => setForm({ ...form, city: e.target.value })}
            />
          </Field>
          <Field label="Adres">
            <Input
              value={form.address}
              onChange={(e) => setForm({ ...form, address: e.target.value })}
            />
          </Field>
          <Button type="submit" disabled={save.isPending} className="justify-self-start">
            Kaydet
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

/**
 * Kartla ödemede sakine yansıtılan komisyon farkı.
 *
 * Ayrı bir formdur: oranı değiştirmek için sağlayıcı anahtarlarını yeniden
 * girmek gerekmesin. Varsayılan 0, yani fark yansıtılmaz.
 */
function CardFeeForm({ feePct }: { feePct: number }) {
  const [value, setValue] = useState(String(feePct));
  const pct = Number(value.replace(",", ".")) || 0;

  const save = useAction(() => put("/site/card-fee", { feePct: pct }), {
    invalidate: ["/site"],
    success: pct > 0 ? "Komisyon farkı güncellendi" : "Komisyon farkı kaldırıldı",
  });

  return (
    <CardContent className="border-t pt-6">
      <form
        className="grid gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          save.mutate(undefined);
        }}
      >
        <Field
          label="Kart komisyon farkı (%)"
          hint="0 → yansıtılmaz. Sakinden borcun üstüne bu oran kadar fazla tahsil edilir; borca işlenen tutar değişmez."
        >
          <Input
            inputMode="decimal"
            className="tabular sm:max-w-[160px]"
            value={value}
            onChange={(e) => setValue(e.target.value)}
          />
        </Field>

        <p className="rounded-lg border bg-muted/40 px-3 py-2 text-muted-foreground text-xs">
          {pct > 0 ? (
            <>
              Örnek: <Money cents={100_000} /> borç için karttan{" "}
              <Money cents={Math.round(100_000 * (1 + pct / 100))} /> çekilir, daire
              bakiyesinden <Money cents={100_000} /> düşer. Aradaki fark sağlayıcıya gider,
              kasaya girmez.
            </>
          ) : (
            "Komisyonu sakine yansıtmak, kartlı ödemeyi nakitten pahalı hâle getirir. Uygulamadan önce yönetim planınıza ve sağlayıcı sözleşmenize bakın: üye işyerlerinin kart komisyonunu müşteriye yansıtması mevzuatla sınırlıdır (5464 sayılı Kanun)."
          )}
        </p>

        <Button type="submit" disabled={save.isPending} className="justify-self-start">
          Kaydet
        </Button>
      </form>
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
  const [form, setForm] = useState({
    dueDay: String(site.dueDay),
    lateFeePct: String(site.lateFeePct),
    defaultShareMethod: site.defaultShareMethod,
    debtVisibility: site.debtVisibility,
    accrualDay: site.accrualDay === null ? "off" : String(site.accrualDay),
  });

  const save = useAction(
    () =>
      put("/site/dues-rules", {
        dueDay: Number(form.dueDay),
        lateFeePct: Number(form.lateFeePct.replace(",", ".")),
        defaultShareMethod: form.defaultShareMethod,
        debtVisibility: form.debtVisibility,
        accrualDay: form.accrualDay === "off" ? null : Number(form.accrualDay),
      }),
    { invalidate: ["/site", "/reports"], success: "Aidat kuralları güncellendi" },
  );

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
        <form
          className="grid gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            save.mutate(undefined);
          }}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Son ödeme günü" hint="Ayın kaçında vade dolar">
              <Select
                value={form.dueDay}
                onValueChange={(dueDay) => setForm({ ...form, dueDay })}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Array.from({ length: 28 }, (_, i) => i + 1).map((day) => (
                    <SelectItem key={day} value={String(day)}>
                      Ayın {day}'i
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Gecikme tazminatı (aylık %)" hint="KMK m.20/c: %5">
              <Input
                inputMode="decimal"
                value={form.lateFeePct}
                onChange={(e) => setForm({ ...form, lateFeePct: e.target.value })}
              />
            </Field>
          </div>

          <Field
            label="Varsayılan paylaşım yöntemi"
            hint="Yeni gider kalemlerine önerilir; her kalem ayrıca değiştirilebilir"
          >
            <Select
              value={form.defaultShareMethod}
              onValueChange={(value) =>
                setForm({ ...form, defaultShareMethod: value as ShareMethod })
              }
            >
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
          </Field>

          <Field
            label="Otomatik tahakkuk"
            hint={
              form.accrualDay === "off"
                ? "Kapalı — aidatı her dönem elle hesaplarsınız"
                : "O ay elle hesaplanmadıysa sistem kendisi tahakkuk ettirir"
            }
          >
            <Select
              value={form.accrualDay}
              onValueChange={(accrualDay) => setForm({ ...form, accrualDay })}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="off">Kapalı</SelectItem>
                {Array.from({ length: 28 }, (_, i) => i + 1).map((day) => (
                  <SelectItem key={day} value={String(day)}>
                    Her ayın {day}. günü
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field
            label="Daire borç listesi"
            hint="Kasa ve gider şeffaflığı her hâlükârda herkese açıktır"
          >
            <Select
              value={form.debtVisibility}
              onValueChange={(value) =>
                setForm({ ...form, debtVisibility: value as "yonetim" | "herkes" })
              }
            >
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
          </Field>

          <Button type="submit" disabled={save.isPending} className="justify-self-start">
            Kaydet
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function IbanForm({ site }: { site: Site }) {
  const [iban, setIban] = useState(site.iban ?? "");
  const [holder, setHolder] = useState(site.ibanHolder ?? "");
  const [bank, setBank] = useState(site.bankName ?? "");

  const save = useAction(
    () =>
      patch("/site", {
        name: site.name,
        city: site.city,
        address: site.address,
        iban: iban || null,
        ibanHolder: holder || null,
        bankName: bank || null,
      }),
    { invalidate: ["/site"], success: "Tahsilat bilgileri güncellendi" },
  );

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
        <form
          className="grid gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            save.mutate(undefined);
          }}
        >
          <Field label="Banka">
            <Input
              placeholder="Ziraat Bankası"
              value={bank}
              onChange={(e) => setBank(e.target.value)}
            />
          </Field>
          <Field label="Hesap sahibi">
            <Input value={holder} onChange={(e) => setHolder(e.target.value)} />
          </Field>
          <Field label="IBAN">
            <Input
              className="tabular"
              placeholder="TR00 0000 0000 0000 0000 0000 00"
              value={iban}
              onChange={(e) => setIban(e.target.value)}
            />
          </Field>
          <Button type="submit" disabled={save.isPending} className="justify-self-start">
            Kaydet
          </Button>
        </form>
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
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");

  const save = useAction(() => post("/auth/change-password", { current, next }), {
    success: "Şifreniz güncellendi",
    onDone: () => {
      setCurrent("");
      setNext("");
    },
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
        <form
          className="grid gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            save.mutate(undefined);
          }}
        >
          <Field label="Mevcut şifre">
            <Input
              type="password"
              required
              autoComplete="current-password"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
            />
          </Field>
          <Field label="Yeni şifre" hint="En az 8 karakter">
            <Input
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              value={next}
              onChange={(e) => setNext(e.target.value)}
            />
          </Field>
          <Button type="submit" disabled={save.isPending} className="justify-self-start">
            Güncelle
          </Button>
        </form>
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
  const [siteId, setSiteId] = useState("");
  const [password, setPassword] = useState("");

  const others = (mine.data?.sites ?? []).filter((s) => s.siteId !== me?.siteId);

  const switchSite = useAction(() => post("/auth/switch-site", { siteId, password }), {
    onDone: () => {
      window.location.href = "/panel";
    },
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
        <form
          className="grid gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            switchSite.mutate(undefined);
          }}
        >
          <Field label="Site">
            <Select value={siteId} onValueChange={setSiteId}>
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
          </Field>
          <Field label="O sitedeki şifreniz">
            <Input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </Field>
          <Button
            type="submit"
            disabled={switchSite.isPending || !siteId}
            className="justify-self-start"
          >
            Bu siteye geç
          </Button>
        </form>
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
  const [params, setParams] = useSearchParams();

  useEffect(() => {
    const result = params.get("abonelik");
    if (result === "basarili" || result === "alindi") {
      toast.success("Ödemeniz alındı, aboneliğiniz kısa süre içinde etkinleşecek");
      params.delete("abonelik");
      setParams(params, { replace: true });
    } else if (result === "hata") {
      toast.error("Ödeme tamamlanamadı");
      params.delete("abonelik");
      setParams(params, { replace: true });
    }
  }, [params, setParams]);

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
