import { persisted } from "./store";

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
