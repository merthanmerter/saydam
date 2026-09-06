import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { lazy, StrictMode, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes } from "react-router";
import { AppErrorBoundary } from "@/app/components/error-boundary";
import { AppSkeleton } from "@/app/components/route-skeleton";
import Home from "@/app/marketing/Home";
import { SessionProvider } from "@/app/session";
import { Toaster } from "@/components/ui/sonner";

/**
 * Portal ayrı bir pakete çıkar: anasayfayı açan ziyaretçinin yönetim
 * ekranlarının kodunu indirmesi gerekmez. Bekleme, portalın kendi yükleme
 * göstergesiyle karşılanır.
 */
const loadLogin = () => import("@/app/pages/Login");
const Login = lazy(loadLogin);
const Register = lazy(() => import("@/app/pages/Register"));
const SetPassword = lazy(() => import("@/app/pages/SetPassword"));

const PortalLayout = lazy(() => import("@/app/portal/Layout"));
const Dashboard = lazy(() => import("@/app/portal/Dashboard"));
const Dues = lazy(() => import("@/app/portal/Dues"));
const Payments = lazy(() => import("@/app/portal/Payments"));
const Reports = lazy(() => import("@/app/portal/Reports"));
const Expenses = lazy(() => import("@/app/portal/Expenses"));
const Units = lazy(() => import("@/app/portal/Units"));
const Residents = lazy(() => import("@/app/portal/Residents"));
const Documents = lazy(() => import("@/app/portal/Documents"));
const Board = lazy(() => import("@/app/portal/Board"));
const Messages = lazy(() => import("@/app/portal/Messages"));
const Settings = lazy(() => import("@/app/portal/Settings"));

const client = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 15_000, retry: 1, refetchOnWindowFocus: false },
  },
});

/*
 * Giriş ekranı ayrı bir pakette (site arama bileşenini de o taşıyor), ama
 * anasayfadaki başlıca çağrı düğmesi oraya gidiyor. Tarayıcı boşa çıkar
 * çıkmaz paketi arka planda indiriyoruz: tıklandığında bekleme olmuyor,
 * anasayfanın ilk yükü de büyümüyor.
 */
if (typeof requestIdleCallback === "function") requestIdleCallback(() => void loadLogin());
else setTimeout(() => void loadLogin(), 1500);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AppErrorBoundary>
      <QueryClientProvider client={client}>
        <BrowserRouter>
          <SessionProvider>
            <Suspense fallback={<AppSkeleton pathname={window.location.pathname} />}>
              <Routes>
                <Route path="/" element={<Home />} />
                <Route path="/giris" element={<Login />} />
                <Route path="/kayit" element={<Register />} />
                <Route path="/sifre-belirle/:token" element={<SetPassword />} />

                <Route path="/panel" element={<PortalLayout />}>
                  <Route index element={<Dashboard />} />
                  <Route path="aidatlar" element={<Dues />} />
                  <Route path="odemeler" element={<Payments />} />
                  {/* Yapılandırma ödemeler ekranından yönetiliyor. */}
                  <Route
                    path="yapilandirma"
                    element={<Navigate to="/panel/odemeler" replace />}
                  />
                  <Route path="giderler" element={<Expenses />} />
                  <Route path="daireler" element={<Units />} />
                  <Route path="sakinler" element={<Residents />} />
                  <Route path="dokumanlar" element={<Documents />} />
                  <Route path="pano" element={<Board />} />
                  <Route path="mesajlar" element={<Messages />} />
                  <Route path="raporlar" element={<Reports />} />
                  <Route path="ayarlar" element={<Settings />} />
                </Route>
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </Suspense>
          </SessionProvider>
        </BrowserRouter>
        <Toaster position="top-center" richColors />
      </QueryClientProvider>
    </AppErrorBoundary>
  </StrictMode>,
);
