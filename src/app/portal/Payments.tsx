import { useSelector } from "@tanstack/react-form";
import { useNavigate } from "@tanstack/react-router";
import {
  Banknote,
  CalendarClock,
  Check,
  CreditCard,
  Landmark,
  Wallet,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import type { z } from "zod";
import { DialogActions, EmptyState, Field, Money, PageHeader } from "@/app/components/bits";
import { ConfirmDialog } from "@/app/components/confirm";
import {
  actionsColumn,
  type Column,
  DataTable,
  moneyColumn,
  unitColumn,
} from "@/app/components/data-table";
import { Form, useAppForm, validate } from "@/app/components/form";
import { FileUpload, type UploadedFile } from "@/app/components/inputs";
import { RowActions } from "@/app/components/row-actions";
import { paymentsRoute } from "@/app/router";
import { useSession } from "@/app/session";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  del,
  type Paged,
  patch,
  post,
  useAction,
  useApi,
  usePaged,
  useSuspenseApi,
} from "@/lib/api";
import { date, fromCents, money, toCents, today } from "@/lib/format";
import {
  checkoutSchema,
  manualPaymentSchema,
  paymentSchema,
  restructureSchema,
} from "@/lib/schemas";
import type {
  Balance,
  OnlinePayment,
  Payment,
  RestructurePreview,
  Restructuring,
  Site,
} from "@/lib/types";

const METHOD_LABEL = { transfer: "Havale/EFT", online: "Kart", cash: "Nakit" } as const;
const STATUS = {
  pending: { label: "Onay bekliyor", variant: "warning" as const },
  confirmed: { label: "Onaylandı", variant: "success" as const },
  rejected: { label: "Reddedildi", variant: "outline" as const },
};

export default function Payments() {
  const { me, isAdmin } = useSession();
  const payments = usePaged<Payment>("/payments");
  const balances = useSuspenseApi<Paged<Balance>>("/reports/balances?size=500");
  const site = useSuspenseApi<{ site: Site; onlinePayment: OnlinePayment }>("/site");
  const [editing, setEditing] = useState<Payment | null>(null);
  const columns = useMemo(() => paymentColumns(isAdmin, setEditing), [isAdmin]);
  // Ödeme sağlayıcısı sonucu adres üzerinden döndürür.
  const { odeme } = paymentsRoute.useSearch();
  const navigate = useNavigate();

  useEffect(() => {
    if (!odeme) return;
    if (odeme === "basarili") toast.success("Ödemeniz alındı, teşekkürler");
    // PayTR sonucu ayrı bir bildirimle gelir; kayıt birkaç saniye içinde işlenir.
    else if (odeme === "alindi")
      toast.success("Ödemeniz alındı, kaydınıza birkaç saniye içinde işlenecek");
    else toast.error("Ödeme tamamlanamadı");
    navigate({ to: "/panel/odemeler", search: {}, replace: true });
  }, [odeme, navigate]);

  const myUnits = (balances.data.items ?? []).filter(
    (b) => b.ownerId === me?.membershipId || b.tenantId === me?.membershipId,
  );

  return (
    <>
      <PageHeader
        title="Ödemeler"
        description={
          isAdmin
            ? "Havale bildirimlerini onaylayın; onaylanan her ödeme kasaya işlenir."
            : "Kartla anında ödeyin ya da havale yaptıysanız bildirin."
        }
        actions={
          isAdmin ? (
            <>
              <RestructureDialog balances={balances.data.items ?? []} />
              <ManualPaymentDialog />
            </>
          ) : (
            myUnits.length > 0 && (
              <>
                <DeclareDialog units={myUnits} />
                {site.data?.onlinePayment.enabled && (
                  <OnlinePayDialog
                    units={myUnits}
                    feePct={site.data.onlinePayment.feePct}
                  />
                )}
              </>
            )
          )
        }
      />

      {editing && (
        <ManualPaymentDialog
          key={editing.id}
          payment={editing}
          onClose={() => setEditing(null)}
        />
      )}

      {!isAdmin && site.data?.site.iban && (
        <Card className="mb-5 gap-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Landmark className="size-4 text-muted-foreground" />
              Havale bilgileri
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-1 text-sm">
            {site.data.site.bankName && <div>{site.data.site.bankName}</div>}
            <div>{site.data.site.ibanHolder ?? site.data.site.name}</div>
            <div className="tabular font-medium">{site.data.site.iban}</div>
            <p className="mt-1 text-muted-foreground text-xs">
              Havale sonrası "Havale bildir" ile bildirim yapın; yönetim onayladığında
              bakiyenize işlenir.
              {!site.data?.onlinePayment.enabled && " Bu sitede kartla ödeme açık değil."}
            </p>
          </CardContent>
        </Card>
      )}

      <DataTable
        columns={columns}
        rows={payments.items}
        paging={payments}
        empty={
          <EmptyState
            icon={Wallet}
            title="Henüz ödeme kaydı yok"
            description={
              isAdmin
                ? "Sakinler ödeme yaptıkça burada listelenir."
                : "Ödeme yaptığınızda burada görünecek."
            }
          />
        }
      />
    </>
  );
}

/** Ödeyen ve işlem sütunlarını yalnızca yönetim görür. */
const paymentColumns = (
  isAdmin: boolean,
  onEdit: (payment: Payment) => void,
): Column<Payment>[] => [
  {
    id: "date",
    header: "Tarih",
    cell: ({ row }) => (
      <span className="whitespace-nowrap text-muted-foreground text-sm">
        {date(row.original.paidAt ?? row.original.createdAt)}
      </span>
    ),
  },
  unitColumn<Payment>(),
  ...(isAdmin
    ? [
        {
          accessorKey: "payerName",
          header: "Ödeyen",
          cell: ({ row }) => (
            <div className="text-muted-foreground text-sm">
              {row.original.payerName ?? "—"}
              {row.original.reference && (
                <div className="text-xs">Açıklama: {row.original.reference}</div>
              )}
              {row.original.receiptUrl && (
                <a
                  href={row.original.receiptUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs underline underline-offset-2"
                >
                  Dekont
                </a>
              )}
            </div>
          ),
        } satisfies Column<Payment>,
      ]
    : []),
  {
    accessorKey: "method",
    header: "Yöntem",
    cell: ({ row }) => <span className="text-sm">{METHOD_LABEL[row.original.method]}</span>,
  },
  moneyColumn<Payment>("amountCents", "Tutar"),
  {
    accessorKey: "status",
    header: "Durum",
    cell: ({ row }) => (
      <Badge variant={STATUS[row.original.status].variant}>
        {STATUS[row.original.status].label}
      </Badge>
    ),
  },
  ...(isAdmin
    ? [
        actionsColumn<Payment>(({ row }) => (
          <PaymentActions payment={row.original} onEdit={() => onEdit(row.original)} />
        )),
      ]
    : []),
];

/**
 * Satır işlemleri.
 *
 * Bekleyen bildirimde onay ve ret iki ayrı düğme: yönetimin bu ekranda
 * yaptığı iş bunlardan ibaret, menünün arkasına saklamak fazladan bir tık.
 * Onaylanmış kayıtta ise tek iş var (düzeltme), o da menüde.
 */
function PaymentActions({ payment, onEdit }: { payment: Payment; onEdit: () => void }) {
  const decide = useAction(
    (status: "confirmed" | "rejected") =>
      post(`/payments/${payment.id}/decide`, { status, note: null }),
    { invalidate: ["/payments", "/reports"], success: "Ödeme güncellendi" },
  );

  if (payment.status === "pending") {
    return (
      <div className="flex justify-end gap-1.5">
        <Button
          variant="outline"
          size="sm"
          disabled={decide.isPending}
          onClick={() => decide.mutate("confirmed")}
        >
          <Check className="size-4" /> Onayla
        </Button>
        <ConfirmDialog
          trigger={
            <Button variant="ghost" size="sm" disabled={decide.isPending}>
              <X className="size-4" /> Reddet
            </Button>
          }
          title="Ödeme reddedilsin mi?"
          description="Bildirim reddedilir, kasaya işlenmez ve daire borcu olduğu gibi kalır. Sakin yeniden bildirim yapabilir."
          confirmLabel="Reddet"
          destructive
          onConfirm={() => decide.mutate("rejected")}
        />
      </div>
    );
  }

  // Kart tahsilatı sağlayıcıdan geldiği için elle düzeltilmez.
  if (payment.status !== "confirmed" || payment.method === "online") return null;

  return <RowActions actions={[{ label: "Düzelt", onSelect: onEdit }]} />;
}

/** `withResident` yönetim tarafında açıktır: daire numarasının yanında sakinin adı görünür. */
const UnitSelect = ({
  units,
  value,
  onChange,
  withResident,
}: {
  units: Balance[];
  value: string;
  onChange: (id: string) => void;
  withResident?: boolean;
}) => (
  <Select value={value} onValueChange={onChange}>
    <SelectTrigger className="w-full">
      <SelectValue placeholder="Daire seçin" />
    </SelectTrigger>
    <SelectContent>
      {units.map((unit) => (
        <SelectItem key={unit.id} value={unit.id}>
          {unit.block && `${unit.block} `}
          {unit.no}
          {withResident && ` (${unit.tenantName ?? unit.ownerName ?? "boş"})`}
          {unit.dueNowCents > 0 ? ` · ${money(unit.dueNowCents)} bu ay` : ""}
        </SelectItem>
      ))}
    </SelectContent>
  </Select>
);

function DeclareDialog({ units }: { units: Balance[] }) {
  const [open, setOpen] = useState(false);
  const [receipt, setReceipt] = useState<UploadedFile | null>(null);

  const declare = useAction(
    (value: z.infer<typeof paymentSchema>) =>
      post("/payments/declare", {
        unitId: value.unitId,
        amountCents: toCents(value.amount),
        paidAt: value.paidAt,
        reference: value.reference || null,
        receiptUrl: receipt?.url ?? null,
      }),
    {
      invalidate: ["/payments", "/reports"],
      success: "Bildiriminiz yönetime iletildi",
      onDone: () => {
        setOpen(false);
        setReceipt(null);
      },
    },
  );

  const form = useAppForm({
    defaultValues: {
      unitId: units[0]?.id ?? "",
      amount: fromCents(Math.max(units[0]?.dueNowCents ?? 0, 0)),
      paidAt: today(),
      reference: "",
    },
    ...validate(paymentSchema),
    onSubmit: ({ value }) => declare.mutateAsync(value),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Landmark className="size-4" /> Havale bildir
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Havale bildirimi</DialogTitle>
          <DialogDescription>
            Yönetim onayladığında ödemeniz kasaya ve bakiyenize işlenir.
          </DialogDescription>
        </DialogHeader>
        <Form form={form} className="grid gap-4">
          <form.AppField name="unitId">
            {(f) => (
              <f.ChoiceField label="Daire">
                {(value, onChange) => (
                  <UnitSelect units={units} value={value} onChange={onChange} />
                )}
              </f.ChoiceField>
            )}
          </form.AppField>
          <div className="grid gap-4 sm:grid-cols-2">
            <form.AppField name="amount">
              {(f) => <f.MoneyField label="Tutar" />}
            </form.AppField>
            <form.AppField name="paidAt">
              {(f) => <f.TextField label="Ödeme tarihi" type="date" />}
            </form.AppField>
          </div>
          <form.AppField name="reference">
            {(f) => <f.TextField label="Açıklama / referans" />}
          </form.AppField>
          <Field label="Dekont (isteğe bağlı)">
            <FileUpload
              folder="dekontlar"
              value={receipt}
              onChange={setReceipt}
              label="Dekont yükle"
            />
          </Field>
          <DialogActions>
            <form.AppForm>
              <form.Submit>Bildir</form.Submit>
            </form.AppForm>
          </DialogActions>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

function OnlinePayDialog({ units, feePct }: { units: Balance[]; feePct: number }) {
  const [open, setOpen] = useState(false);

  const checkout = useAction<z.infer<typeof checkoutSchema>, { paymentPageUrl: string }>(
    (value) =>
      post("/payments/checkout", {
        unitId: value.unitId,
        amountCents: toCents(value.amount),
      }),
    { onDone: (result) => window.location.assign(result.paymentPageUrl) },
  );

  const form = useAppForm({
    defaultValues: {
      unitId: units[0]?.id ?? "",
      amount: fromCents(Math.max(units[0]?.dueNowCents ?? 0, 0)),
    },
    ...validate(checkoutSchema),
    onSubmit: ({ value }) => checkout.mutateAsync(value),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <CreditCard className="size-4" /> Kartla öde
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Kartla ödeme</DialogTitle>
          <DialogDescription>
            iyzico güvenli ödeme sayfasına yönlendirileceksiniz. Ödeme tamamlandığında
            bakiyeniz otomatik güncellenir.
          </DialogDescription>
        </DialogHeader>
        <Form form={form} className="grid gap-4">
          <form.AppField name="unitId">
            {(f) => (
              <f.ChoiceField label="Daire">
                {(value, onChange) => (
                  <UnitSelect units={units} value={value} onChange={onChange} />
                )}
              </f.ChoiceField>
            )}
          </form.AppField>
          <form.AppField name="amount">
            {(f) => <f.MoneyField label="Tutar" />}
          </form.AppField>

          {/* Komisyon farkı borcun üstüne eklenir; sakin ne ödeyeceğini önden görür. */}
          {feePct > 0 && (
            <form.Subscribe selector={(state) => toCents(state.values.amount)}>
              {(amountCents) => {
                if (!Number.isFinite(amountCents) || amountCents <= 0) return null;
                const feeCents = Math.round((amountCents * feePct) / 100);
                if (feeCents <= 0) return null;
                return (
                  <div className="grid gap-1 rounded-lg border bg-muted/40 px-3 py-2 text-sm">
                    <div className="flex justify-between text-muted-foreground">
                      <span>Borcunuza işlenecek</span>
                      <Money cents={amountCents} />
                    </div>
                    <div className="flex justify-between text-muted-foreground">
                      <span>Kart komisyon farkı (%{feePct})</span>
                      <Money cents={feeCents} />
                    </div>
                    <div className="flex justify-between border-t pt-1 font-medium">
                      <span>Karttan çekilecek</span>
                      <Money cents={amountCents + feeCents} />
                    </div>
                  </div>
                );
              }}
            </form.Subscribe>
          )}

          <DialogActions>
            <form.AppForm>
              <form.Submit>
                {checkout.isPending ? "Yönlendiriliyor…" : "Ödemeye geç"}
              </form.Submit>
            </form.AppForm>
          </DialogActions>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Tahsilat kaydı — girme ve düzeltme aynı form.
 *
 * `payment` verildiğinde form o kaydın değerleriyle açılır ve tetikleyici
 * düğme çizilmez; satır menüsünden açılır. Yanlış girilmiş bir kaydı silip
 * yeniden girmek kasa geçmişinde boşluk bırakırdı.
 */
function ManualPaymentDialog({
  payment,
  onClose,
}: {
  payment?: Payment;
  onClose?: () => void;
}) {
  const [open, setOpen] = useState(payment !== undefined);
  const balances = useSuspenseApi<Paged<Balance>>("/reports/balances?size=500");

  const close = () => {
    setOpen(false);
    onClose?.();
  };

  const save = useAction(
    (value: z.infer<typeof manualPaymentSchema>) => {
      const payload = {
        unitId: value.unitId,
        amountCents: toCents(value.amount),
        method: value.method,
        paidAt: value.paidAt,
        reference: value.reference || null,
      };
      return payment
        ? patch(`/payments/${payment.id}`, payload)
        : post("/payments", { ...payload, note: null });
    },
    {
      invalidate: ["/payments", "/reports"],
      success: payment ? "Tahsilat düzeltildi" : "Tahsilat kaydedildi",
      onDone: () => close(),
    },
  );

  const form = useAppForm({
    defaultValues: {
      unitId: payment?.unitId ?? "",
      amount: payment ? fromCents(payment.amountCents) : "",
      method: payment?.method === "cash" ? "cash" : "transfer",
      paidAt: (payment?.paidAt ?? today()).slice(0, 10),
      reference: payment?.reference ?? "",
    } as z.infer<typeof manualPaymentSchema>,
    ...validate(manualPaymentSchema),
    onSubmit: ({ value }) => save.mutateAsync(value),
  });

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? setOpen(true) : close())}>
      {!payment && (
        <DialogTrigger asChild>
          <Button>
            <Banknote className="size-4" /> Tahsilat gir
          </Button>
        </DialogTrigger>
      )}
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{payment ? "Tahsilatı düzelt" : "Tahsilat kaydı"}</DialogTitle>
          <DialogDescription>
            {payment
              ? "Daire, tutar ve tarih düzeltilebilir. Mahsuplaşması yapılmış bir yılın kaydı değiştirilemez."
              : "Elden ya da hesabınıza geçen ödemeyi doğrudan işleyin."}
          </DialogDescription>
        </DialogHeader>
        <Form form={form} className="grid gap-4">
          <form.AppField name="unitId">
            {(f) => (
              <f.ChoiceField label="Daire">
                {(value, onChange) => (
                  <UnitSelect
                    withResident
                    units={balances.data.items ?? []}
                    value={value}
                    onChange={onChange}
                  />
                )}
              </f.ChoiceField>
            )}
          </form.AppField>
          <div className="grid gap-4 sm:grid-cols-2">
            <form.AppField name="amount">
              {(f) => <f.MoneyField label="Tutar" />}
            </form.AppField>
            <form.AppField name="method">
              {(f) => (
                <f.SelectField
                  label="Yöntem"
                  options={[
                    { value: "transfer", label: "Havale/EFT" },
                    { value: "cash", label: "Nakit" },
                  ]}
                />
              )}
            </form.AppField>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <form.AppField name="paidAt">
              {(f) => <f.TextField label="Ödeme tarihi" type="date" />}
            </form.AppField>
            <form.AppField name="reference">
              {(f) => <f.TextField label="Açıklama" />}
            </form.AppField>
          </div>
          <DialogActions>
            <form.AppForm>
              <form.Submit>{payment ? "Düzeltmeyi kaydet" : "Kaydet"}</form.Submit>
            </form.AppForm>
          </DialogActions>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Borç yapılandırma.
 *
 * Ayrı bir ekranı yok: yapılandırma, borcun aylara nasıl dağıldığını
 * değiştirmekten ibaret. Sonucu zaten "bu ay ödenecek" tutarında görünüyor,
 * ayrıca bir liste olarak gösterilmesine gerek yok. Yönetim aynı diyalogdan
 * hem kurar hem kaldırır.
 */
function RestructureDialog({ balances }: { balances: Balance[] }) {
  const [open, setOpen] = useState(false);
  const eligible = balances.filter((b) => b.balanceCents > 0 || b.hasRestructuring);
  // Daire seçimi hangi kolun görüneceğini belirler (mevcut plan mı, yeni
  // yapılandırma mı); form verisi değil ekran durumu.
  const [unitId, setUnitId] = useState(eligible[0]?.id ?? "");

  const unit = eligible.find((u) => u.id === unitId);
  const existing = useApi<{ restructurings: Restructuring[] }>(
    "/restructurings",
    open && unit?.hasRestructuring === true,
  );
  const plan = existing.data?.restructurings.find(
    (r) => r.unitId === unitId && r.status === "active",
  );

  const create = useAction(
    (value: z.infer<typeof restructureSchema>) =>
      post("/restructurings", {
        unitId,
        installments: Number(value.installments),
        interestPct: Number(value.interestPct.replace(",", ".")),
        firstDueDate: value.firstDueDate,
        note: value.note || null,
      }),
    {
      invalidate: ["/restructurings", "/reports"],
      success: "Borç yapılandırıldı",
      onDone: () => setOpen(false),
    },
  );

  const form = useAppForm({
    defaultValues: {
      installments: "6",
      interestPct: "0",
      firstDueDate: today(),
      note: "",
    },
    ...validate(restructureSchema),
    onSubmit: ({ value }) => create.mutateAsync(value),
  });

  /* Önizleme, kullanıcı yazdıkça sunucudan gelir; form değerlerine abone. */
  const draft = useSelector(form.store, (state) => state.values);
  const query = new URLSearchParams({
    unitId,
    installments: draft.installments,
    interestPct: draft.interestPct,
    firstDueDate: draft.firstDueDate,
  });
  const preview = useApi<RestructurePreview>(
    `/restructurings/preview?${query}`,
    open && unitId !== "" && !unit?.hasRestructuring && Number(draft.installments) >= 1,
  );

  const cancel = useAction(() => del(`/restructurings/${plan?.id}`), {
    invalidate: ["/restructurings", "/reports"],
    success: "Yapılandırma kaldırıldı",
    onDone: () => setOpen(false),
  });

  if (eligible.length === 0) return null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <CalendarClock className="size-4" /> Borç yapılandır
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Borç yapılandır</DialogTitle>
          <DialogDescription>
            Borç aylara bölünür; her ay yalnızca o ayın taksiti istenir. İstenirse vade
            farkı eklenir. Yapılandırma yürürlükteyken gecikme tazminatı taksit vadelerine
            göre işler.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <Field label="Daire">
            <Select value={unitId} onValueChange={setUnitId}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Daire seçin" />
              </SelectTrigger>
              <SelectContent>
                {eligible.map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    {u.block} {u.no} · {money(u.balanceCents)}
                    {u.hasRestructuring ? " · taksitte" : " borç"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          {plan ? (
            <>
              <div className="grid gap-1 rounded-lg border bg-muted/40 px-3 py-2 text-sm">
                <div className="flex justify-between text-muted-foreground">
                  <span>
                    {plan.installments} taksit · %{plan.interestPct} vade farkı
                  </span>
                  <Money cents={plan.totalCents} />
                </div>
                <p className="text-muted-foreground text-xs">
                  {date(plan.rows[0]?.dueDate ?? "")} –{" "}
                  {date(plan.rows.at(-1)?.dueDate ?? "")} · aylık{" "}
                  {money(plan.rows[0]?.amountCents ?? 0)}
                  {plan.note ? ` · ${plan.note}` : ""}
                </p>
              </div>
              <DialogActions>
                <ConfirmDialog
                  trigger={
                    <Button variant="outline" disabled={cancel.isPending}>
                      Yapılandırmayı kaldır
                    </Button>
                  }
                  title="Yapılandırma kaldırılsın mı?"
                  description="Taksit planı silinecek, vade farkı geri alınacak ve borcun tamamı yeniden bu ay istenecek. Gecikme tazminatı aidatların kendi vadelerine göre işlemeye devam eder. Ödemeler etkilenmez."
                  confirmLabel="Kaldır"
                  destructive
                  onConfirm={() => cancel.mutate(undefined)}
                />
              </DialogActions>
            </>
          ) : (
            <Form form={form} className="grid gap-4">
              {unit && (
                <p className="text-muted-foreground text-sm">
                  Yapılandırılacak borç: <Money cents={unit.balanceCents} /> (işlemiş
                  gecikme tazminatı dahil)
                </p>
              )}

              <div className="grid gap-4 sm:grid-cols-2">
                <form.AppField name="installments">
                  {(f) => (
                    <f.TextField label="Taksit sayısı" type="number" min={1} max={60} />
                  )}
                </form.AppField>
                <form.AppField name="interestPct">
                  {(f) => (
                    <f.TextField
                      label="Vade farkı (%)"
                      hint="0 → yalnızca taksitlendirme"
                      inputMode="decimal"
                    />
                  )}
                </form.AppField>
              </div>

              <form.AppField name="firstDueDate">
                {(f) => <f.TextField label="İlk taksit vadesi" type="date" />}
              </form.AppField>

              <form.AppField name="note">
                {(f) => (
                  <f.TextField
                    label="Not"
                    placeholder="Sakinle görüşülerek kararlaştırıldı"
                  />
                )}
              </form.AppField>

              {preview.data && (
                <div className="grid gap-1 rounded-lg border bg-muted/40 px-3 py-2 text-sm">
                  <div className="flex justify-between text-muted-foreground">
                    <span>Anapara</span>
                    <Money cents={preview.data.principalCents} />
                  </div>
                  {preview.data.interestCents > 0 && (
                    <div className="flex justify-between text-muted-foreground">
                      <span>Vade farkı</span>
                      <Money cents={preview.data.interestCents} />
                    </div>
                  )}
                  <div className="flex justify-between border-t pt-1 font-medium">
                    <span>Aylık taksit</span>
                    <Money cents={preview.data.rows[0]?.amountCents ?? 0} />
                  </div>
                  <p className="text-muted-foreground text-xs">
                    {preview.data.rows.length} taksit ·{" "}
                    {date(preview.data.rows[0]?.dueDate ?? "")} –{" "}
                    {date(preview.data.rows.at(-1)?.dueDate ?? "")} · toplam{" "}
                    {money(preview.data.totalCents)}
                  </p>
                </div>
              )}

              <DialogActions>
                <form.AppForm>
                  <form.Submit disabled={!unitId}>Yapılandır</form.Submit>
                </form.AppForm>
              </DialogActions>
            </Form>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
