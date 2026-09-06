import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

/**
 * Sayfa iskeletleri.
 *
 * Sayfanın verisi hazır olana kadar `Suspense` bunları çizer. Kutular elle
 * çizilmiyor: gerçek `Card`, `Table`, `CardHeader` bileşenlerinin ta kendisi
 * kullanılıyor, yalnızca metnin yerine blok konuyor. Böylece yükseklikler
 * tahmin edilmiyor, aynı bileşenden geliyor — içerik geldiğinde sayfa
 * kaymıyor.
 *
 * Blok yükseklikleri metnin satır yüksekliğiyle birebir: text-2xl → h-8,
 * text-sm → h-5, text-xs → h-4.
 */

/**
 * Bir metin satırı kadar yer kaplar, içine satırdan biraz ince bir blok koyar.
 * Kutu yüksekliği (`box`) satır yüksekliğiyle birebir aynı olmalı; blok ise
 * harflerin kapladığı yüksekliğe yakın, yoksa iki satır tek bir kalın kütle
 * gibi görünüyor.
 *
 *   text-2xl → box h-8 · text-sm → box h-5 · text-xs → box h-4
 */
/**
 * Yer tutucu listeleri için değişmeyen anahtarlar. Liste sabit uzunlukta ve
 * hiç sıralanmıyor, ama dizinin sırasını anahtar yapmak ilerideki bir
 * değişiklikte sessizce bozulabilecek bir alışkanlık.
 */
export const keys = (n: number) => Array.from({ length: n }, (_, i) => `s${i}`);

export const Line = ({
  box = "h-5",
  bar = "h-3.5",
  width,
  className,
}: {
  box?: string;
  bar?: string;
  width: string;
  className?: string;
}) => (
  <div className={cn("flex items-center", box, className)}>
    <Skeleton className={cn(bar, width)} />
  </div>
);

/**
 * `PageHeader` ile aynı kutu.
 *
 * `width`, gerçek metin bloğunun piksel genişliğidir; `actions` da eylem
 * düğmelerinin kapladığı genişlik. Bunlar tahmin değil, sayfadan ölçülmüş
 * değerler — çünkü başlık `flex-wrap`: metin ile düğmeler yan yana sığmazsa
 * düğmeler alt satıra iner ve başlık 48 piksel uzar. İskelet dar kalırsa o
 * satır atlaması gerçekleşmez, içerik geldiğinde sayfa kayar.
 *
 * Açıklama `max-w-2xl` ile sınırlı olduğundan satır sayısı ekran
 * genişliğinden bağımsızdır; sayfa başına sabit verilir.
 */
export function HeaderSkeleton({
  width,
  lines = 1,
  actions,
}: {
  width: number;
  lines?: 1 | 2;
  actions?: { width: number; count: number };
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3 pb-6">
      <div className="max-w-full" style={{ width }}>
        <Line box="h-8" bar="h-6" width="w-44" className="max-w-full" />
        <Line className="mt-1" width="w-full" />
        {lines > 1 && <Line width="w-2/3" />}
      </div>
      {actions && (
        <div className="flex max-w-full gap-2" style={{ width: actions.width }}>
          {keys(actions.count).map((k) => (
            <Skeleton key={k} className="h-9 flex-1" />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * `Stat` ile aynı kutu. `hints`, hangi kartta ipucu satırı olduğunu söyler:
 * ipucu kartı 20 piksel uzatır, yanlış sayıda blok koymak kayma yaratırdı.
 */
export function StatsSkeleton({
  hints,
  className = "sm:grid-cols-2 lg:grid-cols-4",
}: {
  /** Karttaki ipucu satır sayısı: yok (0/false), bir satır (1/true), iki satır (2). */
  hints: (boolean | number)[];
  className?: string;
}) {
  return (
    <div className={cn("grid gap-3", className)}>
      {hints.map((hint, i) => (
        <Card key={keys(hints.length)[i]} className="gap-0 py-4">
          <CardContent className="px-4">
            <Line box="h-4" bar="h-3" width="w-24" />
            <Line box="h-8" bar="h-6" width="w-32" className="mt-2" />
            {/* Sarmalanan ipucu tek bir paragraf: üst boşluk yalnızca ilk satırda. */}
            {keys(Number(hint)).map((line, index) => (
              <Line
                key={line}
                box="h-4"
                bar="h-3"
                width={index === Number(hint) - 1 ? "w-20" : "w-full"}
                className={index === 0 ? "mt-1" : undefined}
              />
            ))}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

/** Gerçek tablo bileşenleriyle çizilir; satır yükseklikleri birebir aynı. */
export function TableSkeleton({ cols, rows = 6 }: { cols: number; rows?: number }) {
  return (
    <Card className="overflow-hidden py-0">
      <Table>
        <TableHeader>
          <TableRow>
            {keys(cols).map((k) => (
              <TableHead key={k}>
                <Line box="h-4" bar="h-3" width="w-20" />
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {keys(rows).map((rk) => (
            <TableRow key={rk}>
              {keys(cols).map((ck, c) => (
                <TableCell key={ck}>
                  {/* İlk sütun genelde kısa bir kimlik (daire, tarih). */}
                  <Line width={c === 0 ? "w-16" : "w-24"} />
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Card>
  );
}

/** `TabsList` ile aynı yükseklik (h-9) ve iç boşluk. */
export function TabsSkeleton({ count = 2 }: { count?: number }) {
  return (
    <div className="inline-flex h-9 w-fit items-center justify-center gap-1 rounded-lg bg-muted p-[3px]">
      {keys(count).map((k) => (
        <Skeleton key={k} className="h-[calc(100%-1px)] w-32" />
      ))}
    </div>
  );
}

/** Başlıklı kart; `lines` gövdedeki satır sayısı. */
export function CardSkeleton({
  lines = 3,
  className,
}: {
  lines?: number;
  className?: string;
}) {
  return (
    <Card className={className}>
      <CardHeader>
        <Line width="w-40" />
      </CardHeader>
      <CardContent className="space-y-3">
        {keys(lines).map((k) => (
          <div key={k}>
            <Line width="w-2/3" />
            <Line box="h-4" bar="h-3" width="w-full" />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
