import { AlertTriangle } from "lucide-react";
import { Component, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { ApiError } from "@/lib/api";

type Props = { children: ReactNode; onReset: () => void; resetKey: string };
type State = { error: Error | null };

/**
 * `useSuspenseApi` hata durumunda fırlatır; onu yakalayacak bir sınır olmazsa
 * tek bir başarısız istek tüm uygulamayı düşürür. Sınır yol değiştiğinde
 * kendini sıfırlar.
 */
export class RouteErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidUpdate(previous: Props) {
    if (previous.resetKey !== this.props.resetKey && this.state.error) {
      this.setState({ error: null });
    }
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    const unauthorized = error instanceof ApiError && error.status === 401;
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-24 text-center">
        <AlertTriangle className="size-7 text-muted-foreground/60" />
        <p className="font-medium">
          {unauthorized ? "Oturumunuz sona ermiş" : "Sayfa yüklenemedi"}
        </p>
        <p className="max-w-sm text-muted-foreground text-sm">{error.message}</p>
        <Button
          variant="outline"
          onClick={() => {
            this.setState({ error: null });
            if (unauthorized) window.location.href = "/giris";
            else this.props.onReset();
          }}
        >
          {unauthorized ? "Giriş sayfasına git" : "Yeniden dene"}
        </Button>
      </div>
    );
  }
}

/**
 * Uygulama düzeyinde son çare.
 *
 * Sayfalar ayrı paketlerde geldiği için, yeni bir sürüm yayımlandıktan sonra
 * açık kalan sekme artık var olmayan bir paketi istemeye çalışabilir. Böyle bir
 * yükleme hatası hiçbir sınıra takılmazsa ekran bomboş kalır. Burada yakalanır
 * ve çözümü söylenir: sayfayı yenilemek yeni sürümü getirir.
 */
export class AppErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    const stale =
      /dynamically imported module|Importing a module script failed|Failed to fetch/i.test(
        error.message,
      );
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 px-6 text-center">
        <AlertTriangle className="size-7 text-muted-foreground/60" />
        <p className="font-medium">
          {stale ? "Uygulamanın yeni bir sürümü var" : "Beklenmeyen bir hata oluştu"}
        </p>
        <p className="max-w-sm text-muted-foreground text-sm">
          {stale ? "Sayfayı yenilediğinizde güncel sürüm yüklenecek." : error.message}
        </p>
        <Button onClick={() => window.location.reload()}>Sayfayı yenile</Button>
      </div>
    );
  }
}
