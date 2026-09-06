import {
  CardSkeleton,
  HeaderSkeleton,
  keys,
  Line,
  StatsSkeleton,
  TableSkeleton,
  TabsSkeleton,
} from "@/app/components/skeletons";
import { lastKnownAdmin, navFor } from "@/app/portal/nav";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/**
 * Yüklenen sayfanın iskeleti.
 *
 * Tek bir "yükleniyor" göstergesi yerine, açılmakta olan sayfanın kendi
 * düzeni çizilir: kaç gösterge kartı, kaç sütunlu tablo, sekme var mı. Yol
 * `Suspense` sınırının anahtarı olduğu için hangi sayfanın beklendiği zaten
 * biliniyor.
 *
 * Yönetici ile sakinin gördüğü sütun sayısı bazı tablolarda farklı; iskelet
 * sakininkini varsayar, çünkü fazladan bir sütun eksik olandan daha az göze
 * batar (tablo genişliği zaten kapsayıcıya oturur).
 */
export function RouteSkeleton({ pathname }: { pathname: string }) {
  const page = pathname.replace(/^\/panel\/?/, "");

  switch (page) {
    // Genel bakış: 4 gösterge (hepsinde ipucu), grafik kartı, iki kart.
    case "":
      return (
        <>
          <HeaderSkeleton width={261} />
          <StatsSkeleton hints={[true, true, true, true]} />
          <Card className="mt-6">
            <CardContent>
              <Skeleton className="h-5 w-32" />
              <Skeleton className="mt-1.5 h-5 w-96 max-w-full" />
              <Skeleton className="mt-6 h-[220px] w-full" />
            </CardContent>
          </Card>
          <div className="mt-4 grid items-start gap-4 lg:grid-cols-2">
            <CardSkeleton className="lg:col-span-2" lines={4} />
          </div>
        </>
      );

    // Aidatlar: dönem seçici, 4 gösterge, solda kalemler + sağda tahakkuk.
    case "aidatlar":
      return (
        <>
          <HeaderSkeleton width={672} lines={2} actions={{ width: 401, count: 2 }} />
          <StatsSkeleton hints={[true, false, true, true]} />
          <div className="mt-6">
            <TabsSkeleton count={2} />
            <div className="mt-4">
              <TableSkeleton cols={5} rows={6} />
            </div>
          </div>
        </>
      );

    // Raporlar: iki sekme, 5 gösterge, daire bakiyeleri tablosu.
    case "raporlar":
      return (
        <>
          <HeaderSkeleton width={444} />
          <TabsSkeleton count={2} />
          <div className="mt-4">
            <StatsSkeleton
              hints={[false, false, false, false, true]}
              className="sm:grid-cols-2 lg:grid-cols-5"
            />
            <div className="mt-4">
              <TableSkeleton cols={7} rows={6} />
            </div>
          </div>
        </>
      );

    case "odemeler":
      return (
        <>
          <HeaderSkeleton width={444} actions={{ width: 276, count: 2 }} />
          <TableSkeleton cols={6} rows={8} />
        </>
      );

    // Giderler: iki sekme, yıl seçici satırı, tablo.
    case "giderler":
      return (
        <>
          <HeaderSkeleton width={623} actions={{ width: 115, count: 1 }} />
          <TabsSkeleton count={2} />
          <div className="mt-4">
            <div className="mb-3 flex items-center gap-2">
              <Skeleton className="h-9 w-[110px]" />
              <Skeleton className="h-5 w-40" />
            </div>
            <TableSkeleton cols={6} rows={8} />
          </div>
        </>
      );

    case "daireler":
      return (
        <>
          <HeaderSkeleton width={584} actions={{ width: 114, count: 1 }} />
          <StatsSkeleton hints={[false, true]} />
          <div className="mt-6">
            <TableSkeleton cols={6} rows={6} />
          </div>
        </>
      );

    case "sakinler":
      return (
        <>
          <HeaderSkeleton width={672} lines={2} actions={{ width: 114, count: 1 }} />
          <TableSkeleton cols={5} rows={6} />
        </>
      );

    case "dokumanlar":
      return (
        <>
          <HeaderSkeleton width={598} actions={{ width: 151, count: 1 }} />
          <TableSkeleton cols={5} rows={5} />
        </>
      );

    // Pano: gönderi kartları alt alta.
    case "pano":
      return (
        <>
          <HeaderSkeleton width={538} actions={{ width: 121, count: 1 }} />
          <div className="grid gap-3">
            {keys(4).map((k) => (
              <Card key={k}>
                <CardContent>
                  <div className="flex items-start gap-3">
                    <Skeleton className="size-8 shrink-0 rounded-full" />
                    <div className="min-w-0 flex-1">
                      <Skeleton className="h-6 w-64 max-w-full" />
                      <Skeleton className="mt-1 h-5 w-full" />
                      <Skeleton className="mt-1 h-5 w-4/5" />
                      <div className="mt-3 flex gap-3">
                        <Skeleton className="h-4 w-24" />
                        <Skeleton className="h-4 w-28" />
                        <Skeleton className="h-4 w-20" />
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      );

    // Mesajlar: solda kişi listesi, sağda yazışma.
    case "mesajlar":
      return (
        <>
          <HeaderSkeleton width={308} />
          {/* Yükseklik Messages.tsx ile birebir aynı olmalı. */}
          <Card className="grid h-[calc(100vh-10rem)] overflow-hidden py-0 md:grid-cols-[260px_1fr]">
            <div className="flex min-h-0 flex-col border-b md:border-r md:border-b-0">
              <div className="border-b p-3">
                <Skeleton className="h-9 w-full" />
              </div>
              <div className="min-h-0 flex-1 overflow-hidden">
                {keys(5).map((k) => (
                  <div key={k} className="border-b p-3">
                    <Skeleton className="h-5 w-32" />
                    <Skeleton className="mt-1 h-4 w-40" />
                  </div>
                ))}
              </div>
            </div>
            <div className="grid place-items-center p-4">
              <Skeleton className="h-5 w-56" />
            </div>
          </Card>
        </>
      );

    // Ayarlar: alt alta form kartları.
    case "ayarlar":
      return (
        <>
          <HeaderSkeleton width={263} />
          <div className="grid gap-4">
            {keys(3).map((k) => (
              <CardSkeleton key={k} lines={3} />
            ))}
          </div>
        </>
      );

    default:
      return (
        <>
          <HeaderSkeleton width={444} />
          <TableSkeleton cols={5} rows={6} />
        </>
      );
  }
}

/**
 * Kabuk iskeleti.
 *
 * Portal ilk açılırken oturum bilgisi henüz yok, dolayısıyla kenar çubuğu da
 * çizilemez (menü role göre değişiyor). Bu yüzden kabuğun kendisi de iskelet
 * olarak, gerçek düzenin ölçüleriyle çizilir: sol sütun `w-60`, üstteki mobil
 * şerit `h-14`, içerik `max-w-[1160px]`.
 */
export function ShellSkeleton({ pathname }: { pathname: string }) {
  return (
    <div className="min-h-screen bg-background">
      <div className="flex">
        {/*
          Kenar çubuğu, gerçek markup'ın ölçüleriyle: marka satırı `gap-2.5
          px-2` ve iki satırlık ad bloğu, menü öğeleri `px-3 py-2` (36 piksel),
          alttaki kullanıcı düğmesi `size-7` avatar + iki satır. Menüdeki öğe
          sayısı role göre değiştiği ve rol henüz bilinmediği için dokuz satır
          çizilir — menü sabit bir noktadan başladığı ve alttaki blok `flex-1`
          ile dibe yaslandığı için sayı farkı hiçbir şeyi kaydırmaz.
        */}
        <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r bg-sidebar px-3 py-4 lg:flex">
          <div className="flex items-center gap-2.5 px-2">
            <Skeleton className="size-6 shrink-0 rounded" />
            <div className="min-w-0 flex-1">
              <Line width="w-28" />
              {/* text-[11px] yalnızca yazı boyutunu değiştirir; satır
                  yüksekliği gövdeden gelir ve 17 pikseldir. */}
              <Line box="h-[17px]" bar="h-2.5" width="w-20" />
            </div>
          </div>
          <div className="mt-5 flex-1 overflow-y-auto">
            <div className="grid gap-0.5">
              {navFor(lastKnownAdmin()).map((item) => {
                const active = item.end
                  ? pathname === item.to
                  : pathname.startsWith(item.to);
                return (
                  <div
                    key={item.to}
                    className={cn(
                      "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm",
                      active && "bg-sidebar-accent",
                    )}
                  >
                    {/*
                      Etkin satırın zemini ile blok rengi aynı tonda; blokları
                      biraz koyulaştırmazsak satır tek parça bir kütle gibi
                      görünüyor ve ikon/etiket ayrımı kayboluyor.
                    */}
                    <Skeleton
                      className={cn(
                        "size-4 shrink-0 rounded-sm",
                        active && "bg-foreground/10",
                      )}
                    />
                    {/*
                      Dış kutu gerçekteki gibi satırı doldurur; blok ise
                      etiketin kendi genişliğinde. Yazı görünmez çizilip blok
                      üstüne bindiriliyor, böylece "Pano" ile "Dokümanlar"
                      aynı uzunlukta görünmüyor.
                    */}
                    <span className="flex flex-1">
                      {/* Dış kutu esnek: iç kutu satır kutusu payı almasın. */}
                      <span className="relative h-5">
                        <span className={cn("invisible", active && "font-medium")}>
                          {item.label}
                        </span>
                        <Skeleton
                          className={cn(
                            "-translate-y-1/2 absolute inset-x-0 top-1/2 h-3.5",
                            active && "bg-foreground/10",
                          )}
                        />
                      </span>
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
          <div className="flex items-center gap-2 px-2 py-2">
            <Skeleton className="size-7 shrink-0 rounded-full" />
            <div className="min-w-0 flex-1">
              <Line width="w-24" />
              <Line box="h-[17px]" bar="h-2.5" width="w-16" />
            </div>
          </div>
        </aside>

        <div className="min-w-0 flex-1">
          <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b bg-background/85 px-4 backdrop-blur lg:hidden">
            <Skeleton className="size-9 rounded-md" />
            <Skeleton className="h-5 w-32" />
            <Skeleton className="ml-auto size-8 rounded-full" />
          </header>

          <main className="mx-auto max-w-[1160px] px-5 py-7 md:px-8">
            <RouteSkeleton pathname={pathname} />
          </main>
        </div>
      </div>
    </div>
  );
}

/**
 * Uygulama düzeyindeki iskelet.
 *
 * Sayfa paketleri ayrı indiği için, ilk açılışta hangi sayfanın beklendiğine
 * göre iskelet seçilir: portal yolları kabuğu, giriş/kayıt ekranları kendi
 * kartını çizer. Anasayfa paketi zaten giriş paketiyle birlikte geliyor,
 * orada bekleme olmuyor.
 */
export function AppSkeleton({ pathname }: { pathname: string }) {
  if (pathname.startsWith("/panel")) return <ShellSkeleton pathname={pathname} />;
  if (pathname === "/") return null;

  // Giriş / kayıt / şifre belirleme: `AuthShell` ile aynı kutu.
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-muted/40 px-5 py-12">
      <Skeleton className="mb-8 h-7 w-36" />
      <div className="w-full max-w-md rounded-2xl border bg-card p-7 shadow-sm">
        <Skeleton className="h-7 w-40" />
        <Skeleton className="mt-1.5 h-5 w-full" />
        <div className="mt-6 grid gap-4">
          {keys(3).map((k) => (
            <div key={k} className="grid gap-1.5">
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-9 w-full" />
            </div>
          ))}
          <Skeleton className="h-9 w-full" />
        </div>
      </div>
    </div>
  );
}
