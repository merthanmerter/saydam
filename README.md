# say-dam

Site aidat, gider ve kasa yönetimi. Yönetim her harcamayı faturasıyla girer; aidat
arsa payı oranında kendiliğinden hesaplanır; kasadaki para her sakine canlı görünür.

- **Çalışma zamanı:** Bun 1.4 (tek süreçte React + API)
- **Ön yüz:** React 19 · React Router 8 · TanStack Query 5 · Tailwind 4 · shadcn/ui
- **Veri:** Neon Postgres, `Bun.SQL` ile doğrudan — ORM yok
- **Dağıtım:** Vercel (statik `dist/` + tek Bun fonksiyonu)
- **Entegrasyon:** iyzico (online ödeme), Vercel Blob (dosya), Resend (e-posta)

---

## Muhasebe modeli

Sistemin tamamı üç kavramın üstüne kurulu. Karışıklık çıkmaması için ayrımı net tutun:

| Kavram | Nerede | Ne yapar |
| --- | --- | --- |
| **Düzenli gider** (`recurring_expenses`) | Giderler → Düzenli kalemler | Bütçe kalemi. Geçerli olduğu her ay aidata yansır. |
| **Fiilî gider** (`expenses`) | Giderler → Fiilî giderler | Kasadan çıkan para. **Fatura zorunlu.** |
| **Tahakkuk** (`dues`) | Aidatlar | Dönemin her gider kalemi, kendi yöntemine göre dairelere yazılır. |

Bir fiilî gider iki şekilden biriyle kaydedilir:

- **Bütçe kalemine mahsup** (`kind = 'budgeted'`) — kapıcı maaşı gibi, zaten düzenli
  kalem olarak aidata yansıyan bir harcamanın faturası. Aidata **ikinci kez** eklenmez,
  yalnızca kasadan düşer.
- **Olağanüstü gider** (`kind = 'one_off'`) — çatı yenileme gibi. `installments` ile
  aylara bölünür, `surcharge_pct` ile işletme/sermaye payı eklenir ve bu plan
  `expense_allocations` tablosuna yazılarak ilgili ayların aidatına girer.

### Paylaşım yöntemi (KMK m.20)

Kanun, gideri tek bir orana değil **türüne göre iki ayrı yönteme** bağlar:

| Yöntem | Hangi giderler | Dayanak |
| --- | --- | --- |
| **Eşit** | Kapıcı, kaloriferci, bahçıvan, bekçi giderleri ve bunlar için toplanan avans | KMK m.20/a |
| **Arsa payı** | Sigorta primleri, ortak yerlerin bakım-koruma-onarımı, yönetici aylığı, ortak tesis işletme giderleri | KMK m.20/b |

Yönetim planı "aralarında başka türlü anlaşma olmadıkça" kaydıyla farklı bir
düzen öngörebildiği için yöntem her kalemde ayrı ayrı seçilebilir.

Bu yüzden her gider kalemi **kendi yöntemiyle** dairelere bölünür, sonra daire
başına toplanır. Tümünü tek bir oranla bölmek kanuna aykırı olur ve tahakkuk
itiraz edildiğinde sakatlanır. Paylaşımın ölçüsü tapudaki **arsa payıdır**; m²
hukuken bir paylaşım ölçüsü değildir ve sistemde hiç tutulmaz.

Her dairenin payı, hangi kalemden hangi yöntemle ne kadar geldiğini gösteren bir
dökümle (`dues.breakdown`) birlikte saklanır; bütçe sonradan değişse de geçmiş
tahakkuk bozulmaz.

### Gecikme tazminatı (KMK m.20/c)

Vadesi geçen ortak gider borcuna **aylık %5** gecikme tazminatı işler (oran
yönetim planıyla değiştirilebilir). Ödemeler daireye toplu yapıldığı için hangi
aidatın açık kaldığı **en eski borçtan başlanarak** belirlenir. Tazminat yalnızca
tam dolan aylar için ve yalnızca aidat anaparasına hesaplanır.

### Borç yapılandırma

Ödemeler ekranından yönetilir. Yönetim, birikmiş bir borcu taksite bağlayabilir
(`restructurings`). Yapılandırma
anaparayı değiştirmez; isteğe bağlı bir **vade farkı** ekler ve ödemeyi bir
takvime bağlar (`restructuring_installments`).

Kritik kural: yapılandırma yürürlükteyken gecikme tazminatı **eski aidat
vadelerine göre değil, kabul edilen taksitlerin vadesine göre** işler. Aksi
hâlde borçlu hem taksite bağlanır hem eski vadeden ceza yemeye devam eder ve
yapılandırmanın bir anlamı kalmaz. Yapılandırma tarihinden sonra tahakkuk eden
aidatlar kapsam dışıdır, kendi vadelerine göre işler. İptal edildiğinde vade
farkı geri alınır ve gecikme tazminatı yeniden aidat vadelerinden işlemeye
başlar.

Yapılandırılacak tutar **sunucuda** hesaplanır (`outstandingOf`); istemciden
gelen bir rakama güvenilmez, aksi hâlde borç istenildiği gibi küçültülebilirdi.

**Yapılandırma ayrı bir kayıt olarak gösterilmez.** Etkisi doğrudan istenen
tutarda görünür: her ekranda öne çıkan rakam `dueNowCents`, yani **bu ay
ödenmesi gereken** tutardır — vadesi gelecek aylara düşen taksitler bugün
istenmez. Tanım tam olarak şudur:

```
dueNowCents = balanceCents − (vadesi bu ayı aşan ödenmemiş tutar)
```

Böylece toplam borçla her zaman tutar; iki ayrı hesap yoktur. Taksite
bağlanmamış bir dairede ikisi pratikte eşittir, çünkü tahakkuk zaten aylık
işler.

Ödemeler taksitlere **en eskiden başlayarak** mahsup edilir. Taksitlere
yalnızca yapılandırmadan SONRAKİ ödemeler sayılır: anapara zaten o ana kadarki
ödemeler düşülerek belirlenmiştir, tüm ödeme geçmişi sayılsaydı taksitler
kendiliğinden kapanmış görünür ve gecikme tazminatı hiç işlemezdi.

Raporlarda daire bakiyeleri tablosu yapılandırılmış daireyi işaretler, vade
farkını tahakkukun altında gösterir ve "Alacak" göstergesi alacağın ne kadarının
yapılandırma kapsamında olduğunu söyler (`treasury.restructuredCents`). Toplu
bir rakam olduğu için kasa gibi herkese açıktır.

### Kart komisyon farkı

Site, kartla tahsilatın sağlayıcı komisyonunu sakine yansıtmayı seçebilir
(`sites.card_fee_pct`, varsayılan 0). Fark borcun **üstüne** eklenir: karttan
`tutar + fark` çekilir, daire bakiyesinden yalnızca `tutar` düşer. Aradaki fark
sağlayıcıya gider, kasaya girmez — bu yüzden `payments.fee_cents` ayrı tutulur
ve kasa hesabına dahil edilmez.

> Üye işyerlerinin kart komisyonunu müşteriye yansıtması mevzuatla sınırlıdır
> (5464 sayılı Kanun). Özellik bilerek varsayılan olarak kapalıdır; açmadan
> önce yönetim planınıza ve sağlayıcı sözleşmenize bakın.

### Hesabın özeti

```
Dönem gideri  = düzenli kalemler + o aya düşen taksitler + platform payı
Daire aidatı  = Σ (kalem tutarı × dairenin o kalemdeki payı)
Gecikme tazm. = vadesi geçmiş anapara × oran × dolan ay sayısı
Kasa          = onaylı tahsilat − fiilî gider
Daire bakiyesi= tahakkuk + ek tahsilat − iade − onaylı ödeme + gecikme tazminatı
Yıl sonu farkı= yıl içi tahakkuk − yıl içi fiilî gider   (+ ise iade, − ise ek tahsilat)
```

Tüm tutarlar **kuruş** cinsinden `bigint`'tir; hiçbir yerde ondalıklı sayı
kullanılmaz. Bölme yapılan her yerde "en büyük kalan" yöntemi uygulanır, yani
parçaların toplamı her zaman bölünen tutara eşittir — bir kuruş kaybolmaz
(`src/server/money.ts`).

### Malik ve kiracı (KMK m.22)

Ortak giderden asıl sorumlu **maliktir**; kiracı kira bedeli kadar müteselsil
sorumludur. Bir daireye hem malik hem kiracı atanabilir, ikisi de daireyi görüp
ödeme yapabilir.

Her gider kalemi bir **yükümlü** taşır (`payer`): kullanıma bağlı yan giderler
(kapıcı, yakıt, ortak elektrik, temizlik) kira sözleşmesi gereği kiracıya,
anayapıya ilişkin olanlar (sigorta, büyük onarım, demirbaş, yenileme fonu)
malike aittir — TBK m.303. Tahakkukta dairenin payı bu bilgiye göre
`owner_cents` ve `tenant_cents` olarak ikiye ayrılır; toplamları her zaman
`amount_cents`e eşittir.

Bu ayrım **malik ile kiracı arasındadır**. Site yönetimine karşı asıl sorumlu
her hâlükârda kat malikidir (KMK m.20); kiracı yalnızca kira bedeli kadar
müteselsil sorumludur (m.22). Bu yüzden dairenin toplam borcu, gecikme
tazminatı ve ödemeler daire düzeyinde tutulur; ayrım yalnızca hangi tutarın
kimden isteneceğini gösterir. Daire kirada değilse kiracıya işaretlenmiş kalem
de malike düşer.

### Arsa payı

Her daireye tapudaki arsa payı girilir. Arsa payları birer **oran** olduğu için
toplamlarının belli bir değere eşit olması gerekmez: paylaşım her zaman kendi
toplamlarına bölünerek yapılır. Bu yüzden ayrıca bir "toplam" beyanı ve onun
doğrulaması yoktur.

---

## Roller ve çok kiracılılık

- Kimlik (`users`) globaldir; erişim her zaman bir **üyelik** (`memberships`) üzerinden
  kurulur ve üyelik tek bir siteye bağlıdır. Oturum da üyeliğe bağlandığı için, portalda
  görülen her kayıt kendiliğinden o siteye kapalıdır.
- **Şifre üyelikte tutulur.** Aynı e-posta birden fazla sitede kayıtlı olabilir ve her
  sitede farklı şifre kullanabilir. Girişte önce site seçilir.
- Daire bazlı **borç listesi** kişisel veridir (KVKK): varsayılan olarak yalnızca
  yönetim görür, site isterse tüm sakinlere açabilir. Kasa bakiyesi, gider listesi
  ve faturalar bundan etkilenmez — onlar her koşulda herkese açıktır.
- Sakinler kendi başına kayıt olamaz; yönetim e-postayla ekler, davet bağlantısıyla
  sakin kendi şifresini belirler. Yönetim gerektiğinde şifreyi sıfırlar.
- Kendi dairesi olan bir yönetici, portalı **sakin gözüyle** görebilir: kullanıcı
  menüsündeki "Sakin olarak görüntüle" seçeneği `x-saydam-view: resident` başlığını
  açar. Bu yalnızca okuma kapsamını daraltır (kendi daireleri, maskelenmiş isimler);
  yetkiyi düşürmez ve rolü değiştirmez. Yetki kontrolleri daima gerçek role bakar,
  dolayısıyla bir sakin bu başlığı göndererek yönetim verisine erişemez.
- Siteden çıkarılan üyenin hesabı **silinmez**: `status = 'removed'` olur, geçmiş
  ödemelerini görmeye devam eder ama yeni işlem yapamaz. Aynı kişi sonradan tekrar
  eklenirse eski üyelik geçmişiyle birlikte yeniden etkinleşir.

---

## Kurulum

```bash
git clone https://github.com/merthanmerter/saydam.git
cd saydam
bun install
cp .env.example .env      # DATABASE_URL ve SESSION_SECRET doldurun
bun run db:migrate
bun run db:seed           # isteğe bağlı demo veri
bun dev                   # http://localhost:3000
```

Demo giriş: `yonetim@saydam.test` / `saydam1234` (Papatya Sitesi).

### Yerel Postgres ile

Elinizde bir Postgres kabı varsa, diğer veritabanlarına dokunmadan projeye özel bir
veritabanı ve kullanıcı açmanız yeterli:

```bash
docker exec -i <kap-adi> psql -U postgres <<'SQL'
create role saydam login password 'guclu-bir-sifre';
create database saydam owner saydam;
SQL
```

Ardından `.env` içine `DATABASE_URL="postgres://saydam:guclu-bir-sifre@127.0.0.1:5432/saydam"`
yazıp `bun run db:migrate` çalıştırın. `saydam` rolü süper kullanıcı olmadığı için aynı
sunucudaki diğer veritabanlarının verisine erişemez. Şema yalnızca çekirdek Postgres 13+
özelliklerini kullanır; ek eklenti gerekmez.

### Komutlar

| Komut | İş |
| --- | --- |
| `bun dev` | React HMR + API, tek süreç |
| `bun start` | Üretim modunda aynı süreç (self-host) |
| `bun run build` | Ön yüzü `dist/` klasörüne derler |
| `bun run db:migrate` | Şemayı uygular (idempotent) |
| `bun run db:check` | Göçü sıfır ve eski şemalı veritabanlarında dener |
| `bun test` | Para ve dönem hesaplarının birim testleri |
| `bun run shots` | Anasayfadaki ekran görüntülerini demo veriden yeniden üretir |
| `bun run lint` / `bun run format` | Biome |
| `bun run typecheck` | TypeScript |

### Anasayfa ekran görüntüleri

Tanıtım sayfasındaki görseller `src/assets/shots/` altında durur ve demo veriden
üretilir. Arayüz değiştiğinde yenilemek için sunucu ayaktayken:

```bash
bun run db:seed
bunx playwright install chromium   # yalnızca ilk kez
bun run shots
```

`scripts/shots.ts` her ekranı kendi yüksekliğinde yakalar; aynı yükseklikler
`Home.tsx` içindeki `Shot` çağrılarında da yazılıdır, ikisini birlikte güncelleyin.

---

## Vercel'e dağıtım

`vercel.json` hazır: ön yüz `dist/` klasöründen CDN üzerinden, API ise tek bir Bun
fonksiyonundan (`api/server.ts`) servis edilir; `/api/*` istekleri oraya yönlendirilir.

1. Projeyi Vercel'e bağlayın (framework: Other).
2. Neon Postgres'i **Storage** sekmesinden ekleyin — `DATABASE_URL` otomatik gelir.
   Bağlantı havuzu için `-pooler` uçlu adresi tercih edin.
3. Vercel Blob mağazasını ekleyin — `BLOB_READ_WRITE_TOKEN` otomatik gelir.
4. `SESSION_SECRET`, `SAAS_MODE`, `RESEND_API_KEY`, `IYZICO_*` değişkenlerini girin.
5. Deploy. Build sırasında `db:migrate` çalışır, şema kendiliğinden güncellenir.

> **Şema değiştirdiyseniz deploy'dan önce `bun run db:check` çalıştırın.**
> Geliştirme veritabanında bütün sütunlar zaten var olduğu için `db:migrate`
> orada her zaman geçer; üretimdeki veritabanı ise eski bir şemadan gelir.
> `db:check`, git geçmişindeki her şema sürümünden birer kopya kurup göçü
> üzerlerinde iki kez çalıştırır — "sütunu ekleyen ifade, ona değinen
> ifadeden sonra geliyor" türü hatalar ancak böyle ortaya çıkar.
>
> Göç tek bir işlemde uygulanır: bir ifade hata verirse tamamı geri alınır,
> yarım kalmış şema oluşmaz.

---

## Otomatik tahakkuk

Yönetim, Aidatlar ekranından ayın hangi günü tahakkuk yapılacağını seçebilir
(1–28; kısa aylarda gün atlanmasın diye üst sınır 28'dir). Seçilen günde
`/api/cron/accrual` çalışır ve o dönem **henüz tahakkuk edilmemiş** siteler için
hesaplamayı yapar; elle hesaplanmış bir dönemi asla ezmez, bir sitenin hatası
diğerlerini durdurmaz.

Uç, `CRON_SECRET` ile korunur ve yalnızca `Authorization: Bearer $CRON_SECRET`
başlığıyla yanıt verir. Vercel'de `vercel.json` içindeki `crons` tanımı bunu her
gün 06:00'da çağırır. Self-host kurulumda aynı çağrıyı herhangi bir zamanlayıcı
yapabilir:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" https://<alan-adiniz>/api/cron/accrual
```

---

## Abonelik ve erişim (yalnızca bulut sürümü)

`SAAS_MODE=false` iken abonelik hiç aranmaz; self-host kurulum sınırsız çalışır.
Bulut sürümünde erişim şu kurallarla yönetilir:

| Durum | Nasıl oluşur | Sonuç |
| --- | --- | --- |
| `trialing` | Kayıt anında otomatik, **1 ay** (kart bilgisi istenmez) | Tam erişim |
| `active` | Ödeme doğrulandığında | Tam erişim |
| `grace` | Aktif aboneliğin dönemi doldu, 7 gün | Tam erişim, uyarı gösterilir |
| `expired` / `none` | Tolerans bitti ya da hiç abonelik yok | **Yönetim işlemleri kilitli** |

Kilit **yalnızca site yönetiminin yazma işlemlerini** kapatır (HTTP 402). Site
sakinleri her koşulda oturum açar, geçmiş aidat ve giderlerini görür, havale
bildirir ve kartla ödeme yapar. Ödeme yükümlüsü yönetim olduğu için baskı orada
kurulur; sakinlerin mali kayıtları hiçbir zaman rehin tutulmaz. Yönetim de
kilidi açabilmek için abonelik ve ödeme ayarlarına erişmeye devam eder.

Geçerlilik yalnızca **ödeme doğrulandıktan sonra** yazılır: `/billing/subscribe`
kaydı `past_due` olarak açar, `active` yapan tek yer iyzico geri dönüşüdür.
Ücretsiz deneme site giderlerine yansıtılmaz; abonelik ücreti gidere ancak
`active` olduğunda ve `bill_to_site` işaretliyken eklenir.

---

## Ödeme akışları

İki ayrı tahsilat vardır ve birbirine hiç karışmaz:

| Ne tahsil ediliyor | Hangi hesap | Nerede tanımlanır |
| --- | --- | --- |
| **Aidat** (sakin → site) | Sitenin **kendi** hesabı: iyzico veya PayTR | Portal → Ayarlar → Kartla ödeme |
| **Bulut aboneliği** (site → platform) | Platformun PayTR hesabı | `PLATFORM_PAYTR_*` ortam değişkenleri |

Aidat parası hiçbir zaman platformun hesabından geçmez. Kartla ödeme **isteğe
bağlıdır**: bir site sağlayıcı tanımlamazsa sakinler yalnızca havale ile öder,
yönetim bildirimleri onaylar ve sistem eksiksiz çalışır.

Sitenin anahtarları kaydedilmeden önce sağlayıcıya sorularak doğrulanır
(iyzico'da BIN sorgusu, PayTR'da test modunda jeton isteği — ikisi de para
hareketi oluşturmaz), ardından JSON olarak **AES-256-GCM ile şifrelenip**
veritabanına yazılır. İstemciye hiçbir zaman gönderilmez; yönetim ekranında
yalnızca maskeli bir ön ek görünür. Şifreleme anahtarı `SECRETS_KEY`'tir
(tanımlı değilse `SESSION_SECRET` kullanılır — bu durumda `SESSION_SECRET`'i
değiştirmek kayıtlı ödeme anahtarlarını çözülemez hâle getirir).

### Sağlayıcıların akış farkı

**iyzico** sonucu kullanıcıyla birlikte döndürür: geri dönüş adresine bir `token`
POST edilir, sonuç sunucu-sunucu `retrieve` çağrısıyla okunur.

**PayTR asenkrondur.** Kullanıcı `merchant_ok_url`e yönlendirilirken kesin sonuç
ayrı bir bildirimle gelir; bu yüzden kullanıcının döndüğü sayfada "alındı"
denir, kayıt bildirim ulaştığında güncellenir. Bildirimin imzası
`HMAC-SHA256(merchant_oid + salt + status + total_amount)` ile doğrulanır ve
PayTR'ın tekrar denememesi için düz metin `OK` yanıtı verilir. Aynı bildirim
birden çok kez gelebileceği için güncelleme yalnızca `pending` kayda uygulanır.

Sağlayıcı panellerinde tanımlanacak bildirim adresleri:

```
https://<alan-adiniz>/api/payments/iyzico/callback
https://<alan-adiniz>/api/payments/paytr/callback
```

### Self-host

Vercel şart değil: Bun çalıştıran herhangi bir sunucuda `bun run build` sonrası
`bun start` yeterlidir (`src/serve.ts` hem React'i hem API'yi sunar). Bu durumda
`SAAS_MODE=false` bırakın; abonelik akışı tamamen devre dışı kalır.

---

## Dizin düzeni

```
api/server.ts          Vercel giriş noktası (Bun.serve)
src/serve.ts           Yerel/self-host sunucu: React + API tek süreç
src/server/
  app.ts               Rotaların birleştiği tek fetch işleyicisi
  schema.ts            Tüm şema, tek dosyada
  auth.ts              Şifre, oturum, davet/sıfırlama jetonları, yetki korumaları
  accounting.ts        Bütçe, tahakkuk, kasa, yıl sonu mahsuplaşma
  money.ts             Kuruş matematiği ve "en büyük kalan" dağıtımı
  routes/              auth · site · finance · social · files · billing
src/app/               React: marketing, auth sayfaları, portal
src/components/ui/     shadcn/ui bileşenleri
scripts/               migrate · seed · build
```

---

## Bilinçli tercihler

- **ORM yok.** Sorgular `Bun.SQL` etiketli şablonlarıyla yazılır; parametreler daima
  bağlanır, dize birleştirme yapılmaz.
- **Dosyalar herkese açık URL'lerle saklanır** (`access: 'public'`, rastgele son ekli).
  Adres tahmin edilemez ama sızarsa erişilebilir; daha sıkı bir gizlilik gerekiyorsa
  `src/lib/upload.ts` ve `src/server/routes/files.ts` üzerinden özel (private) blob'a
  geçip indirmeyi kimlik doğrulamalı bir uçtan proxy'leyin.
- **Tahakkuk edilmiş dönem korunur.** Bir döneme yansımış gider, o dönem yeniden
  hesaplanmadan silinemez.
- **Havale ödemeleri onaya tabidir.** Sakinin bildirimi `pending` olarak durur,
  kasaya ancak yönetim onayladığında girer. Kartla ödeme iyzico doğrulamasıyla
  doğrudan `confirmed` olur.

---

## Lisans

[FSL-1.1-ALv2](LICENSE.md) — Fair Source. Kaynak kodu açıktır; kullanabilir,
değiştirebilir ve dağıtabilirsiniz. **Yasak olan tek şey**, bu yazılımla rekabet eden
bir ürün ya da hizmet sunmaktır — yani kodu alıp satamazsınız. Her sürüm,
yayımlanmasından iki yıl sonra Apache 2.0'a döner.

Bilgilendirme amaçlı Türkçe çeviri: [LICENSE.tr.md](LICENSE.tr.md). Bağlayıcı metin
İngilizce aslıdır; uyuşmazlık hâlinde [LICENSE.md](LICENSE.md) geçerlidir.

Bulut sürümü ücretlidir: aylık 1.900 ₺, yıllık 19.000 ₺. Abonelik ücreti dilenirse
site giderlerine otomatik kalem olarak eklenir.
