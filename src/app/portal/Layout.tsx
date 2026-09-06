import { useQueryClient } from "@tanstack/react-query";
import { Link, Outlet, useLocation, useNavigate } from "@tanstack/react-router";
import { CreditCard, Eye, LogOut, Menu, Settings2, ShieldCheck } from "lucide-react";
import { Suspense, useState } from "react";
import { RouteErrorBoundary } from "@/app/components/error-boundary";
import { Logo } from "@/app/components/logo";
import { RouteSkeleton } from "@/app/components/route-skeleton";
import { navFor } from "@/app/portal/nav";
import { portalRoute } from "@/app/router";
import { useSession } from "@/app/session";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { post, useApi } from "@/lib/api";
import { initials } from "@/lib/format";
import { cn } from "@/lib/utils";

export default function PortalLayout() {
  // Oturum yönlendiricinin `beforeLoad` korumasında doğrulandı ve bağlamla
  // buraya geldi: "yükleniyor" ya da "oturum yok" hâli tip düzeyinde yok.
  const { me } = portalRoute.useRouteContext();
  const { isAdmin, canAdmin, setView } = useSession();
  const location = useLocation();
  const client = useQueryClient();
  const [mobileOpen, setMobileOpen] = useState(false);
  const unread = useApi<{ unread: number }>("/messages", Boolean(me)).data?.unread ?? 0;

  const items = navFor(isAdmin);

  const nav = (
    <nav className="grid gap-0.5">
      {items.map(({ to, label, icon: Icon, badge, end }) => (
        <Link
          key={to}
          to={to}
          activeOptions={{ exact: end ?? false }}
          onClick={() => setMobileOpen(false)}
          className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-muted-foreground text-sm transition-colors hover:bg-sidebar-accent/60 hover:text-foreground"
          activeProps={{
            className: "bg-sidebar-accent font-medium text-sidebar-accent-foreground",
          }}
        >
          <Icon className="size-4 shrink-0" />
          <span className="flex-1">{label}</span>
          {badge === "messages" && unread > 0 && (
            <Badge className="h-5 min-w-5 px-1.5 text-[11px]">{unread}</Badge>
          )}
        </Link>
      ))}
    </nav>
  );

  return (
    <div className="min-h-screen bg-background">
      {/* Kenar çubuğu sol kenara yapışık; içerik kalan alanda ortalanıp genişliği sınırlı kalır. */}
      <div className="flex">
        <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r bg-sidebar px-3 py-4 lg:flex">
          <Brand siteName={me.siteName} />
          <div className="mt-5 flex-1 overflow-y-auto">{nav}</div>
          <UserMenu />
        </aside>

        <div className="min-w-0 flex-1">
          <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b bg-background/85 px-4 backdrop-blur lg:hidden">
            <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" aria-label="Menü">
                  <Menu className="size-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-64 bg-sidebar p-3">
                <SheetTitle className="sr-only">Menü</SheetTitle>
                <Brand siteName={me.siteName} />
                <div className="mt-5">{nav}</div>
              </SheetContent>
            </Sheet>
            <span className="truncate font-medium">{me.siteName}</span>
            <div className="ml-auto">
              <UserMenu compact />
            </div>
          </header>

          {canAdmin && me.subscription.required && <SubscriptionNotice me={me} />}

          {canAdmin && !isAdmin && (
            <div className="flex flex-wrap items-center gap-2 border-b bg-accent px-6 py-2.5 text-sm">
              <Eye className="size-4 shrink-0" />
              Sakin görünümündesiniz — yalnızca kendi dairelerinizin kayıtlarını
              görüyorsunuz.
              <Button
                variant="outline"
                size="sm"
                className="ml-auto"
                onClick={() => setView("admin")}
              >
                Yönetim görünümüne dön
              </Button>
            </div>
          )}

          {me.status === "removed" && (
            <div className="border-b bg-[color-mix(in_oklab,var(--warning)_18%,transparent)] px-6 py-2.5 text-sm">
              Bu siteden ayrıldınız. Geçmiş kayıtlarınızı görüntüleyebilir, yeni işlem
              yapamazsınız.
            </div>
          )}

          {/*
            Sayfa verisi hazır olana kadar React bileşeni hiç boyamaz; yedek
            olarak gösterge çizilir. Sınır yola göre anahtarlanır, böylece
            geçişte önceki sayfa ekranda kalmaz ve hata durumu sıfırlanır.
          */}
          <main className="mx-auto max-w-[1160px] px-5 py-7 md:px-8">
            <RouteErrorBoundary
              resetKey={location.pathname}
              onReset={() => client.resetQueries()}
            >
              <Suspense
                key={location.pathname}
                fallback={<RouteSkeleton pathname={location.pathname} />}
              >
                <Outlet />
              </Suspense>
            </RouteErrorBoundary>
          </main>
        </div>
      </div>
    </div>
  );
}

/**
 * Abonelik uyarısı yalnızca yöneticiye gösterilir; ödeme yükümlüsü odur ve
 * sakinlerin ekranını bununla meşgul etmenin anlamı yok.
 */
function SubscriptionNotice({
  me,
}: {
  me: NonNullable<ReturnType<typeof useSession>["me"]>;
}) {
  const { status, daysLeft, locked } = me.subscription;
  if (status === "active") return null;

  const message =
    status === "trialing"
      ? `Ücretsiz deneme süreniz ${daysLeft} gün sonra bitiyor.`
      : status === "grace"
        ? `Aboneliğinizin süresi doldu. ${7 + daysLeft} gün içinde yenilenmezse yönetim işlemleri kilitlenir.`
        : "Aboneliğiniz sona erdi; yönetim işlemleri kilitli. Sakinler kayıtları görmeye ve ödeme yapmaya devam ediyor.";

  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-2 border-b px-6 py-2.5 text-sm",
        locked
          ? "bg-destructive/10"
          : "bg-[color-mix(in_oklab,var(--warning)_18%,transparent)]",
      )}
    >
      <CreditCard className="size-4 shrink-0" />
      {message}
      <Button variant="outline" size="sm" className="ml-auto" asChild>
        <Link to="/panel/ayarlar">Aboneliği yönet</Link>
      </Button>
    </div>
  );
}

const Brand = ({ siteName }: { siteName: string }) => (
  <Link to="/panel" className="flex items-center gap-2.5 px-2">
    <Logo className="size-6 shrink-0 text-primary" />
    <span className="min-w-0">
      <span className="block truncate font-semibold text-sm">{siteName}</span>
      <span className="block text-[11px] text-muted-foreground">say-dam portal</span>
    </span>
  </Link>
);

function UserMenu({ compact }: { compact?: boolean }) {
  const { me, isAdmin, canAdmin, setView } = useSession();
  const navigate = useNavigate();

  const logout = async () => {
    await post("/auth/logout");
    window.location.href = "/";
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          className={cn("h-auto justify-start gap-2 px-2 py-2", !compact && "w-full")}
        >
          <Avatar className="size-7">
            <AvatarFallback className="text-[11px]">
              {initials(me?.fullName)}
            </AvatarFallback>
          </Avatar>
          {!compact && (
            <span className="min-w-0 text-left">
              <span className="block truncate font-medium text-sm">{me?.fullName}</span>
              <span className="block text-[11px] text-muted-foreground">
                {isAdmin ? "Site yönetimi" : "Site sakini"}
              </span>
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="font-normal text-muted-foreground text-xs">
          {me?.email}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {canAdmin && ((me?.unitCount ?? 0) > 0 || !isAdmin) && (
          <DropdownMenuItem onClick={() => setView(isAdmin ? "resident" : "admin")}>
            {isAdmin ? <Eye className="size-4" /> : <ShieldCheck className="size-4" />}
            {isAdmin ? "Sakin olarak görüntüle" : "Yönetim görünümüne dön"}
          </DropdownMenuItem>
        )}
        <DropdownMenuItem onClick={() => navigate({ to: "/panel/ayarlar", search: {} })}>
          <Settings2 className="size-4" /> Ayarlar
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onClick={logout}>
          <LogOut className="size-4" /> Çıkış yap
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
