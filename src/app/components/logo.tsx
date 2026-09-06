/**
 * say-dam markası.
 *
 * Ad iki parçadan geliyor: "say" (sayı) ve "dam" (çatı). İşaret de bunu
 * birebir kuruyor — bir çatı hattının altında yükselen üç sütun: çatı altındaki
 * sayılar. Aynı zamanda ürünün kendisi: bir binanın rakamları.
 *
 * Tek bir 32×32 ızgarada, tek kalınlıkta ve yuvarlak uçlu çizilir; arayüzdeki
 * lucide ikonlarıyla aynı dili konuşsun diye. Renk `currentColor` üzerinden
 * gelir, böylece bulunduğu yerin rengini alır.
 */
export function Logo({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      role="img"
      aria-label="say-dam"
    >
      {/* Çatı */}
      <path d="M5 16 16 6.5 27 16" />
      {/* Çatı altındaki sayılar */}
      <path d="M10.5 25.5v-3.5" />
      <path d="M16 25.5v-6" />
      <path d="M21.5 25.5v-8.5" />
    </svg>
  );
}

/** İşaret + yazı. Başlık, giriş ekranı ve altbilgide ortak kullanılır. */
export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={`flex items-center gap-2 font-semibold ${className ?? ""}`}>
      <Logo className="size-[1.35em] shrink-0 text-primary" />
      <span className="tracking-tight">say-dam</span>
    </span>
  );
}
