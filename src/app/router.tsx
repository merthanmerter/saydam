import type { QueryClient } from "@tanstack/react-query";
import {
  createRootRouteWithContext,
  createRoute,
  createRouter,
  lazyRouteComponent,
  redirect,
} from "@tanstack/react-router";
import { z } from "zod";
import { PendingApp, PendingRoute } from "@/app/components/route-skeleton";
import Home from "@/app/marketing/Home";
import { meQuery } from "@/app/session";
import { pagedPath, query } from "@/lib/api";
import { currentPeriod } from "@/lib/format";

/**
 * Yönlendirme ağacı.
 *
 * Dosya tabanlı değil kod tabanlı: uygulama on iki sayfadan ibaret, hepsi tek
 * bakışta burada duruyor ve kod tabanlı ağaç Bun'ın kendi paketleyicisiyle ek
 * eklenti gerektirmeden çalışıyor.
 *
 * Her sayfanın `loader`'ı iki işi aynı anda başlatır: paketi indirmek ve
 * verisini çekmek. Hiçbirini beklemez — beklese gezinme, veri gelene kadar
 * eski sayfada donardı. Bunun yerine bileşen askıya alınır ve sayfanın kendi
 * iskeleti çizilir. `defaultPreload: "intent"` sayesinde menüde fareyi
 * bekletmek ikisini de başlattığı için tıklandığında çoğu zaman bekleme
 * hiç olmaz.
 */

type RouterContext = { queryClient: QueryClient };

const rootRoute = createRootRouteWithContext<RouterContext>()();

/**
 * Yıl ve dönem seçicileri adres çubuğunda: geri tuşu ve paylaşılan bağlantı
 * çalışsın. `default` sayesinde bağlantı kurarken yazmak zorunlu değil,
 * `catch` sayesinde elle bozulmuş bir adres sayfayı düşürmez.
 */
const THIS_YEAR = new Date().getFullYear();
const yearSearch = z.object({
  yil: z.coerce.number().int().min(2000).max(2100).default(THIS_YEAR).catch(THIS_YEAR),
});

/*
 * Anasayfa tembel değil: ziyaretçinin ilk gördüğü ekran için ikinci bir ağ
 * gidiş dönüşü beklemek anlamsız. Panelin tamamı ise tembel, yani anasayfayı
 * açan biri yönetim ekranlarının kodunu hiç indirmez.
 */
const login = () => import("@/app/pages/Login");

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: Home,
});

export const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/giris",
  component: lazyRouteComponent(login),
  validateSearch: z.object({ from: z.string().optional().catch(undefined) }),
});

const registerRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/kayit",
  component: lazyRouteComponent(() => import("@/app/pages/Register")),
});

export const setPasswordRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/sifre-belirle/$token",
  component: lazyRouteComponent(() => import("@/app/pages/SetPassword")),
});

/**
 * Panel kabuğu ve oturum koruması.
 *
 * Koruma bileşende değil burada: oturumu olmayan kullanıcı için panel paketi
 * hiç indirilmez, yarım çizilip kaybolan bir ekran da olmaz. Oturum bilgisi
 * `beforeLoad` içinde önbelleğe alındığı için `useSession` aynı veriyi ikinci
 * kez istemez.
 */
export const portalRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/panel",
  component: lazyRouteComponent(() => import("@/app/portal/Layout")),
  // Kabuk henüz gelmediği için kenar çubuğuyla birlikte iskelet çizilir.
  pendingComponent: PendingApp,
  beforeLoad: async ({ context, location }) => {
    const { me } = await context.queryClient.ensureQueryData(meQuery);
    if (!me) throw redirect({ to: "/giris", search: { from: location.pathname } });
    return { me };
  },
});

/** Paketi ve verileri başlatır, hiçbirini beklemez. */
const warm = (queryClient: QueryClient, chunk: () => Promise<unknown>, paths: string[]) => {
  void chunk();
  for (const path of paths) void queryClient.prefetchQuery(query(path));
};

const portalPage = <TPath extends string>(
  path: TPath,
  chunk: () => Promise<{ default: React.ComponentType }>,
  paths: string[] = [],
) =>
  createRoute({
    getParentRoute: () => portalRoute,
    path,
    component: lazyRouteComponent(chunk),
    loader: ({ context }) => warm(context.queryClient, chunk, paths),
  });

const dashboardRoute = portalPage("/", () => import("@/app/portal/Dashboard"), [
  "/reports/treasury",
  "/site",
  "/reports/balances?size=500",
  "/reports/monthly",
  pagedPath("/posts", 1, 10),
]);

export const duesRoute = createRoute({
  getParentRoute: () => portalRoute,
  path: "aidatlar",
  component: lazyRouteComponent(() => import("@/app/portal/Dues")),
  validateSearch: z.object({
    donem: z.coerce
      .number()
      .int()
      .min(200001)
      .max(210012)
      .default(currentPeriod())
      .catch(currentPeriod()),
  }),
  loaderDeps: ({ search }) => ({ donem: search.donem }),
  loader: ({ context, deps }) =>
    warm(context.queryClient, () => import("@/app/portal/Dues"), [
      `/budget/${deps.donem}`,
      pagedPath(`/dues?period=${deps.donem}`),
      "/site",
    ]),
});

export const paymentsRoute = createRoute({
  getParentRoute: () => portalRoute,
  path: "odemeler",
  component: lazyRouteComponent(() => import("@/app/portal/Payments")),
  // Ödeme sağlayıcısı kullanıcıyı buraya sonuçla birlikte döndürür.
  validateSearch: z.object({
    odeme: z.enum(["basarili", "alindi", "hata"]).optional().catch(undefined),
  }),
  loader: ({ context }) =>
    warm(context.queryClient, () => import("@/app/portal/Payments"), [
      pagedPath("/payments"),
      "/reports/balances?size=500",
      "/site",
    ]),
});

export const expensesRoute = createRoute({
  getParentRoute: () => portalRoute,
  path: "giderler",
  component: lazyRouteComponent(() => import("@/app/portal/Expenses")),
  validateSearch: yearSearch,
  loaderDeps: ({ search }) => ({ yil: search.yil }),
  loader: ({ context, deps }) =>
    warm(context.queryClient, () => import("@/app/portal/Expenses"), [
      pagedPath(`/expenses?year=${deps.yil}`),
      "/recurring",
    ]),
});

export const reportsRoute = createRoute({
  getParentRoute: () => portalRoute,
  path: "raporlar",
  component: lazyRouteComponent(() => import("@/app/portal/Reports")),
  validateSearch: yearSearch,
  loader: ({ context }) =>
    warm(context.queryClient, () => import("@/app/portal/Reports"), [
      "/reports/treasury",
      pagedPath("/reports/balances"),
    ]),
});

export const settingsRoute = createRoute({
  getParentRoute: () => portalRoute,
  path: "ayarlar",
  component: lazyRouteComponent(() => import("@/app/portal/Settings")),
  validateSearch: z.object({
    abonelik: z.enum(["basarili", "alindi", "hata"]).optional().catch(undefined),
  }),
  loader: ({ context }) =>
    warm(context.queryClient, () => import("@/app/portal/Settings"), [
      "/site",
      "/auth/my-sites",
    ]),
});

/** Yapılandırma artık ödemeler ekranından yönetiliyor. */
const restructuringRedirect = createRoute({
  getParentRoute: () => portalRoute,
  path: "yapilandirma",
  beforeLoad: () => {
    throw redirect({ to: "/panel/odemeler", search: {} });
  },
});

export const router = createRouter({
  routeTree: rootRoute.addChildren([
    indexRoute,
    loginRoute,
    registerRoute,
    setPasswordRoute,
    portalRoute.addChildren([
      dashboardRoute,
      duesRoute,
      paymentsRoute,
      expensesRoute,
      reportsRoute,
      settingsRoute,
      restructuringRedirect,
      portalPage("daireler", () => import("@/app/portal/Units"), [
        pagedPath("/units"),
        "/residents?size=500",
      ]),
      portalPage("sakinler", () => import("@/app/portal/Residents"), [
        pagedPath("/residents"),
      ]),
      portalPage("dokumanlar", () => import("@/app/portal/Documents"), [
        pagedPath("/documents"),
      ]),
      portalPage("pano", () => import("@/app/portal/Board"), [pagedPath("/posts")]),
      portalPage("mesajlar", () => import("@/app/portal/Messages"), ["/messages"]),
    ]),
  ]),
  context: { queryClient: undefined as unknown as QueryClient },
  defaultPreload: "intent",
  // Tazelik kararı React Query'nin: yönlendirici veriyi ikinci kez
  // önbelleklemesin, yoksa aynı kayıt iki yerde ayrı ayrı eskir.
  defaultPreloadStaleTime: 0,
  // Bekleme göstergesi anında: sayfanın kendi iskeleti zaten hazır, bir
  // saniye boş ekran göstermenin anlamı yok.
  defaultPendingComponent: PendingRoute,
  defaultPendingMs: 0,
  defaultPendingMinMs: 0,
  defaultNotFoundComponent: () => {
    throw redirect({ to: "/" });
  },
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
