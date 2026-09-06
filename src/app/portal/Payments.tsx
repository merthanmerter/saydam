import { useNavigate } from "@tanstack/react-router";
import { Banknote, CalendarClock, CreditCard, Landmark, Wallet } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  AmountInput,
  DialogActions,
  EmptyState,
  Field,
  Money,
  PageHeader,
} from "@/app/components/bits";
import { ConfirmDialog } from "@/app/components/confirm";
import { actionsColumn, type Column, DataTable } from "@/app/components/data-table";
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
import { Input } from "@/components/ui/input";
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
  post,
  useAction,
  useApi,
  usePaged,
  useSuspenseApi,
} from "@/lib/api";
import { date, fromCents, money, toCents, today } from "@/lib/format";
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
  const columns = useMemo(() => paymentColumns(isAdmin), [isAdmin]);
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
const paymentColumns = (isAdmin: boolean): Column<Payment>[] => [
  {
    id: "date",
    header: "Tarih",
    cell: ({ row }) => (
      <span className="whitespace-nowrap text-muted-foreground text-sm">
        {date(row.original.paidAt ?? row.original.createdAt)}
      </span>
    ),
  },
  {
    id: "unit",
    header: "Daire",
    cell: ({ row }) => (
      <span className="font-medium">
        {row.original.block && `${row.original.block} `}
        {row.original.no}
      </span>
    ),
  },
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
  {
    accessorKey: "amountCents",
    header: "Tutar",
    meta: { align: "right" },
    cell: ({ row }) => <Money cents={row.original.amountCents} className="font-medium" />,
  },
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
    ? [actionsColumn<Payment>(({ row }) => <PaymentActions payment={row.original} />)]
    : []),
];

function PaymentActions({ payment }: { payment: Payment }) {
  const decide = useAction(
    (status: "confirmed" | "rejected") =>
      post(`/payments/${payment.id}/decide`, { status, note: null }),
    { invalidate: ["/payments", "/reports"], success: "Ödeme güncellendi" },
  );

  if (payment.status !== "pending") return null;

  return (
    <RowActions
      actions={[
        {
          label: "Onayla",
          disabled: decide.isPending,
          onSelect: () => decide.mutate("confirmed"),
        },
        {
          label: "Reddet",
          destructive: true,
          disabled: decide.isPending,
          onSelect: () => decide.mutate("rejected"),
          confirm: {
            title: "Ödeme reddedilsin mi?",
            description:
              "Bildirim reddedilir, kasaya işlenmez ve daire borcu olduğu gibi kalır. Sakin yeniden bildirim yapabilir.",
            confirmLabel: "Reddet",
          },
        },
      ]}
    />
  );
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
  const [form, setForm] = useState({
    unitId: units[0]?.id ?? "",
    amount: fromCents(Math.max(units[0]?.dueNowCents ?? 0, 0)),
    paidAt: today(),
    reference: "",
  });

  const declare = useAction(
    () =>
      post("/payments/declare", {
        unitId: form.unitId,
        amountCents: toCents(form.amount),
        paidAt: form.paidAt,
        reference: form.reference || null,
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
        <form
          className="grid gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            declare.mutate(undefined);
          }}
        >
          <Field label="Daire">
            <UnitSelect
              units={units}
              value={form.unitId}
              onChange={(unitId) => setForm({ ...form, unitId })}
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Tutar">
              <AmountInput
                required
                value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value })}
              />
            </Field>
            <Field label="Ödeme tarihi">
              <Input
                type="date"
                required
                value={form.paidAt}
                onChange={(e) => setForm({ ...form, paidAt: e.target.value })}
              />
            </Field>
          </div>
          <Field label="Açıklama / referans">
            <Input
              value={form.reference}
              onChange={(e) => setForm({ ...form, reference: e.target.value })}
            />
          </Field>
          <Field label="Dekont (isteğe bağlı)">
            <FileUpload
              folder="dekontlar"
              value={receipt}
              onChange={setReceipt}
              label="Dekont yükle"
            />
          </Field>
          <DialogActions>
            <Button type="submit" disabled={declare.isPending || !form.unitId}>
              Bildir
            </Button>
          </DialogActions>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function OnlinePayDialog({ units, feePct }: { units: Balance[]; feePct: number }) {
  const [open, setOpen] = useState(false);
  const [unitId, setUnitId] = useState(units[0]?.id ?? "");
  const [amount, setAmount] = useState(fromCents(Math.max(units[0]?.dueNowCents ?? 0, 0)));

  const amountCents = toCents(amount);
  /** Komisyon farkı borcun üstüne eklenir; sakin ne ödeyeceğini önden görür. */
  const feeCents = feePct > 0 ? Math.round((amountCents * feePct) / 100) : 0;

  const checkout = useAction<undefined, { paymentPageUrl: string }>(
    () => post("/payments/checkout", { unitId, amountCents: toCents(amount) }),
    { onDone: (result) => window.location.assign(result.paymentPageUrl) },
  );

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
        <form
          className="grid gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            checkout.mutate(undefined);
          }}
        >
          <Field label="Daire">
            <UnitSelect units={units} value={unitId} onChange={setUnitId} />
          </Field>
          <Field label="Tutar">
            <AmountInput
              required
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </Field>

          {feeCents > 0 && (
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
          )}

          <DialogActions>
            <Button type="submit" disabled={checkout.isPending || !unitId}>
              {checkout.isPending ? "Yönlendiriliyor…" : "Ödemeye geç"}
            </Button>
          </DialogActions>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ManualPaymentDialog() {
  const [open, setOpen] = useState(false);
  const balances = useSuspenseApi<Paged<Balance>>("/reports/balances?size=500");
  const [form, setForm] = useState({
    unitId: "",
    amount: "",
    method: "transfer" as "transfer" | "cash",
    paidAt: today(),
    reference: "",
  });

  const create = useAction(
    () =>
      post("/payments", {
        unitId: form.unitId,
        amountCents: toCents(form.amount),
        method: form.method,
        paidAt: form.paidAt,
        reference: form.reference || null,
        note: null,
      }),
    {
      invalidate: ["/payments", "/reports"],
      success: "Tahsilat kaydedildi",
      onDone: () => setOpen(false),
    },
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Banknote className="size-4" /> Tahsilat gir
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Tahsilat kaydı</DialogTitle>
          <DialogDescription>
            Elden ya da hesabınıza geçen ödemeyi doğrudan işleyin.
          </DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            create.mutate(undefined);
          }}
        >
          <Field label="Daire">
            <UnitSelect
              withResident
              units={balances.data.items ?? []}
              value={form.unitId}
              onChange={(unitId) => setForm({ ...form, unitId })}
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Tutar">
              <AmountInput
                required
                value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value })}
              />
            </Field>
            <Field label="Yöntem">
              <Select
                value={form.method}
                onValueChange={(method) =>
                  setForm({ ...form, method: method as "transfer" | "cash" })
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="transfer">Havale/EFT</SelectItem>
                  <SelectItem value="cash">Nakit</SelectItem>
                </SelectContent>
              </Select>
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Ödeme tarihi">
              <Input
                type="date"
                required
                value={form.paidAt}
                onChange={(e) => setForm({ ...form, paidAt: e.target.value })}
              />
            </Field>
            <Field label="Açıklama">
              <Input
                value={form.reference}
                onChange={(e) => setForm({ ...form, reference: e.target.value })}
              />
            </Field>
          </div>
          <DialogActions>
            <Button type="submit" disabled={create.isPending || !form.unitId}>
              Kaydet
            </Button>
          </DialogActions>
        </form>
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
  const [unitId, setUnitId] = useState(eligible[0]?.id ?? "");
  const [installments, setInstallments] = useState("6");
  const [interestPct, setInterestPct] = useState("0");
  const [firstDueDate, setFirstDueDate] = useState(today());
  const [note, setNote] = useState("");

  const unit = eligible.find((u) => u.id === unitId);
  const existing = useApi<{ restructurings: Restructuring[] }>(
    "/restructurings",
    open && unit?.hasRestructuring === true,
  );
  const plan = existing.data?.restructurings.find(
    (r) => r.unitId === unitId && r.status === "active",
  );

  const query = new URLSearchParams({ unitId, installments, interestPct, firstDueDate });
  const preview = useApi<RestructurePreview>(
    `/restructurings/preview?${query}`,
    open && unitId !== "" && !unit?.hasRestructuring && Number(installments) >= 1,
  );

  const create = useAction(
    () =>
      post("/restructurings", {
        unitId,
        installments: Number(installments) || 1,
        interestPct: Number(interestPct.replace(",", ".")) || 0,
        firstDueDate,
        note: note || null,
      }),
    {
      invalidate: ["/restructurings", "/reports"],
      success: "Borç yapılandırıldı",
      onDone: () => setOpen(false),
    },
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
            <form
              className="grid gap-4"
              onSubmit={(event) => {
                event.preventDefault();
                create.mutate(undefined);
              }}
            >
              {unit && (
                <p className="text-muted-foreground text-sm">
                  Yapılandırılacak borç: <Money cents={unit.balanceCents} /> (işlemiş
                  gecikme tazminatı dahil)
                </p>
              )}

              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Taksit sayısı">
                  <Input
                    type="number"
                    min={1}
                    max={60}
                    value={installments}
                    onChange={(e) => setInstallments(e.target.value)}
                  />
                </Field>
                <Field label="Vade farkı (%)" hint="0 → yalnızca taksitlendirme">
                  <Input
                    inputMode="decimal"
                    value={interestPct}
                    onChange={(e) => setInterestPct(e.target.value)}
                  />
                </Field>
              </div>

              <Field label="İlk taksit vadesi">
                <Input
                  type="date"
                  required
                  value={firstDueDate}
                  onChange={(e) => setFirstDueDate(e.target.value)}
                />
              </Field>

              <Field label="Not">
                <Input
                  placeholder="Sakinle görüşülerek kararlaştırıldı"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                />
              </Field>

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
                <Button type="submit" disabled={create.isPending || !unitId}>
                  Yapılandır
                </Button>
              </DialogActions>
            </form>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
