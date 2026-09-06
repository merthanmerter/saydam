/**
 * Demo verisi üretir (yalnızca geliştirme). Var olan `demo` sitesini siler.
 *   bun run db:seed
 *
 * Son altı ayın tahakkuku, tahsilatı, giderleri ve içeriğiyle birlikte
 * gerçekçi bir site kurar; tanıtım ekran görüntüleri de bu veriden çekilir.
 */

import { addMonths, currentPeriod, periodLabel } from "../src/lib/period.ts";
import { runDues } from "../src/server/accounting.ts";
import { hashPassword } from "../src/server/auth.ts";
import { sql } from "../src/server/db.ts";
import { env } from "../src/server/env.ts";
import { installmentPlan, restructurePlan } from "../src/server/money.ts";

if (process.env.NODE_ENV === "production") {
  throw new Error("Seed üretimde çalıştırılamaz");
}

const now = currentPeriod();
/** En eskiden yeniye on iki dönem. */
const periods = Array.from({ length: 12 }, (_, i) => addMonths(now, i - 11));
const first = periods[0]!;
const password = await hashPassword("saydam1234");
const invoice = (name: string) => `https://faturalar.ornek/demo/${name}.pdf`;
const dayOf = (period: number, day: number) =>
  `${Math.floor(period / 100)}-${String(period % 100).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

await sql`delete from sites where slug = 'demo'`;

const [site] = await sql`
  insert into sites (slug, name, city, address, iban, iban_holder, bank_name,
                     card_fee_pct)
  values ('demo', 'Papatya Sitesi', 'İstanbul', 'Bahçelievler Mah. Lale Sok. No:14',
          'TR330006100519786457841326', 'Papatya Sitesi Yönetimi', 'Ziraat Bankası',
          -- Kartla ödemede sakine yansıtılan komisyon farkı; isteğe bağlıdır.
          2.5)
  returning id
`;

const people = [
  ["yonetim@saydam.test", "Ayşe Yıldırım", "admin"],
  ["bora@saydam.test", "Bora Kaya", "resident"],
  ["ceren@saydam.test", "Ceren Demir", "resident"],
  ["deniz@saydam.test", "Deniz Ak", "resident"],
  ["emre@saydam.test", "Emre Şahin", "resident"],
  ["figen@saydam.test", "Figen Toprak", "resident"],
] as const;

const member: Record<string, string> = {};
for (const [email, fullName, role] of people) {
  const [user] = await sql`
    insert into users (email, full_name) values (${email}, ${fullName})
    on conflict (email) do update set full_name = excluded.full_name
    returning id
  `;
  const [membership] = await sql`
    insert into memberships (site_id, user_id, role, password_hash)
    values (${site.id}, ${user.id}, ${role}, ${password})
    returning id
  `;
  member[email] = membership.id;
}
const admin = member["yonetim@saydam.test"]!;

// Yönetici aynı zamanda B1'in sahibi — portalı sakin gözüyle de görebilir.
// Arsa payı tapudan gelir; toplamı 1000 olacak şekilde bölünmüş tipik bir tapu.
const units = [
  ["A", "1", 115, "bora@saydam.test", null],
  ["A", "2", 138, "ceren@saydam.test", null],
  ["A", "3", 142, "deniz@saydam.test", null],
  ["B", "1", 118, "yonetim@saydam.test", null],
  // B2'de malik ile kiracı ayrı: KMK m.22 senaryosu.
  ["B", "2", 255, "emre@saydam.test", "figen@saydam.test"],
  ["B", "3", 232, "figen@saydam.test", null],
] as const;

for (const [block, no, arsaPayi, owner, tenant] of units) {
  await sql`
    insert into units (site_id, block, no, arsa_payi,
                       owner_membership_id, tenant_membership_id)
    values (${site.id}, ${block}, ${no}, ${arsaPayi},
            ${member[owner]!}, ${tenant ? member[tenant]! : null})
  `;
}

// ─── Düzenli bütçe kalemleri ────────────────────────────────────────────────
// KMK m.20: kapıcı gideri EŞİT, sigorta ve ortak yer giderleri ARSA PAYI.
// Yükümlü: kullanıma bağlı yan giderler kiracıya, anayapıya ilişkin olanlar
// malike (TBK m.303). Yönetime karşı sorumluluk her hâlükârda malikte kalır.
const budgets = [
  ["Kapıcı maaşı ve SGK", "personel", 2_800_000, "esit", "kiraci"],
  ["Ortak alan elektrik", "enerji", 450_000, "arsa_payi", "kiraci"],
  ["Asansör bakım sözleşmesi", "bakim", 320_000, "arsa_payi", "kiraci"],
  ["Site sigortası", "sigorta", 180_000, "arsa_payi", "malik"],
  // Karşılığında ayrı bir fatura yoktur: büyük onarımlar için kasada birikir.
  ["Demirbaş ve yenileme fonu", "fon", 400_000, "arsa_payi", "malik"],
] as const;

const budgetIds: Record<string, string> = {};
for (const [title, category, amount, shareMethod, payer] of budgets) {
  const [row] = await sql`
    insert into recurring_expenses (site_id, title, category, amount_cents,
                                    share_method, payer, start_period, created_by)
    values (${site.id}, ${title}, ${category}, ${amount}, ${shareMethod}, ${payer},
            ${first}, ${admin})
    returning id
  `;
  budgetIds[title] = row.id;
}

// ─── Bütçe kalemlerine mahsup edilen fiilî faturalar ────────────────────────
for (const period of periods.slice(0, -1)) {
  const label = periodLabel(period);
  const bills = [
    ["Kapıcı maaşı ve SGK", `Kapıcı maaşı — ${label}`, "personel", 2_800_000, "Bordro"],
    [
      "Ortak alan elektrik",
      `Elektrik faturası — ${label}`,
      "enerji",
      430_000 + Math.round(Math.random() * 60_000),
      "BEDAŞ",
    ],
    [
      "Asansör bakım sözleşmesi",
      `Asansör bakımı — ${label}`,
      "bakim",
      320_000,
      "Kone Servis",
    ],
  ] as const;

  for (const [budget, title, category, amount, vendor] of bills) {
    await sql`
      insert into expenses (site_id, kind, recurring_expense_id, title, category, vendor,
                            amount_cents, incurred_on, period, invoice_url, invoice_name, created_by)
      values (${site.id}, 'budgeted', ${budgetIds[budget]!}, ${title}, ${category}, ${vendor},
              ${amount}, ${dayOf(period, 5)}, ${period},
              ${invoice(`${category}-${period}`)}, ${`${category}-${period}.pdf`}, ${admin})
    `;
  }
}

// ─── Olağanüstü giderler: taksitli ve işletme paylı ──────────────────────────
const oneOffs = [
  {
    title: "Çatı yalıtım yenileme",
    category: "bakim",
    vendor: "Yalıtım A.Ş.",
    amount: 3_200_000,
    period: now,
    installments: 12,
    surcharge: 8,
  },
  {
    title: "Bahçe peyzaj düzenlemesi",
    category: "cevre",
    vendor: "Yeşil Peyzaj",
    amount: 1_800_000,
    period: periods[2]!,
    installments: 3,
    surcharge: 0,
  },
  {
    title: "Otopark bariyeri onarımı",
    category: "guvenlik",
    vendor: "Barsis Otomasyon",
    amount: 420_000,
    period: periods[4]!,
    installments: 1,
    surcharge: 0,
  },
] as const;

for (const item of oneOffs) {
  const [expense] = await sql`
    insert into expenses (site_id, kind, title, category, vendor, amount_cents, incurred_on,
                          period, installments, surcharge_pct, invoice_url, invoice_name, created_by)
    values (${site.id}, 'one_off', ${item.title}, ${item.category}, ${item.vendor},
            ${item.amount}, ${dayOf(item.period, 12)}, ${item.period},
            ${item.installments}, ${item.surcharge},
            ${invoice(item.category)}, ${`${item.category}.pdf`}, ${admin})
    returning id
  `;
  await sql`insert into expense_allocations ${sql(
    installmentPlan(item.amount, item.period, item.installments, item.surcharge).map(
      (p) => ({
        expense_id: expense.id,
        site_id: site.id,
        period: p.period,
        amount_cents: p.amountCents,
      }),
    ),
  )}`;
}

// ─── Tahakkuk ve tahsilat ───────────────────────────────────────────────────
for (const period of periods) await runDues(site.id, period, admin);

const unitRows = await sql`
  select u.id, u.block, u.no,
         coalesce(u.tenant_membership_id, u.owner_membership_id) as "membershipId"
    from units u
   where u.site_id = ${site.id} order by u.block, u.no
`;

for (const [index, period] of periods.entries()) {
  const dues = await sql`
    select unit_id as "unitId", amount_cents as "amountCents"
      from dues where site_id = ${site.id} and period = ${period}
  `;
  for (const due of dues) {
    const unit = unitRows.find((u: { id: string }) => u.id === due.unitId)!;
    // B3 iki aydır ödemiyor, A3 son ayı geciktirdi: gerçekçi bir borç tablosu.
    const label = `${unit.block}${unit.no}`;
    const last = periods.length - 1;
    if (label === "B3" && index >= last - 2) continue;
    if (label === "A3" && index === last) continue;

    const pending = label === "A2" && index === last;
    await sql`
      insert into payments (site_id, unit_id, membership_id, amount_cents, method, status,
                            reference, paid_at, decided_by, decided_at)
      values (${site.id}, ${due.unitId}, ${unit.membershipId}, ${due.amountCents},
              ${index % 3 === 0 ? "online" : "transfer"},
              ${pending ? "pending" : "confirmed"},
              ${`${periodLabel(period)} aidat`},
              ${dayOf(period, 8)},
              ${pending ? null : admin}, ${pending ? null : new Date()})
    `;
  }
}

// ─── İçerik ─────────────────────────────────────────────────────────────────
await sql`
  insert into posts (site_id, kind, pinned, title, body, membership_id) values
  (${site.id}, 'announcement', true, 'Çatı yalıtım çalışması 14 Mart’ta başlıyor',
   ${`Çatı yalıtımı yenileme işi Yalıtım A.Ş. ile sözleşmeye bağlanmıştır. İlk hakediş bedeli 32.000 ₺ olup, genel kurul kararı gereği 12 aya bölünmüş ve %8 işletme payı eklenmiştir. Aylık aidata yansıyan tutarı Aidatlar sayfasından kalem kalem görebilirsiniz.\n\nÇalışma sırasında teras katı iki hafta boyunca kullanıma kapalı olacaktır.`},
   ${admin}),
  (${site.id}, 'announcement', false, 'Nisan ayı olağan toplantı tutanağı yayımlandı',
   ${"Toplantı tutanağı ve alınan kararlar Dokümanlar sayfasına yüklenmiştir. Bahçe peyzaj bütçesi ve otopark bariyeri onarımı oy birliğiyle kabul edilmiştir."},
   ${admin}),
  (${site.id}, 'announcement', false, 'Su deposu temizliği',
   ${"Ana su deposu temizliği ayın son cumartesi günü 09.00-13.00 arasında yapılacak, bu saatlerde su kesintisi olacaktır."},
   ${admin})
`;

await sql`
  insert into documents (site_id, title, category, file_url, file_name, size_bytes, uploaded_by) values
  (${site.id}, 'Site Yönetim Planı', 'yonetmelik', ${invoice("yonetim-plani")}, 'yonetim-plani.pdf', 842_112, ${admin}),
  (${site.id}, 'Olağan Genel Kurul Tutanağı', 'toplanti', ${invoice("genel-kurul")}, 'genel-kurul-tutanak.pdf', 318_540, ${admin}),
  (${site.id}, 'Asansör Bakım Sözleşmesi', 'sozlesme', ${invoice("asansor")}, 'asansor-sozlesme.pdf', 196_003, ${admin}),
  (${site.id}, 'Çatı Yalıtım Teknik Şartnamesi', 'proje', ${invoice("cati-sartname")}, 'cati-sartname.pdf', 1_204_887, ${admin})
`;

const [post] = await sql`
  insert into posts (site_id, membership_id, title, body) values
  (${site.id}, ${member["ceren@saydam.test"]!}, 'Otopark giriş kartları yenilenecek mi?',
   ${"Bariyer onarıldı ama benim kartım hâlâ okunmuyor. Yeni kart dağıtımı planlanıyor mu, yoksa mevcut kartlar mı güncellenecek?"})
  returning id
`;
await sql`
  insert into posts (site_id, membership_id, title, body) values
  (${site.id}, ${member["emre@saydam.test"]!}, 'Bisiklet park alanı önerisi',
   ${"B blok girişindeki boş alana bisiklet park demiri koyabilir miyiz? Maliyeti düşük, kullanan da çok. Bir sonraki toplantıda gündeme alınmasını öneriyorum."}),
  (${site.id}, ${member["bora@saydam.test"]!}, 'Kış bahçesi aydınlatmaları',
   ${"Bahçe düzenlemesi sonrası aydınlatmaların bir kısmı yanmıyor. Peyzaj firmasının garanti kapsamında bakması gerekmez mi?"})
`;
await sql`
  insert into post_comments (post_id, site_id, membership_id, body) values
  (${post.id}, ${site.id}, ${admin},
   ${"Bariyer firması yeni kart okuyucuyu perşembe günü değiştirecek. Mevcut kartlar geçerli kalacak, ayrıca dağıtım yapılmayacak."}),
  (${post.id}, ${site.id}, ${member["deniz@saydam.test"]!},
   ${"Bende de aynı sorun vardı, okuyucuya biraz yavaş yaklaştırınca çalışıyor."})
`;

await sql`
  insert into messages (site_id, sender_id, recipient_id, body, read_at) values
  (${site.id}, ${member["figen@saydam.test"]!}, ${admin},
   ${"Merhaba, mart ayı aidatını 8 Mart’ta havale ettim ama ödemelerde görünmüyor. Kontrol edebilir misiniz?"}, now()),
  (${site.id}, ${admin}, ${member["figen@saydam.test"]!},
   ${"Merhaba, dekontu gördük ve ödemenizi işledik. Bakiyeniz güncellendi, ilginiz için teşekkürler."}, null),
  (${site.id}, ${member["bora@saydam.test"]!}, ${admin},
   ${"Çatı çalışması sırasında teras katına erişim tamamen kapalı mı olacak?"}, null)
`;

if (env.saasMode) {
  await sql`
    insert into subscriptions (site_id, plan, status, price_cents, bill_to_site,
                               current_period_start, current_period_end)
    values (${site.id}, 'monthly', 'active', 190000, false,
            current_date, current_date + 30)
  `;
}

const [check] = await sql`
  select (select count(*)::int from dues where site_id = ${site.id}) as dues,
         (select count(*)::int from payments where site_id = ${site.id}) as payments,
         (select count(*)::int from expenses where site_id = ${site.id}) as expenses
`;
// ── Örnek yapılandırma: B3 borcunu taksite bağlar ──────────────────────────
// B3 son üç dönemi ödemedi; yönetim bu borcu %5 vade farkıyla 6 taksite bağlar.
// Yapılandırma yürürlükteyken gecikme tazminatı bu taksitlerin vadesine göre
// işler — eski aidat vadelerine göre değil.
{
  const [b3] = await sql`
    select id from units where site_id = ${site.id} and block = 'B' and no = '3'
  `;
  const [debt] = await sql`
    select coalesce(sum(d.amount_cents), 0)
           - coalesce((select sum(p.amount_cents) from payments p
                        where p.unit_id = ${b3.id} and p.status = 'confirmed'), 0) as owed
      from dues d where d.unit_id = ${b3.id}
  `;
  const principal = Number(debt.owed);
  if (principal > 0) {
    const plan = restructurePlan(principal, 5, 6, dayOf(now, 15));
    const [row] = await sql`
      insert into restructurings (site_id, unit_id, principal_cents, interest_pct,
                                  interest_cents, total_cents, installments,
                                  covers_through, note, created_by)
      values (${site.id}, ${b3.id}, ${plan.principalCents}, 5, ${plan.interestCents},
              ${plan.totalCents}, 6, ${dayOf(now, 1)},
              'Sakinle görüşülerek altı taksite bağlandı', ${admin})
      returning id
    `;
    await sql`insert into restructuring_installments ${sql(
      plan.rows.map((i) => ({
        restructuring_id: row.id,
        site_id: site.id,
        unit_id: b3.id,
        no: i.no,
        due_date: i.dueDate,
        amount_cents: i.amountCents,
      })),
    )}`;
  }
}

console.log(
  `✓ Demo site hazır — ${periods.length} dönem, ${check.dues} tahakkuk, ${check.payments} tahsilat, ${check.expenses} gider`,
);
console.log("  Yönetim: yonetim@saydam.test / saydam1234 (Papatya Sitesi)");
console.log("  Sakin:   bora@saydam.test / saydam1234");
await sql.close();
