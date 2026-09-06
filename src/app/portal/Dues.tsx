import { useNavigate } from "@tanstack/react-router";
import { Banknote, Calculator, CircleAlert } from "lucide-react";
import { useTransition } from "react";
import { EmptyState, Money, PageHeader, Stat } from "@/app/components/bits";
import { PeriodPicker } from "@/app/components/inputs";
import { Pager } from "@/app/components/pager";
import { duesRoute } from "@/app/router";
import { useSession } from "@/app/session";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
          {budget.data?.lines.length === 0 ? (
            <EmptyState
              icon={Calculator}
              title="Bu dönemde aidata yansıyacak gider yok"
              description={
                isAdmin
                  ? "Düzenli bütçe kalemi tanımlayın ya da bu döneme bir gider girin."
                  : "Yönetim bu dönem için henüz kalem tanımlamadı."
              }
            />
          ) : (
            <Card className="overflow-hidden py-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Kalem</TableHead>
                    <TableHead>Tür</TableHead>
                    <TableHead>Paylaşım</TableHead>
                    <TableHead>Yükümlü</TableHead>
                    <TableHead className="text-right">Tutar</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {budget.data?.lines.map((line) => (
                    <TableRow key={`${line.source}-${line.id}`}>
                      <TableCell>
                        <div className="font-medium">{line.title}</div>
                        {line.detail && (
                          <div className="text-muted-foreground text-xs">{line.detail}</div>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary">{SOURCE_LABEL[line.source]}</Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {SHARE_METHODS.find((m) => m.id === line.shareMethod)?.label}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {PAYERS.find((p) => p.id === line.payer)?.label}
                      </TableCell>
                      <TableCell className="text-right">
                        <Money cents={line.amountCents} className="font-medium" />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          )}

          {isAdmin && budget.data?.run && (
            <p className="mt-3 text-muted-foreground text-xs">
              Son tahakkuk: {dateTime(budget.data.run.createdAt)} ·{" "}
              {money(budget.data.run.totalCents)}
            </p>
          )}
        </TabsContent>

        <TabsContent value="dues" className="mt-4">
          <Card className="overflow-hidden py-0">
            {dues.items.length === 0 ? (
              <div className="p-4">
                <EmptyState
                  icon={Banknote}
                  title="Bu dönem için tahakkuk yok"
                  description={
                    isAdmin
                      ? "Soldaki kalemleri kontrol edip tahakkuk ettirin."
                      : "Yönetim bu dönemin aidatını henüz hesaplamadı."
                  }
                />
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Daire</TableHead>
                    {isAdmin && <TableHead>Sakin</TableHead>}
                    <TableHead>Son ödeme</TableHead>
                    <TableHead className="text-right">Aidat</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {dues.items.map((due) => (
                    <TableRow key={due.id}>
                      <TableCell className="font-medium">
                        {due.block && `${due.block} `}
                        {due.no}
                      </TableCell>
                      {isAdmin && (
                        <TableCell className="text-muted-foreground text-sm">
                          {due.residentName ?? "—"}
                        </TableCell>
                      )}
                      <TableCell className="text-muted-foreground text-sm">
                        {date(due.dueDate)}
                      </TableCell>
                      <TableCell className="text-right">
                        <Money cents={due.amountCents} className="font-medium" />
                        {due.breakdown.length > 0 && (
                          <div className="mt-0.5 text-muted-foreground text-xs">
                            {due.breakdown.length} kalem
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </Card>
          <Pager
            page={dues.page}
            size={dues.size}
            count={dues.items.length}
            hasMore={dues.hasMore}
            onChange={dues.setPage}
          />
        </TabsContent>
      </Tabs>
    </>
  );
}
