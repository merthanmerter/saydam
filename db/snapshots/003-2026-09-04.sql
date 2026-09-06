
-- ─── Kimlik ────────────────────────────────────────────────────────────────
create table if not exists users (
  id           uuid primary key default gen_random_uuid(),
  email        text not null unique,           -- daima küçük harfe çevrilerek yazılır
  full_name    text not null,
  phone        text,
  created_at   timestamptz not null default now()
);

create table if not exists sites (
  id                      uuid primary key default gen_random_uuid(),
  slug                    text not null unique,
  name                    text not null,
  city                    text not null default '',
  address                 text not null default '',
  iban                    text,
  iban_holder             text,
  bank_name               text,
  -- Sitenin KENDİ ödeme hesabı ('iyzico' | 'paytr'): aidat tahsilatı doğrudan
  -- siteye gider. Anahtarlar JSON olarak AES-256-GCM ile şifrelenip saklanır.
  payment_provider        text check (payment_provider in ('iyzico','paytr')),
  payment_credentials     text,
  payment_sandbox         boolean not null default false,
  -- Ayın kaçında aidat kendiliğinden tahakkuk etsin? null → yalnızca elle.
  accrual_day             int check (accrual_day between 1 and 28),
  -- Aidatın son ödeme günü; gecikme tazminatı bu tarihten sonra işler.
  due_day                 int not null default 10 check (due_day between 1 and 28),
  -- KMK m.20/c: aylık %5. Yönetim planı farklı bir oran öngörebilir.
  late_fee_pct            numeric(5,2) not null default 5 check (late_fee_pct >= 0),
  -- Yönetim planı KMK m.20'deki yasal yöntemden farklı bir paylaşım
  -- öngörüyorsa buradan seçilir; kalemler yine tek tek geçersiz kılabilir.
  default_share_method    text not null default 'arsa_payi'
                          check (default_share_method in ('esit','arsa_payi')),
  -- Daire bazlı borç listesini kimler görebilir (KVKK).
  debt_visibility         text not null default 'yonetim'
                          check (debt_visibility in ('yonetim','herkes')),
  created_at              timestamptz not null default now()
);

create table if not exists memberships (
  id            uuid primary key default gen_random_uuid(),
  site_id       uuid not null references sites(id) on delete cascade,
  user_id       uuid not null references users(id) on delete cascade,
  role          text not null check (role in ('admin','resident')),
  status        text not null default 'active' check (status in ('active','removed')),
  password_hash text,                          -- null → henüz şifre belirlenmedi
  created_at    timestamptz not null default now(),
  removed_at    timestamptz,
  unique (site_id, user_id)
);
create index if not exists memberships_site_idx on memberships(site_id);

create table if not exists sessions (
  id            uuid primary key default gen_random_uuid(),
  token_hash    text not null unique,
  membership_id uuid not null references memberships(id) on delete cascade,
  expires_at    timestamptz not null,
  created_at    timestamptz not null default now()
);
create index if not exists sessions_membership_idx on sessions(membership_id);

-- Davet ve şifre sıfırlama tek mekanizma
create table if not exists auth_tokens (
  id            uuid primary key default gen_random_uuid(),
  membership_id uuid not null references memberships(id) on delete cascade,
  token_hash    text not null unique,
  purpose       text not null check (purpose in ('invite','reset')),
  expires_at    timestamptz not null,
  used_at       timestamptz,
  created_at    timestamptz not null default now()
);

-- ─── Daireler ──────────────────────────────────────────────────────────────
create table if not exists units (
  id            uuid primary key default gen_random_uuid(),
  site_id       uuid not null references sites(id) on delete cascade,
  block         text not null default '',
  no            text not null,
  floor         int,
  -- Tapudaki arsa payı. KMK m.20/b giderleri bu orana göre paylaştırılır.
  -- Ortak gider paylaşımının tek yasal ölçüsü budur.
  arsa_payi     numeric(12,4) not null check (arsa_payi > 0),
  -- Ortak giderden asıl sorumlu malik; kiracı KMK m.22 uyarınca kira bedeli
  -- kadar müteselsil sorumludur.
  owner_membership_id  uuid references memberships(id) on delete set null,
  tenant_membership_id uuid references memberships(id) on delete set null,
  created_at    timestamptz not null default now(),
  unique (site_id, block, no)
);
create index if not exists units_site_idx on units(site_id);

-- ─── Giderler ──────────────────────────────────────────────────────────────
-- Düzenli gider = bütçe kalemi. Her ay aidata otomatik yansır.
create table if not exists recurring_expenses (
  id            uuid primary key default gen_random_uuid(),
  site_id       uuid not null references sites(id) on delete cascade,
  title         text not null,
  category      text not null default 'genel',
  amount_cents  bigint not null check (amount_cents >= 0),
  -- KMK m.20: kapıcı/kaloriferci/bahçıvan/bekçi giderleri EŞİT, sigorta ve
  -- ortak yer bakım-onarım giderleri ARSA PAYI oranında paylaşılır.
  share_method  text not null default 'arsa_payi'
                check (share_method in ('esit','arsa_payi')),
  -- Site yönetimine karşı asıl sorumlu her zaman maliktir (KMK m.20); kiracı
  -- kira bedeli kadar müteselsil sorumludur (m.22). Bu alan, malik ile kiracı
  -- ARASINDAKİ paylaşımı gösterir: kullanıma bağlı yan giderler kira
  -- sözleşmesi gereği kiracıya aittir (TBK m.303). Dairenin toplam borcunu
  -- değiştirmez, kimden isteneceğini gösterir.
  payer         text not null default 'malik' check (payer in ('malik','kiraci')),
  start_period  int not null,
  end_period    int,                            -- null → süresiz
  note          text,
  created_by    uuid references memberships(id) on delete set null,
  created_at    timestamptz not null default now()
);
create index if not exists recurring_site_idx on recurring_expenses(site_id);

-- Fiili gider = kasadan çıkan para. Fatura zorunlu (system hariç).
--   kind='budgeted' → bir bütçe kalemine mahsup edilir, aidata TEKRAR yansımaz
--   kind='one_off'  → olağanüstü gider, taksit + işletme payı ile aidata yansır
--   kind='system'   → platform aboneliği gibi otomatik kalemler
create table if not exists expenses (
  id                   uuid primary key default gen_random_uuid(),
  site_id              uuid not null references sites(id) on delete cascade,
  kind                 text not null check (kind in ('budgeted','one_off','system')),
  recurring_expense_id uuid references recurring_expenses(id) on delete set null,
  title                text not null,
  category             text not null default 'genel',
  vendor               text,
  amount_cents         bigint not null check (amount_cents > 0),
  incurred_on          date not null,
  period               int not null,            -- aidata yansımaya başladığı dönem
  installments         int not null default 1 check (installments between 1 and 120),
  surcharge_pct        numeric(6,3) not null default 0 check (surcharge_pct >= 0),
  share_method         text not null default 'arsa_payi'
                       check (share_method in ('esit','arsa_payi')),
  payer                text not null default 'malik' check (payer in ('malik','kiraci')),
  invoice_url          text,
  invoice_name         text,
  note                 text,
  created_by           uuid references memberships(id) on delete set null,
  created_at           timestamptz not null default now(),
  constraint expenses_invoice_required
    check (kind = 'system' or invoice_url is not null),
  constraint expenses_budget_link
    check ((kind = 'budgeted') = (recurring_expense_id is not null))
);
create index if not exists expenses_site_period_idx on expenses(site_id, period);

-- Olağanüstü giderin aylara dağılımı (taksit + işletme payı uygulanmış hâli)
create table if not exists expense_allocations (
  id           uuid primary key default gen_random_uuid(),
  expense_id   uuid not null references expenses(id) on delete cascade,
  site_id      uuid not null references sites(id) on delete cascade,
  period       int not null,
  amount_cents bigint not null,
  unique (expense_id, period)
);
create index if not exists alloc_site_period_idx on expense_allocations(site_id, period);

-- ─── Aidat tahakkuku ───────────────────────────────────────────────────────
create table if not exists dues_runs (
  id                uuid primary key default gen_random_uuid(),
  site_id           uuid not null references sites(id) on delete cascade,
  period            int not null,
  total_arsa_payi   numeric(12,4) not null,
  recurring_cents   bigint not null,
  one_off_cents     bigint not null,
  system_cents      bigint not null,
  total_cents       bigint not null,
  created_by        uuid references memberships(id) on delete set null,
  created_at        timestamptz not null default now(),
  unique (site_id, period)
);

create table if not exists dues (
  id            uuid primary key default gen_random_uuid(),
  site_id       uuid not null references sites(id) on delete cascade,
  run_id        uuid not null references dues_runs(id) on delete cascade,
  unit_id       uuid not null references units(id) on delete cascade,
  membership_id uuid references memberships(id) on delete set null,
  period        int not null,
  arsa_payi     numeric(12,4) not null,
  amount_cents  bigint not null,
  -- Dairenin borcunun malik ile kiracı arasındaki dağılımı; toplamı
  -- amount_cents'e eşittir. Kiracı tanımlı değilse tamamı malike yazılır.
  owner_cents   bigint not null default 0,
  tenant_cents  bigint not null default 0,
  -- Son ödeme tarihi; gecikme tazminatı bundan sonra işlemeye başlar.
  due_date      date not null,
  -- Bu dairenin payının kalem kalem dökümü: hangi gider, hangi yönteme göre,
  -- ne kadar. Şeffaflığın kaynağı; sonradan bütçe değişse de bozulmaz.
  breakdown     jsonb not null default '[]'::jsonb,
  created_at    timestamptz not null default now(),
  unique (unit_id, period)
);
create index if not exists dues_site_period_idx on dues(site_id, period);

-- Yıl sonu mahsuplaşma (iade / ek tahsilat)
create table if not exists adjustments (
  id           uuid primary key default gen_random_uuid(),
  site_id      uuid not null references sites(id) on delete cascade,
  unit_id      uuid not null references units(id) on delete cascade,
  year         int not null,
  kind         text not null check (kind in ('refund','charge')),
  amount_cents bigint not null check (amount_cents > 0),
  note         text,
  created_by   uuid references memberships(id) on delete set null,
  created_at   timestamptz not null default now(),
  unique (unit_id, year, kind)
);

-- ─── Tahsilat ──────────────────────────────────────────────────────────────
create table if not exists payments (
  id            uuid primary key default gen_random_uuid(),
  site_id       uuid not null references sites(id) on delete cascade,
  unit_id       uuid not null references units(id) on delete cascade,
  membership_id uuid references memberships(id) on delete set null,
  amount_cents  bigint not null check (amount_cents > 0),
  method        text not null check (method in ('transfer','online','cash')),
  status        text not null default 'pending' check (status in ('pending','confirmed','rejected')),
  reference     text,
  receipt_url   text,
  provider      text,
  provider_ref  text,
  note          text,
  paid_at       timestamptz,
  -- Yönetimin kararı: onay da ret de buraya yazılır.
  decided_by    uuid references memberships(id) on delete set null,
  decided_at    timestamptz,
  created_at    timestamptz not null default now(),
  unique (provider, provider_ref)
);
create index if not exists payments_site_idx on payments(site_id, status);
create index if not exists payments_unit_idx on payments(unit_id);

-- ─── İletişim & içerik ─────────────────────────────────────────────────────
create table if not exists announcements (
  id         uuid primary key default gen_random_uuid(),
  site_id    uuid not null references sites(id) on delete cascade,
  title      text not null,
  body       text not null,
  pinned     boolean not null default false,
  created_by uuid references memberships(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists announcements_site_idx on announcements(site_id, created_at desc);

create table if not exists documents (
  id          uuid primary key default gen_random_uuid(),
  site_id     uuid not null references sites(id) on delete cascade,
  title       text not null,
  category    text not null default 'diger'
              check (category in ('yonetmelik','toplanti','sozlesme','proje','diger')),
  file_url    text not null,
  file_name   text not null,
  size_bytes  bigint not null default 0,
  uploaded_by uuid references memberships(id) on delete set null,
  created_at  timestamptz not null default now()
);
create index if not exists documents_site_idx on documents(site_id, created_at desc);

create table if not exists posts (
  id            uuid primary key default gen_random_uuid(),
  site_id       uuid not null references sites(id) on delete cascade,
  membership_id uuid not null references memberships(id) on delete cascade,
  title         text not null,
  body          text not null,
  created_at    timestamptz not null default now()
);
create index if not exists posts_site_idx on posts(site_id, created_at desc);

create table if not exists post_comments (
  id            uuid primary key default gen_random_uuid(),
  post_id       uuid not null references posts(id) on delete cascade,
  site_id       uuid not null references sites(id) on delete cascade,
  membership_id uuid not null references memberships(id) on delete cascade,
  body          text not null,
  created_at    timestamptz not null default now()
);
create index if not exists comments_post_idx on post_comments(post_id, created_at);

-- Birebir mesajlaşma. "Yönetime yaz" = rolü admin olan bir üyeye yazmak.
create table if not exists messages (
  id           uuid primary key default gen_random_uuid(),
  site_id      uuid not null references sites(id) on delete cascade,
  sender_id    uuid not null references memberships(id) on delete cascade,
  recipient_id uuid not null references memberships(id) on delete cascade,
  body         text not null,
  read_at      timestamptz,
  created_at   timestamptz not null default now()
);
create index if not exists messages_site_idx on messages(site_id, created_at desc);
create index if not exists messages_recipient_idx on messages(recipient_id, read_at);

-- Başarısız giriş denemeleri. Bellekte tutulsaydı sunucu örnekleri arasında
-- paylaşılmaz, sunucusuz ortamda koruma sağlamazdı.
create table if not exists login_attempts (
  id         uuid primary key default gen_random_uuid(),
  -- "hesap:<siteId>:<eposta>" ya da "ip:<adres>"
  key        text not null,
  created_at timestamptz not null default now()
);
create index if not exists login_attempts_key_idx on login_attempts(key, created_at desc);

-- ─── Platform aboneliği (yalnızca bulut sürümde) ───────────────────────────
create table if not exists subscriptions (
  id                   uuid primary key default gen_random_uuid(),
  site_id              uuid not null unique references sites(id) on delete cascade,
  plan                 text not null check (plan in ('monthly','yearly')),
  status               text not null default 'trialing'
                       check (status in ('trialing','active','past_due','canceled')),
  price_cents          bigint not null,
  current_period_start date not null,
  current_period_end   date not null,
  -- true → dönem ücreti site giderlerine otomatik eklenir
  -- Platform ücretinin site giderlerine yansıtılması yönetimin açık tercihi.
  bill_to_site         boolean not null default false,
  provider_ref         text,
  created_at           timestamptz not null default now()
);

-- ─── Şema eklemeleri ───────────────────────────────────────────────────────
-- Yukarıdaki create table blokları yalnızca yeni kurulumlarda çalışır.
-- Mevcut veritabanlarının da güncellenmesi için sonradan eklenen sütunlar
-- burada tekrarlanır. Yeni bir sütun eklerken her iki yere de yazın.
alter table sites add column if not exists payment_provider    text;
alter table sites add column if not exists payment_credentials text;
alter table sites add column if not exists payment_sandbox     boolean not null default false;
alter table sites add column if not exists accrual_day         int;
alter table sites add column if not exists due_day             int not null default 10;
alter table sites add column if not exists late_fee_pct        numeric(5,2) not null default 5;
alter table sites add column if not exists default_share_method text not null default 'arsa_payi';
alter table sites add column if not exists debt_visibility     text not null default 'yonetim';
alter table sites add column if not exists bank_name           text;

-- m² ölçüsünden vazgeçiş: ortak gider paylaşımının yasal ölçüsü arsa payıdır
-- (KMK m.20), m² değil. Arsa payı girilmemiş kayıtlar için m² devredilir.
alter table units add column if not exists arsa_payi numeric(12,4);
-- Sütun adı çalışma anında çözülmek zorunda: area_m2 kaldırıldıktan sonra
-- düz bir update ifadesi ayrıştırma aşamasında hata verirdi.
do $$ begin
  if exists (select 1 from information_schema.columns
              where table_name = 'units' and column_name = 'area_m2') then
    execute 'update units set arsa_payi = area_m2 where arsa_payi is null';
    execute 'alter table units drop column area_m2';
  end if;
end $$;
delete from units where arsa_payi is null;
alter table units alter column arsa_payi set not null;

-- Arsa payları birer oran olduğu için toplamın ayrıca beyan edilmesi gereksiz:
-- paylaşım zaten kendi toplamına bölünerek yapılıyor.
alter table sites drop column if exists declared_area_m2;
alter table sites drop column if exists declared_arsa_payi;

alter table dues      add column if not exists arsa_payi       numeric(12,4);
alter table dues_runs add column if not exists total_arsa_payi numeric(12,4);
update dues d set arsa_payi = coalesce((select u.arsa_payi from units u where u.id = d.unit_id), 1)
 where arsa_payi is null;
update dues_runs r set total_arsa_payi =
    coalesce((select sum(u.arsa_payi) from units u where u.site_id = r.site_id), 1)
 where total_arsa_payi is null;
alter table dues      alter column arsa_payi       set not null;
alter table dues_runs alter column total_arsa_payi set not null;
alter table dues      drop column if exists area_m2;
alter table dues_runs drop column if exists total_area_m2;

-- Paylaşım yöntemi kısıtları: 'm2' seçeneği kaldırıldı.
update sites               set default_share_method = 'arsa_payi' where default_share_method = 'm2';
update recurring_expenses  set share_method = 'arsa_payi' where share_method = 'm2';
update expenses            set share_method = 'arsa_payi' where share_method = 'm2';
alter table sites              drop constraint if exists sites_default_share_method_check;
alter table recurring_expenses drop constraint if exists recurring_expenses_share_method_check;
alter table expenses           drop constraint if exists expenses_share_method_check;
alter table sites              add constraint sites_default_share_method_check
  check (default_share_method in ('esit','arsa_payi'));
alter table recurring_expenses add constraint recurring_expenses_share_method_check
  check (share_method in ('esit','arsa_payi'));
alter table expenses           add constraint expenses_share_method_check
  check (share_method in ('esit','arsa_payi'));

alter table units add column if not exists owner_membership_id  uuid references memberships(id) on delete set null;
alter table units add column if not exists tenant_membership_id uuid references memberships(id) on delete set null;
-- Tek "sakin" alanından malik/kiracı ayrımına geçiş.
do $$ begin
  if exists (select 1 from information_schema.columns
              where table_name = 'units' and column_name = 'membership_id') then
    update units set owner_membership_id = membership_id
     where owner_membership_id is null and membership_id is not null;
    alter table units drop column membership_id;
  end if;
end $$;
create index if not exists units_owner_idx  on units(owner_membership_id);
create index if not exists units_tenant_idx on units(tenant_membership_id);

alter table recurring_expenses add column if not exists share_method text not null default 'arsa_payi';
alter table expenses           add column if not exists share_method text not null default 'arsa_payi';

-- Malik / kiracı yükümlülük ayrımı.
alter table recurring_expenses add column if not exists payer text not null default 'malik';
alter table expenses           add column if not exists payer text not null default 'malik';
alter table recurring_expenses drop constraint if exists recurring_expenses_payer_check;
alter table expenses           drop constraint if exists expenses_payer_check;
alter table recurring_expenses add constraint recurring_expenses_payer_check
  check (payer in ('malik','kiraci'));
alter table expenses           add constraint expenses_payer_check
  check (payer in ('malik','kiraci'));

-- "confirmed_*" adı yanıltıcıydı: reddedilen ödemede de doluyor. Yeniden
-- adlandırma idempotent değil, o yüzden varlık kontrolüyle sarmalanır.
do $$ begin
  if exists (select 1 from information_schema.columns
              where table_name = 'payments' and column_name = 'confirmed_by') then
    alter table payments rename column confirmed_by to decided_by;
    alter table payments rename column confirmed_at to decided_at;
  end if;
end $$;

/*
 * Yabancı anahtar indeksleri. Postgres, referans veren sütuna kendiliğinden
 * indeks açmaz; indekssiz bir sütun hem birleşimlerde hem de üst kayıt
 * silinirken (cascade / set null) tam tablo taramasına yol açar.
 *
 * Yalnızca BÜYÜYEN tabloların anahtarları indekslenir. Yalnızca kimin
 * eklediğini tutan created_by / uploaded_by / decided_by sütunları bilerek
 * indekssiz bırakıldı: bulundukları tablolar küçük kalıyor ve indeksin yazma
 * maliyeti taramadan pahalıya geliyor.
 */
create index if not exists adjustments_site_idx    on adjustments(site_id);
create index if not exists auth_tokens_member_idx  on auth_tokens(membership_id);
create index if not exists dues_member_idx         on dues(membership_id);
create index if not exists dues_run_idx            on dues(run_id);
create index if not exists expenses_recurring_idx  on expenses(recurring_expense_id);
create index if not exists memberships_user_idx    on memberships(user_id);
create index if not exists messages_sender_idx     on messages(sender_id);
create index if not exists payments_member_idx     on payments(membership_id);
create index if not exists post_comments_site_idx  on post_comments(site_id);
create index if not exists post_comments_member_idx on post_comments(membership_id);
create index if not exists posts_member_idx        on posts(membership_id);

alter table subscriptions alter column bill_to_site set default false;

alter table dues add column if not exists owner_cents  bigint not null default 0;
alter table dues add column if not exists tenant_cents bigint not null default 0;
update dues set owner_cents = amount_cents where owner_cents = 0 and tenant_cents = 0;

alter table dues add column if not exists due_date  date;
alter table dues add column if not exists breakdown jsonb not null default '[]'::jsonb;
update dues set due_date = make_date(period / 100, period % 100, 10) where due_date is null;
alter table dues alter column due_date set not null;

-- Sağlayıcı seçimi eklenmeden önceki iyzico'ya özel sütunlar. Anahtarlar ayrı
-- ayrı şifrelendiği için taşınamaz; ödeme kullanan siteler anahtarlarını
-- Ayarlar ekranından yeniden girmelidir.
alter table sites drop column if exists iyzico_api_key;
alter table sites drop column if exists iyzico_secret_key;
alter table sites drop column if exists iyzico_sandbox;
