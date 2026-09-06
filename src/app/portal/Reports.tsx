import { Link, useNavigate } from "@tanstack/react-router";
import {
  CalendarCheck,
  Scale,
  TrendingDown,
  TrendingUp,
  Undo2,
  Wallet,
} from "lucide-react";
import { Suspense, useMemo, useTransition } from "react";
import { Money, PageHeader, Stat } from "@/app/components/bits";
import { ConfirmDialog } from "@/app/components/confirm";
import { type Column, DataTable } from "@/app/components/data-table";
import { TableSkeleton } from "@/app/components/skeletons";
import { reportsRoute } from "@/app/router";
import { useSession } from "@/app/session";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { del, post, useAction, usePaged, useSuspenseApi } from "@/lib/api";
import { money, number } from "@/lib/format";
import type { Balance, Treasury, YearEnd } from "@/lib/types";

export default function Reports() {
  return (
    <>
      <PageHeader
        title="Raporlar"
        description="Kasa hareketleri, daire bazlı borç durumu ve yıl sonu mahsuplaşma."
      />
      <Tabs defaultValue="balances">
        <TabsList>
          <TabsTrigger value="balances">Daire bakiyeleri</TabsTrigger>
          <TabsTrigger value="yearend">Yıl sonu mahsuplaşma</TabsTrigger>
        </TabsList>
        <TabsContent value="balances" className="mt-4">
          <BalancesTab />
        </TabsContent>
        <TabsContent value="yearend" className="mt-4">
          {/*
            Bu sekme kendi verisini ilk açılışta çeker. Kendi sınırı olmasaydı
            askıya alınma en yakın sınıra, yani sayfanın tamamına düşer ve
            sekmeye her tıklandığında bütün ekran iskelete dönerdi.
          */}
          <Suspense fallback={<YearEndSkeleton />}>
            <YearEndTab />
          </Suspense>
        </TabsContent>
      </Tabs>
    </>
  );
}

/**
 * Daire bakiyeleri. Kasa göstergeleri de burada: tahsilatın nerede olduğunu
 * anlatan rakamlarla daire bazlı borç aynı ekranda durmalı.
 */
function BalancesTab() {
  const { isAdmin } = useSession();
  const treasury = useSuspenseApi<Treasury>("/reports/treasury");
  const balances = usePaged<Balance, { debtVisibility: string }>("/reports/balances");

  const t = treasury.data;
  /**
   * Alacağın ne kadarı bir yapılandırma kapsamında? O tutar için gecikme
   * tazminatı taksit vadelerine göre işler, aidat vadelerine göre değil —
   * rakamların neden "sakin" göründüğünü söylemek gerekiyor. Toplam kasadan
   * gelir: sakine de site geneli döner, yalnızca kendi payı değil.
   */
  const restructuredCents = t?.restructuredCents ?? 0;
  /** Sakine yalnızca kendi daireleri döner; liste başlıkları buna göre değişir. */
  const ownOnly = !isAdmin && balances.debtVisibility !== "herkes";
  const columns = useMemo(() => balanceColumns(ownOnly), [ownOnly]);

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Stat
          label="Kasa"
          value={money(t?.balanceCents ?? 0)}
          icon={Wallet}
          tone={(t?.balanceCents ?? 0) >= 0 ? "positive" : "negative"}
        />
        <Stat
          label="Tahsil edilen"
          value={money(t?.collectedCents ?? 0)}
          icon={TrendingUp}
        />
        <Stat label="Harcanan" value={money(t?.spentCents ?? 0)} icon={TrendingDown} />
        <Stat label="Tahakkuk" value={money(t?.accruedCents ?? 0)} />
        <Stat
          label="Alacak"
          value={money(t?.receivableCents ?? 0)}
          tone={(t?.receivableCents ?? 0) > 0 ? "warning" : "positive"}
          hint={
            restructuredCents > 0 ? `${money(restructuredCents)} yapılandırmada` : undefined
          }
        />
      </div>

      <div className="mt-4">
        <DataTable columns={columns} rows={balances.items} paging={balances} />
      </div>
    </>
  );
}

/** Yıl sonu sekmesinin kendi iskeleti; sayfanın geri kalanı yerinde kalır. */
function YearEndSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-9 w-[110px]" />
      <Skeleton className="h-[88px] w-full rounded-xl" />
      <TableSkeleton cols={3} rows={6} />
    </div>
  );
}

/** Sakin görünümünde diğer dairelerin sakinleri gösterilmez (KVKK). */
const balanceColumns = (ownOnly: boolean): Column<Balance>[] => [
  {
    id: "unit",
    header: "Daire",
    cell: ({ row }) => (
      <span className="font-medium">
        {row.original.block && `${row.original.block} `}
        {row.original.no}
        {row.original.hasRestructuring && (
          <Link
            to="/panel/odemeler"
            search={{}}
            className="mt-0.5 block text-[var(--warning)] text-xs hover:underline"
          >
            Yapılandırıldı
          </Link>
        )}
      </span>
    ),
  },
  ...(ownOnly
    ? []
    : [
        {
          id: "resident",
          header: "Sakin",
          cell: ({ row }) => (
            <div className="text-muted-foreground text-sm">
              {row.original.tenantName ?? row.original.ownerName ?? "—"}
              {row.original.tenantName && row.original.ownerName && (
                <span className="block text-xs">Malik: {row.original.ownerName}</span>
              )}
            </div>
          ),
        } satisfies Column<Balance>,
      ]),
  {
    accessorKey: "arsaPayi",
    header: "Arsa payı",
    meta: { align: "right" },
    cell: ({ row }) => (
      <span className="tabular text-muted-foreground text-sm">
        {number(row.original.arsaPayi)}
      </span>
    ),
  },
  {
    accessorKey: "accruedCents",
    header: "Tahakkuk",
    meta: { align: "right" },
    cell: ({ row }) => (
      <>
        <Money cents={row.original.accruedCents} />
        {row.original.restructuringInterestCents > 0 && (
          <div className="text-muted-foreground text-xs">
            {money(row.original.restructuringInterestCents)} vade farkı
          </div>
        )}
        {/*
          Daire kiradaysa borcun kimden isteneceği gösterilir. Yönetime karşı
          asıl sorumlu malik olmaya devam eder (KMK m.20); bu yalnızca
          aralarındaki paylaşımdır.
        */}
        {row.original.tenantId && row.original.tenantAccruedCents > 0 && (
          <div className="text-muted-foreground text-xs">
            Malik {money(row.original.ownerAccruedCents)} · kiracı{" "}
            {money(row.original.tenantAccruedCents)}
          </div>
        )}
      </>
    ),
  },
  {
    accessorKey: "paidCents",
    header: "Ödenen",
    meta: { align: "right" },
    cell: ({ row }) => (
      <>
        <Money cents={row.original.paidCents} />
        {row.original.pendingCents > 0 && (
          <div className="text-muted-foreground text-xs">
            +{money(row.original.pendingCents)} bekliyor
          </div>
        )}
      </>
    ),
  },
  {
    accessorKey: "lateFeeCents",
    header: "Gecikme tazm.",
    meta: { align: "right" },
    cell: ({ row }) =>
      row.original.lateFeeCents > 0 ? (
        <>
          <Money
            cents={row.original.lateFeeCents}
            className="font-medium text-[var(--danger)]"
          />
          <div className="text-muted-foreground text-xs">
            {money(row.original.overdueCents)} vadesi geçmiş
          </div>
        </>
      ) : (
        <span className="text-muted-foreground">—</span>
      ),
  },
  {
    accessorKey: "dueNowCents",
    header: "Bu ay ödenecek",
    meta: { align: "right" },
    cell: ({ row }) => (
      <>
        <Money
          cents={row.original.dueNowCents}
          className={
            row.original.dueNowCents > 0
              ? "font-medium text-[var(--danger)]"
              : "font-medium text-[var(--success)]"
          }
        />
        {/*
          Taksite bağlanmış borçta bu ay istenen tutar toplamın bir parçası;
          kalanın gelecek aylara düştüğü söylenmeli.
        */}
        {row.original.balanceCents !== row.original.dueNowCents && (
          <div className="text-muted-foreground text-xs">
            toplam {money(row.original.balanceCents)}
          </div>
        )}
      </>
    ),
  },
];

type YearEndUnit = YearEnd["units"][number];

const yearEndColumns: Column<YearEndUnit>[] = [
  {
    accessorKey: "label",
    header: "Daire",
    cell: ({ row }) => <span className="font-medium">{row.original.label}</span>,
  },
  {
    accessorKey: "arsaPayi",
    header: "Arsa payı",
    meta: { align: "right" },
    cell: ({ row }) => (
      <span className="tabular text-muted-foreground text-sm">
        {number(row.original.arsaPayi)}
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

/** Yıl sonu mahsuplaşma. */
function YearEndTab() {
  const { isAdmin } = useSession();
  // Yıl adres çubuğunda: geri tuşu çalışır ve rotanın loader'ı hangi yılın
  // verisini ısıtacağını buradan bilir.
  const { yil: year } = reportsRoute.useSearch();
  const navigate = useNavigate();
  const [, startTransition] = useTransition();
  const setYear = (yil: number) =>
    startTransition(() => void navigate({ to: "/panel/raporlar", search: { yil } }));
  const yearEnd = useSuspenseApi<YearEnd>(`/reports/year-end/${year}`);
  const balances = usePaged<Balance, { debtVisibility: string }>("/reports/balances");
  const ownOnly = !isAdmin && balances.debtVisibility !== "herkes";

  const apply = useAction(() => post(`/reports/year-end/${year}/apply`), {
    invalidate: ["/reports"],
    success: "Mahsuplaşma dairelere işlendi",
  });

  const undo = useAction(() => del(`/reports/year-end/${year}/apply`), {
    invalidate: ["/reports"],
    success: "Mahsuplaşma geri alındı",
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Select value={String(year)} onValueChange={(y) => setYear(Number(y))}>
          <SelectTrigger className="w-[110px]" aria-label="Yıl">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Array.from({ length: 6 }, (_, i) => new Date().getFullYear() - i).map((y) => (
              <SelectItem key={y} value={String(y)}>
                {y}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {isAdmin && yearEnd.data && !yearEnd.data.alreadyApplied && (
          <ConfirmDialog
            trigger={
              <Button disabled={apply.isPending || yearEnd.data.differenceCents === 0}>
                <CalendarCheck className="size-4" /> Dairelere işle
              </Button>
            }
            title={`${year} mahsuplaşması dairelere işlensin mi?`}
            description={
              yearEnd.data.kind === "refund"
                ? `${money(yearEnd.data.differenceCents)} tutarındaki fazla, ${yearEnd.data.units.length} daireye arsa payına göre iade olarak yazılacak ve bakiyelerinden düşülecek. İşlem sonrasında geri alınabilir.`
                : `${money(-yearEnd.data.differenceCents)} tutarındaki açık, ${yearEnd.data.units.length} daireye arsa payına göre ek tahsilat olarak yazılacak ve bakiyelerine eklenecek. İşlem sonrasında geri alınabilir.`
            }
            confirmLabel="Dairelere işle"
            onConfirm={() => apply.mutate(undefined)}
          />
        )}
        {isAdmin && yearEnd.data?.alreadyApplied && (
          <ConfirmDialog
            trigger={
              <Button variant="outline" disabled={undo.isPending}>
                <Undo2 className="size-4" /> Mahsuplaşmayı geri al
              </Button>
            }
            title={`${year} mahsuplaşması geri alınsın mı?`}
            description={`Bu yıl için dairelere yazılan iade ve ek tahsilat kayıtları silinecek, bakiyeler mahsuplaşma öncesindeki hâline dönecek. Ödemeler ve tahakkuklar etkilenmez.`}
            confirmLabel="Geri al"
            destructive
            onConfirm={() => undo.mutate(undefined)}
          />
        )}
      </div>

      {yearEnd.data && (
        <>
          <Alert>
            <Scale />
            <AlertTitle>
              {yearEnd.data.differenceCents === 0
                ? `${year} başabaş kapandı`
                : yearEnd.data.kind === "refund"
                  ? `${year} tahakkuk fazlası ${money(yearEnd.data.differenceCents)}`
                  : `${year} tahakkuk açığı ${money(-yearEnd.data.differenceCents)}`}
            </AlertTitle>
            <AlertDescription>
              {year} yılında dairelere yansıtılan toplam {money(yearEnd.data.billedCents)},
              fiilen yapılan harcama {money(yearEnd.data.spentCents)}. Fark arsa payı
              oranında dairelere dağılır;{" "}
              {yearEnd.data.kind === "refund"
                ? "yönetim iade etmeyi seçerse"
                : "ek tahsilat yapılırsa"}{" "}
              daire bakiyelerine işlenir.
              {!ownOnly &&
                " Yenileme fonu gibi bilinçli olarak biriktirilen tutarları devretmek isterseniz bu adımı atlayın."}
              {yearEnd.data.alreadyApplied && " Bu mahsuplaşma dairelere işlendi."}
            </AlertDescription>
          </Alert>

          <section>
            <h3 className="mb-3 font-medium text-base">
              {ownOnly ? "Dairenize düşen" : "Daire başına"}{" "}
              {yearEnd.data.kind === "refund" ? "iade" : "ek tahsilat"}
            </h3>
            <DataTable columns={yearEndColumns} rows={yearEnd.data.units} />
          </section>
        </>
      )}
    </div>
  );
}
