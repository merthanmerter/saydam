import { useNavigate } from "@tanstack/react-router";
import { Banknote, Calculator, CircleAlert } from "lucide-react";
import { useMemo, useTransition } from "react";
import { EmptyState, Money, PageHeader, Stat } from "@/app/components/bits";
import { type Column, DataTable } from "@/app/components/data-table";
import { PeriodPicker } from "@/app/components/inputs";
import { duesRoute } from "@/app/router";
import { useSession } from "@/app/session";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { post, useAction, usePaged, useSuspenseApi } from "@/lib/api";
import { date, dateTime, money, periodLabel } from "@/lib/format";
import {
  type Budget,
  type Due,
  PAYERS,
  SHARE_METHODS,
  type Site,
  type UnitsSummary,
} from "@/lib/types";

const SOURCE_LABEL = {
  recurring: "Düzenli",
  one_off: "Olağanüstü",
  system: "Platform",
} as const;

export default function Dues() {
  const { isAdmin } = useSession();
  // Dönem adres çubuğunda: geri tuşu çalışır, bağlantı paylaşılabilir ve
  // rotanın loader'ı hangi dönemin verisini ısıtacağını buradan bilir.
  const { donem: period } = duesRoute.useSearch();
  const navigate = useNavigate();
  const [, startTransition] = useTransition();
  const setPeriod = (donem: number) =>
    startTransition(() => void navigate({ to: "/panel/aidatlar", search: { donem } }));
  const budget = useSuspenseApi<Budget>(`/budget/${period}`);
  const dues = usePaged<Due>(`/dues?period=${period}`);
  const site = useSuspenseApi<{ summary: UnitsSummary; site: Site }>("/site");
  const dueColumns = useMemo(() => duesColumns(isAdmin), [isAdmin]);

  const summary = site.data?.summary;
  const unitCount = summary?.unitCount ?? 0;

  const run = useAction(() => post("/dues/run", { period }), {
    invalidate: ["/dues", "/budget", "/reports"],
    success: "Aidat tahakkuk ettirildi",
  });

  return (
    <>
      <PageHeader
        title="Aidatlar"
        description="Her gider kalemi kendi yöntemine göre dağıtılır: kapıcı gibi kalemler eşit, bakım-onarım ve sigorta arsa payı oranında (KMK m.20)."
        actions={
          <>
            <PeriodPicker value={period} onChange={setPeriod} />
            {isAdmin && (
              <Button
                disabled={run.isPending || !budget.data?.totalCents || unitCount === 0}
                onClick={() => run.mutate(undefined)}
              >
                <Calculator className="size-4" />
                {budget.data?.run ? "Yeniden hesapla" : "Tahakkuk ettir"}
              </Button>
            )}
          </>
        }
      />

      {isAdmin && unitCount === 0 && (
        <Alert variant="destructive" className="mb-5">
          <CircleAlert />
          <AlertDescription>
            Daire tanımlanmadan aidat tahakkuk ettirilemez.
          </AlertDescription>
        </Alert>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Dönem gideri"
          value={money(budget.data?.totalCents ?? 0)}
          hint={periodLabel(period)}
        />
        <Stat label="Düzenli" value={money(budget.data?.recurringCents ?? 0)} />
        <Stat
          label="Olağanüstü"
          value={money(budget.data?.oneOffCents ?? 0)}
          hint="Taksitler dahil"
        />
        <Stat
          label="Daire başına ortalama"
          value={money(
            unitCount > 0 ? Math.round((budget.data?.totalCents ?? 0) / unitCount) : 0,
          )}
          hint={`${unitCount} daire`}
        />
      </div>

      <Tabs defaultValue="lines" className="mt-6">
        <TabsList>
          <TabsTrigger value="lines">Dönem kalemleri</TabsTrigger>
          <TabsTrigger value="dues">Daire aidatları</TabsTrigger>
        </TabsList>

        <TabsContent value="lines" className="mt-4">
          <DataTable
            columns={lineColumns}
            rows={budget.data?.lines ?? []}
            empty={
              <EmptyState
                icon={Calculator}
                title="Bu dönemde aidata yansıyacak gider yok"
                description={
                  isAdmin
                    ? "Düzenli bütçe kalemi tanımlayın ya da bu döneme bir gider girin."
                    : "Yönetim bu dönem için henüz kalem tanımlamadı."
                }
              />
            }
          />

          {isAdmin && budget.data?.run && (
            <p className="mt-3 text-muted-foreground text-xs">
              Son tahakkuk: {dateTime(budget.data.run.createdAt)} ·{" "}
              {money(budget.data.run.totalCents)}
            </p>
          )}
        </TabsContent>

        <TabsContent value="dues" className="mt-4">
          <DataTable
            columns={dueColumns}
            rows={dues.items}
            paging={dues}
            empty={
              <EmptyState
                icon={Banknote}
                title="Bu dönem için tahakkuk yok"
                description={
                  isAdmin
                    ? "Dönem kalemlerini kontrol edip tahakkuk ettirin."
                    : "Yönetim bu dönemin aidatını henüz hesaplamadı."
                }
              />
            }
          />
        </TabsContent>
      </Tabs>
    </>
  );
}

type BudgetLine = Budget["lines"][number];

const lineColumns: Column<BudgetLine>[] = [
  {
    accessorKey: "title",
    header: "Kalem",
    cell: ({ row }) => (
      <>
        <div className="font-medium">{row.original.title}</div>
        {row.original.detail && (
          <div className="text-muted-foreground text-xs">{row.original.detail}</div>
        )}
      </>
    ),
  },
  {
    accessorKey: "source",
    header: "Tür",
    cell: ({ row }) => (
      <Badge variant="secondary">{SOURCE_LABEL[row.original.source]}</Badge>
    ),
  },
  {
    accessorKey: "shareMethod",
    header: "Paylaşım",
    cell: ({ row }) => (
      <span className="text-muted-foreground text-sm">
        {SHARE_METHODS.find((m) => m.id === row.original.shareMethod)?.label}
      </span>
    ),
  },
  {
    accessorKey: "payer",
    header: "Yükümlü",
    cell: ({ row }) => (
      <span className="text-muted-foreground text-sm">
        {PAYERS.find((p) => p.id === row.original.payer)?.label}
      </span>
    ),
  },
  {
    accessorKey: "amountCents",
    header: "Tutar",
    meta: { align: "right" },
    cell: ({ row }) => <Money cents={row.original.amountCents} className="font-medium" />,
  },
];

/** Sakin yalnızca kendi dairelerini gördüğü için "Sakin" sütunu ona kapalı. */
const duesColumns = (isAdmin: boolean): Column<Due>[] => [
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
          accessorKey: "residentName",
          header: "Sakin",
          cell: ({ row }) => (
            <span className="text-muted-foreground text-sm">
              {row.original.residentName ?? "—"}
            </span>
          ),
        } satisfies Column<Due>,
      ]
    : []),
  {
    accessorKey: "dueDate",
    header: "Son ödeme",
    cell: ({ row }) => (
      <span className="text-muted-foreground text-sm">{date(row.original.dueDate)}</span>
    ),
  },
  {
    accessorKey: "amountCents",
    header: "Aidat",
    meta: { align: "right" },
    cell: ({ row }) => (
      <>
        <Money cents={row.original.amountCents} className="font-medium" />
        {row.original.breakdown.length > 0 && (
          <div className="mt-0.5 text-muted-foreground text-xs">
            {row.original.breakdown.length} kalem
          </div>
        )}
      </>
    ),
  },
];
