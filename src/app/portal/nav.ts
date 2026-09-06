import type { LinkProps } from "@tanstack/react-router";
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
import { persisted } from "@/lib/store";

export type NavItem = {
  /** Yönlendiricinin tanıdığı yollar; yanlış yazılan bir bağlantı derlenmez. */
  to: LinkProps["to"];
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
const role = persisted("saydam.admin", "0", (v): v is "0" | "1" => v === "0" || v === "1");

export const rememberRole = (admin: boolean) => role.set(admin ? "1" : "0");
export const lastKnownAdmin = () => role.get() === "1";

export const navFor = (admin: boolean) => NAV.filter((i) => !i.adminOnly || admin);
