import { queryOptions, useQuery, useQueryClient } from "@tanstack/react-query";
import { createContext, type ReactNode, use, useCallback, useEffect } from "react";
import { rememberRole } from "@/app/portal/nav";
import { api } from "@/lib/api";
import { type ViewMode, view } from "@/lib/view";

type Me = {
  membershipId: string;
  siteId: string;
  siteName: string;
  siteSlug: string;
  userId: string;
  email: string;
  fullName: string;
  role: "admin" | "resident";
  /** Etkin görünüm modu (sunucunun onayladığı hâli). */
  view: "admin" | "resident";
  status: "active" | "removed";
  unitCount: number;
  subscription: {
    required: boolean;
    status: "trialing" | "active" | "grace" | "expired" | "none";
    validUntil: string | null;
    daysLeft: number;
    locked: boolean;
  };
};

/**
 * Oturum sorgusu.
 *
 * Hem `SessionProvider` hem de yönlendiricinin `beforeLoad` koruması aynı
 * seçenekleri kullanır: koruma veriyi bir kez çeker, bileşen aynı önbellekten
 * okur. Panel açılırken oturum için ikinci bir istek gitmez.
 */
export const meQuery = queryOptions({
  queryKey: ["/auth/me"],
  queryFn: () => api<{ me: Me | null; saasMode: boolean }>("/auth/me"),
  staleTime: 60_000,
});

type Session = {
  me: Me | null;
  saasMode: boolean;
  loading: boolean;
  /** Arayüz yönetim görünümünde mi? Rol değil, görünüm modu belirler. */
  isAdmin: boolean;
  /** Gerçek rol yönetici mi? Görünüm değiştiriciyi göstermek için. */
  canAdmin: boolean;
  setView: (mode: ViewMode) => void;
  refetch: () => void;
};

const SessionContext = createContext<Session>({
  me: null,
  saasMode: false,
  loading: true,
  isAdmin: false,
  canAdmin: false,
  setView: () => {},
  refetch: () => {},
});

export function SessionProvider({ children }: { children: ReactNode }) {
  const client = useQueryClient();
  const { data, isPending, refetch } = useQuery(meQuery);

  /**
   * Mod değişince kapsamı daralan/genişleyen tüm sorgular yeniden çekilir.
   *
   * `clear()` değil `resetQueries()`: ilki önbelleği boşaltıp etkin sorguları
   * yeniden çekmiyor, ekranda eski kapsamın verisi kalıyordu.
   */
  const setView = useCallback(
    (mode: ViewMode) => {
      view.set(mode);
      void client.resetQueries();
    },
    [client],
  );

  /*
   * Rol, yüklenme iskeletinin menüyü kaç satır çizeceğini belirliyor; oturum
   * bilgisi gelmeden bilinemediği için son bilinen değer saklanır.
   */
  const admin = data?.me?.view === "admin";
  useEffect(() => {
    if (data?.me) rememberRole(admin);
  }, [data?.me, admin]);

  return (
    <SessionContext
      value={{
        me: data?.me ?? null,
        saasMode: data?.saasMode ?? false,
        loading: isPending,
        isAdmin: admin,
        canAdmin: data?.me?.role === "admin",
        setView,
        refetch,
      }}
    >
      {children}
    </SessionContext>
  );
}

export const useSession = () => use(SessionContext);
