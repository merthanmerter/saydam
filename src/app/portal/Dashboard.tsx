import {
  AlertTriangle,
  ArrowRight,
  Megaphone,
  Receipt,
  TrendingDown,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { lazy, Suspense } from "react";
import { Link } from "react-router";
import { Money, PageHeader, Stat } from "@/app/components/bits";
import type { MonthlyPoint } from "@/app/portal/TreasuryChart";
import { useSession } from "@/app/session";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { type Paged, useSuspenseApi } from "@/lib/api";
import { date, money, periodLabel } from "@/lib/format";
import type { Balance, Post, Site, Treasury, UnitsSummary } from "@/lib/types";

/** Grafik kütüphanesi yalnızca panelde indirilsin diye tembel yüklenir. */
const TreasuryChart = lazy(() => import("@/app/portal/TreasuryChart"));

export default function Dashboard() {
  const { me, isAdmin } = useSession();
  const treasury = useSuspenseApi<Treasury>("/reports/treasury");
  const site = useSuspenseApi<{ site: Site; summary: UnitsSummary }>("/site");
  const balances = useSuspenseApi<Paged<Balance>>("/reports/balances?size=500");
  // Duyuru artık panoya sabitlenen bir gönderi; panodan gelir.
  // Panoda yalnızca son duyurular gösteriliyor; ilk sayfa yeter.
  const board = useSuspenseApi<Paged<Post>>("/posts?size=10");
  const announcements = board.data.items.filter((p) => p.kind === "announcement");
  const monthly = useSuspenseApi<{ months: MonthlyPoint[] }>("/reports/monthly");

  const t = treasury.data;
  const summary = site.data?.summary;
  const mine = (balances.data.items ?? []).filter(
    (b) => b.ownerId === me?.membershipId || b.tenantId === me?.membershipId,
  );
  // Gösterilen borç, bu ay ödenmesi gereken tutar: taksite bağlanmış borcun
  // gelecek aylara düşen kısmı bugün istenmiyor.
  const myDebt = mine.reduce((sum, b) => sum + b.dueNowCents, 0);
  const myTotal = mine.reduce((sum, b) => sum + b.balanceCents, 0);

  return (
    <>
      <PageHeader
        title={`Merhaba, ${me?.fullName.split(" ")[0]}`}
        description={`${me?.siteName} · ${isAdmin ? "site yönetimi" : "site sakini"} görünümü`}
      />

      {isAdmin && summary?.unitCount === 0 && (
        <Alert variant="destructive" className="mb-6">
          <AlertTriangle />
          <AlertTitle>Henüz daire tanımlanmadı</AlertTitle>
          <AlertDescription>
            Ortak gider arsa payı oranında bölündüğü için önce dairelerin tapudaki arsa
            paylarıyla girilmesi gerekiyor.
            <Button variant="outline" size="sm" asChild className="mt-2">
              <Link to="/panel/daireler">Daireleri tanımla</Link>
            </Button>
          </AlertDescription>
        </Alert>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Kasa bakiyesi"
          value={money(t?.balanceCents ?? 0)}
          icon={Wallet}
          tone={(t?.balanceCents ?? 0) >= 0 ? "positive" : "negative"}
          hint="Tahsil edilen − harcanan"
        />
        <Stat
          label="Toplanan"
          value={money(t?.collectedCents ?? 0)}
          icon={TrendingUp}
          hint={
            t?.pendingCents ? `${money(t.pendingCents)} onay bekliyor` : "Onaylı ödemeler"
          }
        />
        <Stat
          label="Harcanan"
          value={money(t?.spentCents ?? 0)}
          icon={TrendingDown}
          hint="Faturalı giderler"
        />
        <Stat
          label={isAdmin ? "Tahsil edilecek" : "Bu ay ödenecek"}
          value={money(isAdmin ? (t?.receivableCents ?? 0) : myDebt)}
          icon={Receipt}
          tone={(isAdmin ? (t?.receivableCents ?? 0) : myDebt) > 0 ? "warning" : "positive"}
          hint={
            isAdmin
              ? "Tahakkuk − tahsilat"
              : myTotal !== myDebt
                ? `Toplam borç ${money(myTotal)}`
                : "Tüm daireleriniz"
          }
        />
      </div>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="text-base">Son 12 ay</CardTitle>
          <CardDescription>
            Aylık tahsilat ve fiilî harcama. Aradaki fark kasaya yansır.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Suspense fallback={<div className="h-[220px]" />}>
            <TreasuryChart months={monthly.data?.months ?? []} />
          </Suspense>
        </CardContent>
      </Card>

      <div className="mt-4 grid items-start gap-4 lg:grid-cols-2">
        {!isAdmin && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Dairelerim</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {mine.length === 0 && (
                <p className="text-muted-foreground text-sm">
                  Adınıza kayıtlı daire yok. Site yönetimiyle iletişime geçin.
                </p>
              )}
              {mine.map((unit) => (
                <div key={unit.id} className="flex items-center justify-between gap-3">
                  <div>
                    <p className="font-medium text-sm">
                      {unit.block && `${unit.block} `}
                      {unit.no}
                    </p>
                    <p className="text-muted-foreground text-xs">
                      Arsa payı {unit.arsaPayi}
                    </p>
                  </div>
                  <div className="text-right">
                    <Money
                      cents={unit.dueNowCents}
                      className={
                        unit.dueNowCents > 0
                          ? "font-medium text-[var(--danger)]"
                          : "font-medium text-[var(--success)]"
                      }
                    />
                    <p className="text-muted-foreground text-xs">
                      {unit.dueNowCents > 0 ? "bu ay" : "bakiye"}
                    </p>
                  </div>
                </div>
              ))}
              {mine.length > 0 && (
                <Button variant="outline" size="sm" asChild className="w-full">
                  <Link to="/panel/odemeler">
                    Ödeme yap <ArrowRight className="size-4" />
                  </Link>
                </Button>
              )}
            </CardContent>
          </Card>
        )}

        <Card className={isAdmin ? "lg:col-span-2" : undefined}>
          <CardHeader>
            <CardTitle className="text-base">Son duyurular</CardTitle>
            <CardAction>
              <Button variant="ghost" size="sm" asChild>
                <Link to="/panel/pano">
                  Panoya git <ArrowRight className="size-4" />
                </Link>
              </Button>
            </CardAction>
          </CardHeader>
          <CardContent className="space-y-4">
            {announcements.length === 0 && (
              <p className="flex items-center gap-2 text-muted-foreground text-sm">
                <Megaphone className="size-4" /> Henüz duyuru yok.
              </p>
            )}
            {announcements.slice(0, 4).map((item) => (
              <div key={item.id}>
                <p className="font-medium text-sm">{item.title}</p>
                <p className="mt-0.5 line-clamp-2 text-muted-foreground text-sm">
                  {item.body}
                </p>
                <p className="mt-1 text-muted-foreground text-xs">
                  {date(item.createdAt)}
                  {item.authorName ? ` · ${item.authorName}` : ""}
                </p>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      {isAdmin && (
        <Card className="mt-4">
          <CardHeader>
            <CardTitle className="text-base">Hızlı işlemler</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" asChild>
              <Link to="/panel/giderler">Gider gir</Link>
            </Button>
            <Button variant="outline" size="sm" asChild>
              <Link to="/panel/aidatlar">
                {periodLabel(currentMonth())} aidatını hesapla
              </Link>
            </Button>
            <Button variant="outline" size="sm" asChild>
              <Link to="/panel/odemeler">Bekleyen ödemeler</Link>
            </Button>
            <Button variant="outline" size="sm" asChild>
              <Link to="/panel/pano">Duyuru yayınla</Link>
            </Button>
          </CardContent>
        </Card>
      )}
    </>
  );
}

const currentMonth = () => {
  const now = new Date();
  return now.getFullYear() * 100 + now.getMonth() + 1;
};
