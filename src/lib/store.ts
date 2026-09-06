import { Store, useStore } from "@tanstack/react-store";

/**
 * Tarayıcıda kalıcı, tepkisel istemci durumu.
 *
 * Değerler hem React dışından (istek başlıklarını kuran `api.ts`) hem de
 * bileşenlerden okunuyor; `Store` ikisini tek kaynağa bağlıyor. Önceden her
 * değer kendi `localStorage` sarmalayıcısıyla okunuyordu ve değişince hiçbir
 * şey haberdar olmuyordu.
 *
 * Depolama gizli sekmede kapalı olabilir; okuma da yazma da sessizce
 * varsayılana düşer, uygulama çalışmaya devam eder.
 */
export function persisted<T extends string>(
  key: string,
  fallback: T,
  valid: (v: string) => v is T,
) {
  const read = (): T => {
    try {
      const stored = localStorage.getItem(key);
      return stored !== null && valid(stored) ? stored : fallback;
    } catch {
      return fallback;
    }
  };

  const store = new Store<T>(read());

  return {
    get: () => store.state,
    set: (value: T) => {
      store.setState(() => value);
      try {
        localStorage.setItem(key, value);
      } catch {
        /* depolama kapalı; oturum boyunca bellekte tutulur */
      }
    },
    /** Bileşenler için: değer değişince yeniden çizilir. */
    use: () => useStore(store),
  };
}

/**
 * Görünüm modu. Kendi dairesi olan bir yönetici, portalı sakin gözüyle
 * görmek için bu modu değiştirir. Yetkiyi değiştirmez; yalnızca sunucudan
 * dönen okuma kapsamını ve arayüzü daraltır.
 */
export type ViewMode = "admin" | "resident";

export const VIEW_HEADER = "x-saydam-view";

const isMode = (value: string): value is ViewMode =>
  value === "admin" || value === "resident";

export const view = persisted<ViewMode>("saydam-view", "admin", isMode);
