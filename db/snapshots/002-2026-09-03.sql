-- 2026-09-03 tarihindeki şema (üretimde bu hâlde olan veritabanları için)

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
  -- Yönetimin beyan ettiği toplam yaşam alanı; daire m² toplamıyla doğrulanır.
  declared_area_m2        numeric(12,2) not null default 0,
  iban                    text,
  iban_holder             text,
  -- Sitenin KENDİ ödeme hesabı ('iyzico' | 'paytr'): aidat tahsilatı doğrudan
  -- siteye gider. Anahtarlar JSON olarak AES-256-GCM ile şifrelenip saklanır.
  payment_provider        text check (payment_provider in ('iyzico','paytr')),
  payment_credentials     text,
  payment_sandbox         boolean not null default false,
  -- Ayın kaçında aidat kendiliğinden tahakkuk etsin? null → yalnızca elle.
  accrual_day             int check (accrual_day between 1 and 28),
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
  area_m2       numeric(10,2) not null check (area_m2 > 0),
  membership_id uuid references memberships(id) on delete set null,  -- güncel sorumlu
  created_at    timestamptz not null default now(),
  unique (site_id, block, no)
);
create index if not exists units_site_idx on units(site_id);
create index if not exists units_membership_idx on units(membership_id);

-- ─── Giderler ──────────────────────────────────────────────────────────────
-- Düzenli gider = bütçe kalemi. Her ay aidata otomatik yansır.
create table if not exists recurring_expenses (
  id            uuid primary key default gen_random_uuid(),
  site_id       uuid not null references sites(id) on delete cascade,
  title         text not null,
  category      text not null default 'genel',
  amount_cents  bigint not null check (amount_cents >= 0),
  start_period  int not null,
  end_period    int,                            -- null → süresiz
  note          text,
  created_by    uuid references memberships(id) on delete set null,
  created_at    timestamptz not null default now()
);
create index if not exists recurring_site_idx on recurring_expenses(site_id);

-- Fiili gider = kasadan çıkan para. Fatura zorunlu (system hariç).
--   kind='budgeted' → bir bütçe kalemine mahsup edilir, aidata TEKRAR yansımaz
--   kind='one_off'  → düzensiz masraf, taksit + işletme payı ile aidata yansır
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

-- Düzensiz giderin aylara dağılımı (taksit + işletme payı uygulanmış hâli)
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
  total_area_m2     numeric(12,2) not null,
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
  area_m2       numeric(10,2) not null,
  amount_cents  bigint not null,
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
  confirmed_by  uuid references memberships(id) on delete set null,
  confirmed_at  timestamptz,
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
  bill_to_site         boolean not null default true,
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

-- Sağlayıcı seçimi eklenmeden önceki iyzico'ya özel sütunlar. Anahtarlar ayrı
-- ayrı şifrelendiği için taşınamaz; ödeme kullanan siteler anahtarlarını
-- Ayarlar ekranından yeniden girmelidir.
alter table sites drop column if exists iyzico_api_key;
alter table sites drop column if exists iyzico_secret_key;
alter table sites drop column if exists iyzico_sandbox;
