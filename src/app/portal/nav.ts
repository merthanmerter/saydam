import {
  Banknote,
  ChartNoAxesCombined,
  DoorOpen,
  FileText,
  LayoutDashboard,
  Megaphone,
  MessagesSquare,
  Receipt,
  Settings2,
  Users,
  Wallet,
} from "lucide-react";

export type NavItem = {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
  end?: boolean;
  badge?: "messages";
  adminOnly?: boolean;
};

/**
 * Kenar çubuğu menüsü.
 *
 * Ayrı bir modülde, çünkü hem gerçek kenar çubuğu hem de yüklenme iskeleti
 * aynı listeden çiziliyor: etiketler burada durduğu sürece iskeletteki
 * bloklar gerçek yazının genişliğinde olur, tahmine gerek kalmaz.
 */
export const NAV: NavItem[] = [
  { to: "/panel", label: "Panel", icon: LayoutDashboard, end: true },
  { to: "/panel/aidatlar", label: "Aidatlar", icon: Banknote },
  { to: "/panel/odemeler", label: "Ödemeler", icon: Wallet },
  { to: "/panel/giderler", label: "Giderler", icon: Receipt },
  { to: "/panel/raporlar", label: "Raporlar", icon: ChartNoAxesCombined },
  { to: "/panel/dokumanlar", label: "Dokümanlar", icon: FileText },
  { to: "/panel/pano", label: "Pano", icon: Megaphone },
  { to: "/panel/mesajlar", label: "Mesajlar", icon: MessagesSquare, badge: "messages" },
  { to: "/panel/daireler", label: "Daireler", icon: DoorOpen, adminOnly: true },
  { to: "/panel/sakinler", label: "Sakinler", icon: Users, adminOnly: true },
  { to: "/panel/ayarlar", label: "Ayarlar", icon: Settings2 },
];

/**
 * Son girişte yöneticiydi mi?
 *
 * Oturum bilgisi gelmeden menünün kaç satır olacağı bilinemez; yönetici iki
 * satır fazla görür. Son bilinen rol saklanınca iskelet doğru sayıda satır
 * çizer. Bilinmiyorsa sakin varsayılır — fazladan satır göstermektense eksik
 * göstermek yeğdir.
 */
const KEY = "saydam.admin";

export const rememberRole = (admin: boolean) => {
  try {
    localStorage.setItem(KEY, admin ? "1" : "0");
  } catch {
    // Gizli sekmede depolama kapalı olabilir; iskelet yine de çizilir.
  }
};

export const lastKnownAdmin = () => {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
};

export const navFor = (admin: boolean) => NAV.filter((i) => !i.adminOnly || admin);
