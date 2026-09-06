/**
 * Görünüm modu. Kendi dairesi olan bir yönetici, portalı sakin gözüyle
 * görmek için bu modu değiştirir. Yetkiyi değiştirmez; yalnızca sunucudan
 * dönen okuma kapsamını ve arayüzü daraltır.
 */
export type ViewMode = "admin" | "resident";

const KEY = "saydam-view";
export const VIEW_HEADER = "x-saydam-view";

export const readView = (): ViewMode => {
  try {
    return localStorage.getItem(KEY) === "resident" ? "resident" : "admin";
  } catch {
    return "admin";
  }
};

export const writeView = (mode: ViewMode) => {
  try {
    localStorage.setItem(KEY, mode);
  } catch {
    /* gizli sekmede depolama kapalı olabilir */
  }
};
