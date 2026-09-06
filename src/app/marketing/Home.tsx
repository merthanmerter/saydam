import {
  ArrowRight,
  Calculator,
  CalendarClock,
  Check,
  Clock,
  Code,
  CreditCard,
  FileText,
  KeyRound,
  Layers,
  MessagesSquare,
  Percent,
  Receipt,
  Scale,
  ShieldCheck,
  Wallet,
} from "lucide-react";
import { Link } from "react-router";
import { Logo, Wordmark } from "@/app/components/logo";
import { useSession } from "@/app/session";
import shotAidatlar from "@/assets/shots/aidatlar.webp";
import shotBakiyeler from "@/assets/shots/bakiyeler.webp";
import shotGiderler from "@/assets/shots/giderler.webp";
import shotKasa from "@/assets/shots/kasa.webp";
import shotOdemeler from "@/assets/shots/odemeler.webp";
import shotSakin from "@/assets/shots/sakin.webp";
import shotYilSonu from "@/assets/shots/yil-sonu.webp";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { money } from "@/lib/format";
import { cn } from "@/lib/utils";

const FEATURES = [
  {
    icon: Calculator,
    title: "Aidat kendiliğinden hesaplanır",
    body: "Düzenli bütçe kalemleri ve o ayki olağanüstü giderler toplanır, her kalem kendi yöntemine göre dairelere bölünür. Elle tablo tutmak yok.",
  },
  {
    icon: Scale,
    title: "Paylaşım Kat Mülkiyeti Kanunu'na göre",
    body: "Kapıcı, kaloriferci ve bahçıvan gideri daireler arasında eşit; sigorta, bakım-onarım ve yönetici aylığı arsa payı oranında bölünür (KMK m.20). Her kalemin yöntemi ayrı seçilebilir, yönetim planınız farklıysa uyarlarsınız.",
  },
  {
    icon: Clock,
    title: "Gecikme tazminatı kendiliğinden işler",
    body: "Son ödeme gününü geçen borca aylık %5 gecikme tazminatı yürütülür (KMK m.20/c). Ödemeler en eski borçtan başlayarak kapatılır; kimin ne kadar geciktiği tartışmaya açık kalmaz.",
  },
  {
    icon: KeyRound,
    title: "Malik ve kiracı ayrı ayrı",
    body: "Her gider kalemine yükümlüsü yazılır: kapıcı ve ortak elektrik gibi kullanım giderleri kiracıya, sigorta ve büyük onarım malike (TBK m.303). Tahakkukta dairenin borcu ikiye ayrılıp gösterilir — yönetime karşı sorumluluk ise KMK m.22 gereği malikte kalır.",
  },
  {
    icon: Receipt,
    title: "Faturasız gider girilemez",
    body: "Yönetim her harcamayı faturasıyla yükler. Sakinler istedikleri an kalem kalem görür; hangi paranın nereye gittiği tartışma konusu olmaz.",
  },
  {
    icon: Wallet,
    title: "Kasa her an canlı",
    body: "Tahsil edilen her ödeme kasaya girer, yayımlanan her gider kasadan düşer. Bakiye herkese aynı anda, aynı rakamla görünür.",
  },
  {
    icon: CalendarClock,
    title: "Taksitli masraf, işletme payıyla",
    body: "Çatı yenileme gibi büyük bir masrafı 12 aya bölün, üzerine işletme/sermaye payı ekleyin. Aylık plan anında görünür.",
  },
  {
    icon: Layers,
    title: "Yıl sonu mahsuplaşma",
    body: "Yıl kapanınca tahakkuk ile fiilî harcama karşılaştırılır. Fazla varsa daire başına iade, eksik varsa ek tahsilat tutarı otomatik çıkar.",
  },
  {
    icon: CreditCard,
    title: "Havale ve online ödeme",
    body: "IBAN'ınızı yayınlayın, havale bildirimlerini tek tıkla onaylayın. İsterseniz kendi iyzico veya PayTR hesabınızı bağlayıp kartla tahsilat açın — para doğrudan sitenin hesabına geçer.",
  },
  {
    icon: CalendarClock,
    title: "Borcu yapılandırın",
    body: "Birikmiş borcu taksite bağlayın; isterseniz vade farkı ekleyin. Sakinden her ay yalnızca o ayın taksiti istenir, kalanı sonraki aylara düşer. Gecikme tazminatı da eski aidat vadelerine göre değil, kabul edilen taksitlerin vadesine göre işler.",
  },
  {
    icon: Percent,
    title: "Kart komisyonu isteğe bağlı yansır",
    body: "Kartla tahsilatın sağlayıcı komisyonunu sakine yansıtmayı seçebilirsiniz. Sakin ödemeden önce borcu, farkı ve karttan çekilecek tutarı ayrı ayrı görür; borcuna işlenen tutar değişmez. Varsayılan kapalıdır.",
  },
  {
    icon: FileText,
    title: "Yönetmelik ve toplantı arşivi",
    body: "Site yönetmeliği, karar defteri, sözleşmeler tek yerde. Sakinler istedikleri zaman erişir; 'bana ulaşmadı' biter.",
  },
  {
    icon: MessagesSquare,
    title: "Tek pano, tek gündem",
    body: "Duyuru ile tartışma ayrı ekranlara bölünmez: yönetim duyurusunu panonun başına sabitler, sakinler aynı yerde konu açıp yorum yazar. Birebir yazışma için ayrıca mesajlaşma var.",
  },
];

const STEPS = [
  {
    title: "Siteyi tanımlayın",
    body: "Her dairenin tapudaki arsa payını girin. Ortak giderin yasal paylaşım ölçüsü budur; ayrıca bir toplam beyan etmeniz gerekmez.",
  },
  {
    title: "Sakinleri ekleyin",
    body: "E-postalarıyla davet edin. Herkes kendi şifresini ilk girişte belirler; kimse kendi başına siteye kaydolamaz.",
  },
  {
    title: "Gideri girin, aidat çıksın",
    body: "Faturaları yükleyin, dönemi tahakkuk ettirin. Aidat, borç, kasa ve ödeme takibi kendiliğinden akar.",
  },
];

/** Anasayfadaki ekran turu — görseller demo veriden `bun run shots` ile üretilir. */
const TOUR = [
  {
    src: shotAidatlar,
    height: 838,
    title: "Aidat, kimsenin hesap makinesine ihtiyaç duymadan çıkar",
    body: "Dönemin düzenli kalemleri ile o aya düşen taksitler toplanır; her kalem kendi yöntemiyle dairelere dağıtılır. Her daire kendi payını hangi giderden ne kadar geldiğiyle birlikte görür.",
    points: [
      "Kalem listesi ve paylaşım yöntemi aynı ekranda",
      "Dönemi yeniden hesaplamak tek düğme",
      "Her tahakkuk kalem dökümüyle saklanır, sonradan bozulmaz",
    ],
  },
  {
    src: shotGiderler,
    height: 900,
    title: "Faturası olmayan gider kaydedilemez",
    body: "Her harcama tedarikçisi, tarihi ve faturasıyla girilir. Düzenli bir bütçe kalemine mahsup edilen fatura aidata ikinci kez yansımaz; olağanüstü gider ise taksit sayısı ve işletme payıyla birlikte hangi aylara dağıldığını gösterir.",
    points: [
      "Fatura zorunluluğu veritabanı düzeyinde",
      "Taksit planı ve işletme payı satırda görünür",
      "Tahakkuk edilmiş döneme yansımış gider silinemez",
    ],
  },
  {
    src: shotOdemeler,
    height: 900,
    title: "Havale onayı ve kartla ödeme tek listede",
    body: "Sakin havale bildirimini dekontuyla yapar, yönetim tek tıkla onaylar ve tutar o an kasaya işlenir. Site kendi iyzico veya PayTR hesabını bağlarsa kartla ödeme de açılır ve ödeme, sağlayıcı doğrulamasıyla kendiliğinden onaylı gelir.",
    points: [
      "Kartla ödeme isteğe bağlı; yalnızca havaleyle de yürütebilirsiniz",
      "iyzico veya PayTR — hesap sitenin kendisine ait, tahsilat doğrudan siteye gider",
      "Onaylanmayan ödeme kasaya girmez",
    ],
  },
  {
    src: shotYilSonu,
    height: 810,
    title: "Yıl sonu farkı daire daire hesaplanır",
    body: "Yıl içinde dairelere yansıtılan toplam ile fiilen yapılan harcama karşılaştırılır. Fazla varsa iade, eksik varsa ek tahsilat tutarı arsa payı oranında dağıtılır; uygulamak yönetimin kararıdır.",
    points: [
      "Tahakkuk esaslı, tahsilat gecikmelerinden etkilenmez",
      "Dağılım daire bazında listelenir",
      "Tek tıkla daire bakiyelerine işlenir",
    ],
  },
  {
    src: shotSakin,
    height: 1016,
    title: "Sakin, kendi borcunu ve sitenin kasasını birlikte görür",
    body: "Site sakini kendi dairelerinin bakiyesini görürken sitenin toplam kasasını, tahsilatını ve harcamasını da aynı ekranda görür. Komşuların borç listesi kişisel veri olduğu için (KVKK) sakine gönderilmez; yönetim isterse tüm siteye açabilir.",
    points: [
      "Kendi daireleri ve borç durumu",
      "Komşunun borcu görünmez, sitenin kasası herkese açık",
      "Duyurular, dokümanlar ve mesajlaşma aynı portalda",
    ],
  },
] as const;

/**
 * Ekran görüntüsü çerçevesi. `height`, `scripts/shots.ts` içindeki yakalama
 * yüksekliğiyle aynı olmalıdır: görsel yüklenmeden yeri ayrılsın diye verilir.
 */
function Shot({
  src,
  alt,
  height,
  priority,
}: {
  src: string;
  alt: string;
  height: number;
  priority?: boolean;
}) {
  return (
    <figure className="overflow-hidden rounded-xl border bg-card shadow-lg shadow-foreground/5 ring-1 ring-black/5">
      <div className="flex items-center gap-1.5 border-b bg-muted/60 px-3 py-2">
        <span className="size-2.5 rounded-full bg-foreground/15" />
        <span className="size-2.5 rounded-full bg-foreground/15" />
        <span className="size-2.5 rounded-full bg-foreground/15" />
      </div>
      <img
        src={src}
        alt={alt}
        width={1440}
        height={height}
        loading={priority ? "eager" : "lazy"}
        decoding="async"
        className="block w-full"
      />
    </figure>
  );
}

export default function Home() {
  const { me, loading } = useSession();

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-30 border-b bg-background/80 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5">
          <Link to="/">
            <Wordmark />
          </Link>
          <nav className="flex items-center gap-1">
            <Button variant="ghost" asChild>
              <a href="#fiyat">Fiyatlar</a>
            </Button>
            {/*
              Oturum bilgisi gelene kadar iskelet gösterilir: aksi hâlde önce
              "Giriş / Sitenizi kurun" basılıp ardından "Panele git" ile
              değişiyor ve başlık gözle görülür şekilde zıplıyordu. Genişlikler
              çıkış yapmış görünümün gerçek düğme ölçüleridir (63 + 123 px);
              ziyaretçilerin çoğu o durumda olduğu için kayma sıfırlanır.
            */}
            {loading ? (
              <div className="flex items-center gap-1" aria-hidden>
                <Skeleton className="h-9 w-[63px] rounded-md" />
                <Skeleton className="h-9 w-[123px] rounded-md" />
              </div>
            ) : me ? (
              <Button asChild>
                <Link to="/panel">
                  Panele git <ArrowRight className="size-4" />
                </Link>
              </Button>
            ) : (
              <>
                <Button variant="ghost" asChild>
                  <Link to="/giris">Giriş</Link>
                </Button>
                <Button asChild>
                  <Link to="/kayit">Sitenizi kurun</Link>
                </Button>
              </>
            )}
          </nav>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden border-b">
        <div
          aria-hidden
          className="-z-10 pointer-events-none absolute inset-0 bg-[radial-gradient(60%_60%_at_50%_-10%,color-mix(in_oklab,var(--primary)_18%,transparent),transparent)]"
        />
        <div className="mx-auto max-w-6xl px-5 py-24 text-center">
          <Badge variant="secondary" className="mb-5 gap-1.5">
            <ShieldCheck className="size-3.5" />
            Her kuruş faturasıyla kayıtlı
          </Badge>
          <h1 className="mx-auto max-w-3xl text-balance font-semibold text-4xl leading-[1.1] tracking-tight sm:text-6xl">
            Site aidatı, tartışma konusu olmaktan çıksın
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-pretty text-lg text-muted-foreground">
            say-dam; giderleri faturasıyla kaydeden, aidatı arsa payına göre kendisi
            hesaplayan ve kasadaki parayı bütün site sakinlerine canlı gösteren bir yönetim
            sistemidir.
          </p>
          <div className="mt-9 flex flex-wrap justify-center gap-3">
            <Button size="lg" asChild>
              <Link to="/kayit">
                1 ay ücretsiz deneyin <ArrowRight className="size-4" />
              </Link>
            </Button>
            <Button size="lg" variant="outline" asChild>
              <Link to="/giris">Sakin girişi</Link>
            </Button>
          </div>
          <p className="mt-4 text-muted-foreground text-xs">
            1 ay ücretsiz deneme · kredi kartı istemiyoruz · kendi sunucunuzda süresiz
            ücretsiz
          </p>

          <div className="mx-auto mt-14 max-w-5xl text-left">
            <Shot
              priority
              height={964}
              src={shotKasa}
              alt="Yönetim panelinde kasa bakiyesi, toplanan ve harcanan tutarlar ile son duyurular"
            />
            <p className="mt-3 text-center text-muted-foreground text-sm">
              Yönetim paneli: kasa bakiyesi, tahsilat, harcama ve tahsil edilecek tutar tek
              bakışta.
            </p>
          </div>
        </div>
      </section>

      {/* Nasıl çalışır */}
      <section className="mx-auto max-w-6xl px-5 py-20">
        <h2 className="font-semibold text-2xl tracking-tight">Üç adımda kurulur</h2>
        <div className="mt-8 grid gap-4 md:grid-cols-3">
          {STEPS.map((step, index) => (
            <Card key={step.title} className="h-full">
              <CardContent>
                <div className="flex size-8 items-center justify-center rounded-full bg-primary/10 font-semibold text-primary text-sm">
                  {index + 1}
                </div>
                <h3 className="mt-4 font-medium">{step.title}</h3>
                <p className="mt-2 text-muted-foreground text-sm leading-relaxed">
                  {step.body}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* Şeffaflık vurgusu */}
      <section className="border-y bg-muted/40">
        <div className="mx-auto grid max-w-6xl gap-10 px-5 py-20 md:grid-cols-2 md:items-center">
          <div>
            <h2 className="text-balance font-semibold text-2xl tracking-tight">
              Kasadaki para, herkesin ekranında aynı
            </h2>
            <p className="mt-4 text-muted-foreground leading-relaxed">
              Tahsil edilen aidatlar kasaya girer, yayımlanan giderler kasadan düşer. Sakin
              de yönetici de aynı bakiyeyi, aynı gider listesini ve aynı faturaları görür.
              Kayıt sonradan sessizce değiştirilemez: tahakkuk edilmiş bir döneme yansımış
              gider, dönem yeniden hesaplanmadan silinemez.
            </p>
          </div>
          <Shot
            height={625}
            src={shotBakiyeler}
            alt="Daire bazlı tahakkuk, ödenen tutar ve bakiye tablosu"
          />
        </div>
      </section>

      {/* Ekran turu */}
      <section className="mx-auto max-w-6xl px-5 py-20">
        <h2 className="font-semibold text-2xl tracking-tight">Uygulamanın içi</h2>
        <p className="mt-2 max-w-2xl text-muted-foreground">
          Aşağıdaki ekranlar, örnek bir sitenin on iki aylık gerçek akışıyla üretilmiştir.
        </p>

        <div className="mt-12 space-y-20">
          {TOUR.map((item, index) => (
            <div
              key={item.title}
              className="grid items-center gap-8 lg:grid-cols-12 lg:gap-12"
            >
              <div className={cn("lg:col-span-7", index % 2 === 1 && "lg:order-2")}>
                <Shot src={item.src} height={item.height} alt={item.title} />
              </div>
              <div className="lg:col-span-5">
                <h3 className="text-balance font-semibold text-xl tracking-tight">
                  {item.title}
                </h3>
                <p className="mt-3 text-muted-foreground leading-relaxed">{item.body}</p>
                <ul className="mt-5 space-y-2">
                  {item.points.map((point) => (
                    <li key={point} className="flex gap-2.5 text-sm">
                      <Check className="mt-0.5 size-4 shrink-0 text-primary" />
                      <span>{point}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Özellikler */}
      <section className="mx-auto max-w-6xl px-5 py-20">
        <h2 className="font-semibold text-2xl tracking-tight">Neler var?</h2>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map(({ icon: Icon, title, body }) => (
            <Card key={title} className="h-full">
              <CardContent>
                <Icon className="size-5 text-primary" />
                <h3 className="mt-3 font-medium text-sm">{title}</h3>
                <p className="mt-2 text-muted-foreground text-sm leading-relaxed">{body}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* Fiyatlandırma */}
      <section id="fiyat" className="border-t bg-muted/40">
        <div className="mx-auto max-w-6xl px-5 py-20">
          <h2 className="font-semibold text-2xl tracking-tight">Fiyatlandırma</h2>
          <p className="mt-2 max-w-xl text-muted-foreground">
            Yazılım açık kaynaktır: indirip kendi sunucunuzda ücretsiz çalıştırabilirsiniz.
            Kurulumla uğraşmak istemiyorsanız bulut sürümünü <strong>1 ay ücretsiz</strong>{" "}
            deneyin — kayıt sırasında kart bilgisi istemiyoruz, deneme kendiliğinden ücretli
            aboneliğe dönmez.
          </p>
          <div className="mt-8 grid gap-4 md:grid-cols-3">
            <Card className="flex h-full flex-col">
              <CardContent className="flex flex-1 flex-col">
                <h3 className="font-medium">Kendi sunucunuzda</h3>
                <p className="mt-2 font-semibold text-3xl">Ücretsiz</p>
                <p className="mt-3 text-muted-foreground text-sm">
                  Tüm özellikler açık. Bir Postgres veritabanı ve Bun çalıştıran herhangi
                  bir sunucu yeterli.
                </p>
                <Button variant="outline" className="mt-auto w-full" asChild>
                  <a
                    href="https://github.com/merthanmerter/saydam"
                    target="_blank"
                    rel="noreferrer"
                  >
                    <Code className="size-4" /> Kaynak kodu
                  </a>
                </Button>
              </CardContent>
            </Card>

            <Card className="flex h-full flex-col border-primary/40 ring-1 ring-primary/20">
              <CardContent className="flex flex-1 flex-col">
                <div className="flex items-center justify-between">
                  <h3 className="font-medium">Bulut — Aylık</h3>
                  <Badge>1 ay ücretsiz</Badge>
                </div>
                <p className="mt-2 font-semibold text-3xl">
                  {money(190_000)}
                  <span className="font-normal text-base text-muted-foreground"> /ay</span>
                </p>
                <p className="mt-3 text-muted-foreground text-sm">
                  İlk ay ücretsiz. Kurulum, yedekleme ve güncellemeler bizde. Abonelik
                  ücretini dilerseniz site giderlerine otomatik gider olarak
                  yazdırabilirsiniz.
                </p>
                <div className="h-5" />
                <Button className="mt-auto w-full" asChild>
                  <Link to="/kayit">Ücretsiz başla</Link>
                </Button>
              </CardContent>
            </Card>

            <Card className="flex h-full flex-col">
              <CardContent className="flex flex-1 flex-col">
                <h3 className="font-medium">Bulut — Yıllık</h3>
                <p className="mt-2 font-semibold text-3xl">
                  {money(1_900_000)}
                  <span className="font-normal text-base text-muted-foreground"> /yıl</span>
                </p>
                <p className="mt-3 text-muted-foreground text-sm">
                  Peşin ödemede iki ay hediye. Aylık {money(1_900_000 / 12)} maliyete denk
                  gelir.
                </p>
                <div className="h-5" />
                <Button variant="outline" className="mt-auto w-full" asChild>
                  <Link to="/kayit">Ücretsiz başla</Link>
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      <footer className="border-t">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-5 py-10 text-muted-foreground text-sm">
          <div className="flex items-center gap-2">
            <Logo className="size-4 shrink-0" />
            <span>say-dam — şeffaf site yönetimi</span>
          </div>
          <div className="flex items-center gap-5">
            <span>Kaynak kodu açık, satılamaz (FSL-1.1-ALv2)</span>
            <Link to="/giris" className="hover:text-foreground">
              Giriş
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
