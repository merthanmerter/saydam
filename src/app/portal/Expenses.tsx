import { useNavigate } from "@tanstack/react-router";
import { CalendarSync, FileText, Layers, Plus, Receipt } from "lucide-react";
import { useMemo, useState, useTransition } from "react";
import type { z } from "zod";
import { DialogActions, EmptyState, Field, Money, PageHeader } from "@/app/components/bits";
import { actionsColumn, type Column, DataTable } from "@/app/components/data-table";
import { Form, useAppForm, validate } from "@/app/components/form";
import { FileUpload, PeriodPicker, type UploadedFile } from "@/app/components/inputs";
import { RowActions } from "@/app/components/row-actions";
import { expensesRoute } from "@/app/router";
import { useSession } from "@/app/session";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { del, patch, post, useAction, usePaged, useSuspenseApi } from "@/lib/api";
import {
  currentPeriod,
  date,
  fromCents,
  money,
  periodLabel,
  toCents,
  today,
} from "@/lib/format";
import { expenseSchema } from "@/lib/schemas";
import {
  type Expense,
  PAYERS,
  type Payer,
  type Recurring,
  SHARE_METHODS,
  type ShareMethod,
} from "@/lib/types";

const KIND_LABEL: Record<Expense["kind"], string> = {
  budgeted: "Düzenli",
  one_off: "Olağanüstü",
  system: "Platform",
};

export default function Expenses() {
  const { isAdmin } = useSession();
  // Yıl adres çubuğunda: geri tuşu çalışır ve rotanın loader'ı hangi yılın
  // verisini ısıtacağını buradan bilir.
  const { yil: year } = expensesRoute.useSearch();
  const navigate = useNavigate();
  const [, startTransition] = useTransition();
  const setYear = (yil: number) =>
    startTransition(() => void navigate({ to: "/panel/giderler", search: { yil } }));
  const expenses = usePaged<Expense>(`/expenses?year=${year}`);
  const recurring = useSuspenseApi<{ recurring: Recurring[] }>("/recurring");
  const [editing, setEditing] = useState<Expense | null>(null);
  const expenseCols = useMemo(() => expenseColumns(isAdmin, setEditing), [isAdmin]);
  const recurringCols = useMemo(() => recurringColumns(isAdmin), [isAdmin]);

  return (
    <>
      <PageHeader
        title="Giderler"
        description="Düzenli bütçe kalemleri her ay aidata yansır. Fiilî harcamalar faturasıyla girilir ve kasadan düşer."
        actions={
          isAdmin && <AddExpenseDialog recurring={recurring.data?.recurring ?? []} />
        }
      />

      {editing && (
        <AddExpenseDialog
          key={editing.id}
          recurring={recurring.data?.recurring ?? []}
          expense={editing}
          onClose={() => setEditing(null)}
        />
      )}

      <Tabs defaultValue="actual">
        <TabsList>
          <TabsTrigger value="actual">Fiilî giderler</TabsTrigger>
          <TabsTrigger value="budget">
            Düzenli kalemler
            {recurring.data ? ` (${recurring.data.recurring.length})` : ""}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="actual" className="mt-4">
          <div className="mb-3 flex items-center gap-2">
            <Select value={String(year)} onValueChange={(y) => setYear(Number(y))}>
              <SelectTrigger className="w-[110px]" aria-label="Yıl">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Array.from({ length: 6 }, (_, i) => new Date().getFullYear() - i).map(
                  (y) => (
                    <SelectItem key={y} value={String(y)}>
                      {y}
                    </SelectItem>
                  ),
                )}
              </SelectContent>
            </Select>
            <span className="text-muted-foreground text-sm">
              Toplam:{" "}
              <Money
                cents={(expenses.items ?? []).reduce((sum, e) => sum + e.amountCents, 0)}
                className="font-medium text-foreground"
              />
            </span>
          </div>

          <DataTable
            columns={expenseCols}
            rows={expenses.items}
            paging={expenses}
            empty={
              <EmptyState
                icon={Receipt}
                title="Bu yıl için gider kaydı yok"
                description="Her harcama faturasıyla birlikte kaydedilir; sakinler kalem kalem görebilir."
              />
            }
          />
        </TabsContent>

        <TabsContent value="budget" className="mt-4">
          <DataTable
            columns={recurringCols}
            rows={recurring.data?.recurring ?? []}
            empty={
              <EmptyState
                icon={CalendarSync}
                title="Düzenli gider tanımlı değil"
                description="Kapıcı maaşı, asansör bakımı, elektrik gibi her ay tekrar eden kalemleri buraya girin."
              />
            }
          />
        </TabsContent>
      </Tabs>
    </>
  );
}

const expenseColumns = (
  isAdmin: boolean,
  onEdit: (expense: Expense) => void,
): Column<Expense>[] => [
  {
    accessorKey: "incurredOn",
    header: "Tarih",
    cell: ({ row }) => (
      <span className="whitespace-nowrap text-muted-foreground text-sm">
        {date(row.original.incurredOn)}
      </span>
    ),
  },
  {
    accessorKey: "title",
    header: "Açıklama",
    cell: ({ row }) => (
      <>
        <div className="font-medium">{row.original.title}</div>
        <div className="text-muted-foreground text-xs">
          {[row.original.vendor, row.original.category, row.original.budgetTitle]
            .filter(Boolean)
            .join(" · ")}
        </div>
      </>
    ),
  },
  {
    accessorKey: "kind",
    header: "Tür",
    cell: ({ row }) => (
      <Badge variant={row.original.kind === "one_off" ? "outline" : "secondary"}>
        {KIND_LABEL[row.original.kind]}
      </Badge>
    ),
  },
  {
    accessorKey: "amountCents",
    header: "Tutar",
    meta: { align: "right" },
    cell: ({ row }) => <Money cents={row.original.amountCents} className="font-medium" />,
  },
  {
    id: "allocation",
    header: "Aidata yansıma",
    cell: ({ row }) => (
      <span className="text-muted-foreground text-xs">
        {row.original.kind === "budgeted" ? (
          "Bütçe kaleminden"
        ) : row.original.installments > 1 ? (
          <>
            {row.original.installments} taksit
            {row.original.surchargePct > 0 &&
              ` · %${row.original.surchargePct} işletme payı`}
            <div>
              {periodLabel(row.original.period)} –{" "}
              {periodLabel(row.original.allocations.at(-1)?.period ?? row.original.period)}
            </div>
          </>
        ) : (
          periodLabel(row.original.period)
        )}
      </span>
    ),
  },
  {
    id: "invoice",
    header: "Fatura",
    cell: ({ row }) =>
      row.original.invoiceUrl ? (
        <a
          href={row.original.invoiceUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 text-sm underline underline-offset-2"
        >
          <FileText className="size-3.5" /> Görüntüle
        </a>
      ) : (
        <span className="text-muted-foreground text-xs">—</span>
      ),
  },
  ...(isAdmin
    ? [
        actionsColumn<Expense>(({ row }) => (
          <ExpenseActions expense={row.original} onEdit={() => onEdit(row.original)} />
        )),
      ]
    : []),
];

function ExpenseActions({ expense, onEdit }: { expense: Expense; onEdit: () => void }) {
  const remove = useAction(() => del(`/expenses/${expense.id}`), {
    invalidate: ["/expenses", "/budget", "/reports"],
    success: "Gider silindi",
  });

  return (
    <RowActions
      actions={[
        // Platform gideri sistemin kendi kaydı; elle düzeltilmez.
        { label: "Düzelt", onSelect: onEdit, disabled: expense.kind === "system" },
        {
          label: "Sil",
          destructive: true,
          disabled: remove.isPending || expense.kind === "system",
          onSelect: () => remove.mutate(undefined),
          confirm: {
            title: "Gider silinsin mi?",
            description: `"${expense.title}" (${money(expense.amountCents)}) kaydı ve faturası kaldırılacak; kasa bakiyesi buna göre güncellenir.`,
            confirmLabel: "Sil",
          },
        },
      ]}
    />
  );
}

const recurringColumns = (isAdmin: boolean): Column<Recurring>[] => [
  {
    accessorKey: "title",
    header: "Kalem",
    cell: ({ row }) => (
      <>
        <div className="font-medium">{row.original.title}</div>
        {row.original.note && (
          <div className="text-muted-foreground text-xs">{row.original.note}</div>
        )}
      </>
    ),
  },
  {
    accessorKey: "category",
    header: "Kategori",
    cell: ({ row }) => (
      <span className="text-muted-foreground text-sm">{row.original.category}</span>
    ),
  },
  {
    id: "share",
    header: "Paylaşım",
    cell: ({ row }) => (
      <div className="flex flex-wrap gap-1">
        <Badge variant="outline">
          {SHARE_METHODS.find((m) => m.id === row.original.shareMethod)?.label}
        </Badge>
        <Badge variant="outline">
          {PAYERS.find((p) => p.id === row.original.payer)?.label}
        </Badge>
      </div>
    ),
  },
  {
    accessorKey: "amountCents",
    header: "Aylık tutar",
    meta: { align: "right" },
    cell: ({ row }) => <Money cents={row.original.amountCents} className="font-medium" />,
  },
  {
    id: "validity",
    header: "Geçerlilik",
    cell: ({ row }) => (
      <span className="text-muted-foreground text-sm">
        {periodLabel(row.original.startPeriod)} –{" "}
        {row.original.endPeriod ? periodLabel(row.original.endPeriod) : "süresiz"}
      </span>
    ),
  },
  ...(isAdmin
    ? [actionsColumn<Recurring>(({ row }) => <RecurringActions item={row.original} />)]
    : []),
];

function RecurringActions({ item }: { item: Recurring }) {
  const remove = useAction(() => del(`/recurring/${item.id}`), {
    invalidate: ["/recurring", "/budget"],
    success: "Kalem silindi",
  });

  return (
    <RowActions
      actions={[
        {
          label: "Sil",
          destructive: true,
          disabled: remove.isPending,
          onSelect: () => remove.mutate(undefined),
          confirm: {
            title: "Bütçe kalemi silinsin mi?",
            description: `"${item.title}" bundan sonraki dönemlerde aidata yansımayacak. Geçmiş tahakkuklar değişmez.`,
            confirmLabel: "Sil",
          },
        },
      ]}
    />
  );
}

/**
 * Gider ekleme. Tek düğme, tür diyaloğun içinde seçilir.
 *
 *   Düzenli    → her ay tekrar eden bütçe kalemi. Ya yeni bir kalem tanımlanır
 *                (plan; henüz fatura yok) ya da var olan bir keleme o dönemin
 *                faturası işlenir. Bütçe kalemine mahsup edilen fatura aidata
 *                ikinci kez yansımaz.
 *   Olağanüstü → tek seferlik harcama. Faturasıyla girilir, istenirse aylara
 *                bölünür ve üzerine işletme payı eklenir.
 */
/**
 * Gider ekleme ve düzeltme.
 *
 * `expense` verildiğinde form o kaydın değerleriyle açılır, tetikleyici düğme
 * çizilmez ve tür/kalem seçimleri kilitlenir: bir gideri düzeltmek onu başka
 * bir türe çevirmek değildir. Tahakkuka yansımış gideri sunucu reddeder.
 */
function AddExpenseDialog({
  recurring,
  expense,
  onClose,
}: {
  recurring: Recurring[];
  expense?: Expense;
  onClose?: () => void;
}) {
  const editing = expense !== undefined;
  const [open, setOpen] = useState(editing);
  const [kind, setKind] = useState<"recurring" | "one_off">(
    expense?.kind === "one_off" ? "one_off" : "recurring",
  );
  /** Düzenli dalında hangi bütçe kalemi: "new" → yeni kalem tanımla. */
  const [budgetLine, setBudgetLine] = useState(expense?.recurringExpenseId ?? "new");
  const [invoice, setInvoice] = useState<UploadedFile | null>(
    expense?.invoiceUrl
      ? { url: expense.invoiceUrl, name: expense.invoiceName ?? "fatura", size: 0 }
      : null,
  );

  /** Yeni bütçe kalemi tanımlanıyor: fatura beklenmez, kayıt plana yazılır. */
  const definingLine = !editing && kind === "recurring" && budgetLine === "new";
  const oneOff = kind === "one_off";
  const ready = definingLine || invoice !== null;

  const create = useAction(
    (value: z.infer<typeof expenseSchema>) => {
      const amountCents = toCents(value.amount);
      const installments = Number(value.installments);
      const surcharge = Number(value.surchargePct.replace(",", "."));
      if (editing) {
        return patch(`/expenses/${expense.id}`, {
          title: value.title,
          category: value.category,
          vendor: value.vendor || null,
          amountCents,
          incurredOn: value.incurredOn,
          period: value.period,
          recurringExpenseId: expense.recurringExpenseId,
          shareMethod: value.shareMethod,
          payer: value.payer,
          installments: expense.kind === "one_off" ? installments : 1,
          surchargePct: expense.kind === "one_off" ? surcharge : 0,
          invoiceUrl: invoice?.url,
          invoiceName: invoice?.name,
          note: value.note || null,
        });
      }
      return definingLine
        ? post("/recurring", {
            title: value.title,
            category: value.category,
            amountCents,
            shareMethod: value.shareMethod,
            payer: value.payer,
            startPeriod: value.startPeriod,
            endPeriod: null,
            note: value.note || null,
          })
        : post("/expenses", {
            title: value.title,
            category: value.category,
            vendor: value.vendor || null,
            amountCents,
            incurredOn: value.incurredOn,
            period: value.period,
            recurringExpenseId: oneOff ? null : budgetLine,
            shareMethod: value.shareMethod,
            payer: value.payer,
            installments: oneOff ? installments : 1,
            surchargePct: oneOff ? surcharge : 0,
            invoiceUrl: invoice?.url,
            invoiceName: invoice?.name,
            note: value.note || null,
          });
    },
    {
      invalidate: ["/recurring", "/expenses", "/budget", "/reports"],
      success: editing
        ? "Gider düzeltildi"
        : definingLine
          ? "Bütçe kalemi eklendi"
          : "Gider kaydedildi",
      onDone: () => close(),
    },
  );

  const form = useAppForm({
    defaultValues: {
      title: expense?.title ?? "",
      category: expense?.category ?? "genel",
      vendor: expense?.vendor ?? "",
      amount: expense ? fromCents(expense.amountCents) : "",
      incurredOn: (expense?.incurredOn ?? today()).slice(0, 10),
      period: expense?.period ?? currentPeriod(),
      startPeriod: expense?.period ?? currentPeriod(),
      shareMethod: expense?.shareMethod ?? "arsa_payi",
      payer: expense?.payer ?? "malik",
      installments: String(expense?.installments ?? 1),
      surchargePct: String(expense?.surchargePct ?? 0),
      note: expense?.note ?? "",
    } as z.infer<typeof expenseSchema>,
    ...validate(expenseSchema),
    onSubmit: ({ value }) => create.mutateAsync(value),
  });

  const close = () => {
    setOpen(false);
    onClose?.();
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) return close();
        setOpen(true);
        if (!editing) {
          form.reset();
          setInvoice(null);
          setBudgetLine("new");
        }
      }}
    >
      {!editing && (
        <DialogTrigger asChild>
          <Button>
            <Plus className="size-4" /> Gider ekle
          </Button>
        </DialogTrigger>
      )}
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{editing ? "Gideri düzelt" : "Gider ekle"}</DialogTitle>
          <DialogDescription>
            {editing
              ? "Tahakkuka yansımış bir gider değiştirilemez; önce o dönemi yeniden hesaplayın."
              : definingLine
                ? "Her ay tekrar eden bütçe kalemi. Belirtilen dönemden itibaren aidata otomatik yansır."
                : "Fatura zorunludur. Bir bütçe kalemine mahsup edilen gider aidata tekrar yansımaz."}
          </DialogDescription>
        </DialogHeader>
        <Form form={form} className="grid gap-4">
          {/* Tür ve bütçe kalemi hangi alanların görüneceğini belirler; form
              verisi değil, ekran durumudur. Düzeltmede ikisi de sabit. */}
          {!editing && (
            <Field label="Tür">
              <Tabs
                value={kind}
                onValueChange={(next) => setKind(next as typeof kind)}
                className="w-full"
              >
                <TabsList className="w-full">
                  <TabsTrigger value="recurring" className="flex-1">
                    <CalendarSync className="size-4" /> Düzenli
                  </TabsTrigger>
                  <TabsTrigger value="one_off" className="flex-1">
                    <Layers className="size-4" /> Olağanüstü
                  </TabsTrigger>
                </TabsList>
              </Tabs>
            </Field>
          )}

          {!editing && kind === "recurring" && (
            <Field
              label="Bütçe kalemi"
              hint={
                definingLine
                  ? "Yeni bir düzenli kalem tanımlanır; faturası sonra girilir."
                  : "Bu faturanın mahsup edileceği kalem."
              }
            >
              <Select value={budgetLine} onValueChange={setBudgetLine}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="new">Yeni kalem tanımla</SelectItem>
                  {recurring.map((item) => (
                    <SelectItem key={item.id} value={item.id}>
                      {item.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          )}

          <form.AppField name="title">
            {(f) => (
              <f.TextField
                label={definingLine ? "Kalem adı" : "Açıklama"}
                placeholder={definingLine ? "Kapıcı maaşı" : "Çatı yalıtım işi"}
              />
            )}
          </form.AppField>

          <div className="grid gap-4 sm:grid-cols-2">
            <form.AppField name="amount">
              {(f) => <f.MoneyField label={definingLine ? "Aylık tutar" : "Tutar"} />}
            </form.AppField>
            {definingLine ? (
              <form.AppField name="category">
                {(f) => <f.TextField label="Kategori" />}
              </form.AppField>
            ) : (
              <form.AppField name="incurredOn">
                {(f) => <f.TextField label="Fatura tarihi" type="date" />}
              </form.AppField>
            )}
          </div>

          {!definingLine && (
            <div className="grid gap-4 sm:grid-cols-2">
              <form.AppField name="vendor">
                {(f) => <f.TextField label="Tedarikçi" />}
              </form.AppField>
              <form.AppField name="category">
                {(f) => <f.TextField label="Kategori" />}
              </form.AppField>
            </div>
          )}

          <form.AppField name={definingLine ? "startPeriod" : "period"}>
            {(f) => (
              <f.ChoiceField
                label={definingLine ? "Başlangıç dönemi" : "Yansıtılacak dönem"}
              >
                {() => (
                  <PeriodPicker
                    value={f.state.value as unknown as number}
                    onChange={(period) => f.handleChange(period as never)}
                  />
                )}
              </f.ChoiceField>
            )}
          </form.AppField>

          {(definingLine || oneOff) && (
            <>
              <form.AppField name="shareMethod">
                {(f) => (
                  <ShareMethodField
                    value={f.state.value}
                    onChange={(next) => f.handleChange(next)}
                  />
                )}
              </form.AppField>
              <form.AppField name="payer">
                {(f) => (
                  <PayerField
                    value={f.state.value}
                    onChange={(next) => f.handleChange(next)}
                  />
                )}
              </form.AppField>
            </>
          )}

          {oneOff && (
            <div className="grid gap-4 rounded-lg border bg-muted/40 p-3 sm:grid-cols-2">
              <form.AppField name="installments">
                {(f) => (
                  <f.TextField label="Kaç aya bölünsün?" type="number" min={1} max={120} />
                )}
              </form.AppField>
              <form.AppField name="surchargePct">
                {(f) => (
                  <f.TextField label="İşletme / sermaye payı (%)" inputMode="decimal" />
                )}
              </form.AppField>
              <form.Subscribe selector={(state) => state.values}>
                {(values) => {
                  const cents = toCents(values.amount);
                  const count = Math.max(1, Number(values.installments) || 1);
                  const pct = Math.max(
                    0,
                    Number(values.surchargePct.replace(",", ".")) || 0,
                  );
                  const per = cents > 0 ? Math.round((cents * (1 + pct / 100)) / count) : 0;
                  if (per === 0) return null;
                  return (
                    <p className="text-muted-foreground text-xs sm:col-span-2">
                      {count > 1 ? `${count} ay boyunca ` : ""}aylık{" "}
                      <Money cents={per} className="font-medium text-foreground" /> aidata
                      eklenir · {periodLabel(values.period)} döneminden itibaren
                    </p>
                  );
                }}
              </form.Subscribe>
            </div>
          )}

          {!definingLine && (
            <Field label="Fatura" hint="PDF veya görsel, en fazla 20 MB">
              <FileUpload
                folder="faturalar"
                value={invoice}
                onChange={setInvoice}
                label="Fatura yükle"
              />
            </Field>
          )}

          <form.AppField name="note">
            {(f) => <f.TextAreaField label="Not" rows={2} />}
          </form.AppField>

          <DialogActions>
            <form.AppForm>
              <form.Submit disabled={!ready}>
                {editing
                  ? "Düzeltmeyi kaydet"
                  : definingLine
                    ? "Bütçe kalemi tanımla"
                    : ready
                      ? "Gideri kaydet"
                      : "Önce fatura yükleyin"}
              </form.Submit>
            </form.AppForm>
          </DialogActions>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Yükümlü seçimi. Site yönetimine karşı asıl sorumlu her zaman maliktir
 * (KMK m.20); kiracı kira bedeli kadar müteselsil sorumludur (m.22). Bu alan
 * dairenin toplam borcunu değiştirmez, malik ile kiracı arasındaki paylaşımı
 * gösterir: kullanıma bağlı yan giderler kira sözleşmesi gereği kiracıya
 * aittir (TBK m.303).
 */
function PayerField({
  value,
  onChange,
}: {
  value: Payer;
  onChange: (payer: Payer) => void;
}) {
  const selected = PAYERS.find((p) => p.id === value);
  return (
    <Field label="Yükümlü" hint={selected?.hint}>
      <Select value={value} onValueChange={(next) => onChange(next as Payer)}>
        <SelectTrigger className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {PAYERS.map((payer) => (
            <SelectItem key={payer.id} value={payer.id}>
              {payer.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Field>
  );
}

/**
 * Paylaşım yöntemi seçimi. KMK m.20 gideri türüne göre eşit ya da arsa payı
 * dağıtımını emrediyor; yanlış yöntem seçilen bir kalem, itiraz edildiğinde
 * tüm tahakkuku sakatlar. Bu yüzden seçim gizlenmiyor, her formda görünür.
 */
function ShareMethodField({
  value,
  onChange,
}: {
  value: ShareMethod;
  onChange: (method: ShareMethod) => void;
}) {
  const selected = SHARE_METHODS.find((m) => m.id === value);
  return (
    <Field label="Paylaşım yöntemi" hint={selected?.hint}>
      <Select value={value} onValueChange={(next) => onChange(next as ShareMethod)}>
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
  );
}
