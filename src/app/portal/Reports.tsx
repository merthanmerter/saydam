import {
  CalendarCheck,
  Scale,
  TrendingDown,
  TrendingUp,
  Undo2,
  Wallet,
} from "lucide-react";
import { Suspense, useState, useTransition } from "react";
import { Link } from "react-router";
import { Money, PageHeader, Stat } from "@/app/components/bits";
import { ConfirmDialog } from "@/app/components/confirm";
import { Pager } from "@/app/components/pager";
import { TableSkeleton } from "@/app/components/skeletons";
import { useSession } from "@/app/session";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
        <Card className="overflow-hidden py-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Daire</TableHead>
                {!ownOnly && <TableHead>Sakin</TableHead>}
                <TableHead className="text-right">Arsa payı</TableHead>
                <TableHead className="text-right">Tahakkuk</TableHead>
                <TableHead className="text-right">Ödenen</TableHead>
                <TableHead className="text-right">Gecikme tazm.</TableHead>
                <TableHead className="text-right">Bu ay ödenecek</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {balances.items.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="font-medium">
                    {row.block && `${row.block} `}
                    {row.no}
                    {row.hasRestructuring && (
                      <Link
                        to="/panel/odemeler"
                        className="mt-0.5 block text-[var(--warning)] text-xs hover:underline"
                      >
                        Yapılandırıldı
                      </Link>
                    )}
                  </TableCell>
                  {!ownOnly && (
                    <TableCell className="text-muted-foreground text-sm">
                      {row.tenantName ?? row.ownerName ?? "—"}
                      {row.tenantName && row.ownerName && (
                        <span className="block text-xs">Malik: {row.ownerName}</span>
                      )}
                    </TableCell>
                  )}
                  <TableCell className="tabular text-right text-muted-foreground text-sm">
                    {number(row.arsaPayi)}
                  </TableCell>
                  <TableCell className="text-right">
                    <Money cents={row.accruedCents} />
                    {row.restructuringInterestCents > 0 && (
                      <div className="text-muted-foreground text-xs">
                        {money(row.restructuringInterestCents)} vade farkı
                      </div>
                    )}
                    {/*
                      Daire kiradaysa borcun kimden isteneceği gösterilir.
                      Yönetime karşı asıl sorumlu malik olmaya devam eder
                      (KMK m.20); bu yalnızca aralarındaki paylaşımdır.
                    */}
                    {row.tenantId && row.tenantAccruedCents > 0 && (
                      <div className="text-muted-foreground text-xs">
                        Malik {money(row.ownerAccruedCents)} · kiracı{" "}
                        {money(row.tenantAccruedCents)}
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <Money cents={row.paidCents} />
                    {row.pendingCents > 0 && (
                      <div className="text-muted-foreground text-xs">
                        +{money(row.pendingCents)} bekliyor
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    {row.lateFeeCents > 0 ? (
                      <>
                        <Money
                          cents={row.lateFeeCents}
                          className="font-medium text-[var(--danger)]"
                        />
                        <div className="text-muted-foreground text-xs">
                          {money(row.overdueCents)} vadesi geçmiş
                        </div>
                      </>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <Money
                      cents={row.dueNowCents}
                      className={
                        row.dueNowCents > 0
                          ? "font-medium text-[var(--danger)]"
                          : "font-medium text-[var(--success)]"
                      }
                    />
                    {/*
                      Taksite bağlanmış borçta bu ay istenen tutar toplamın bir
                      parçası; kalanın gelecek aylara düştüğü söylenmeli.
                    */}
                    {row.balanceCents !== row.dueNowCents && (
                      <div className="text-muted-foreground text-xs">
                        toplam {money(row.balanceCents)}
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
        <Pager
          page={balances.page}
          size={balances.size}
          count={balances.items.length}
          hasMore={balances.hasMore}
          onChange={balances.setPage}
        />
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

/** Yıl sonu mahsuplaşma. */
function YearEndTab() {
  const { isAdmin } = useSession();
  const [year, setYear] = useState(new Date().getFullYear());
  const [, startTransition] = useTransition();
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
        <Select
          value={String(year)}
          onValueChange={(y) => startTransition(() => setYear(Number(y)))}
        >
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
            <Card className="overflow-hidden py-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Daire</TableHead>
                    <TableHead className="text-right">Arsa payı</TableHead>
                    <TableHead className="text-right">Tutar</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {yearEnd.data.units.map((unit) => (
                    <TableRow key={unit.unitId}>
                      <TableCell className="font-medium">{unit.label}</TableCell>
                      <TableCell className="tabular text-right text-muted-foreground text-sm">
                        {number(unit.arsaPayi)}
                      </TableCell>
                      <TableCell className="text-right">
                        <Money cents={unit.amountCents} className="font-medium" />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          </section>
        </>
      )}
    </div>
  );
}
