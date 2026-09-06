import { MoreHorizontal } from "lucide-react";
import { type ReactNode, useState } from "react";
import { ConfirmDialog } from "@/app/components/confirm";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export type RowAction = {
  label: string;
  onSelect?: () => void;
  /** Bağlantı eylemi (indir, aç). */
  href?: string;
  disabled?: boolean;
  destructive?: boolean;
  /** Doluysa eylem önce onay ister. */
  confirm?: { title: string; description: ReactNode; confirmLabel: string };
};

/**
 * Tablo satırlarının işlem menüsü.
 *
 * Çıplak ikon düğmeleri yerine adlandırılmış bir menü: anahtar simgesinin
 * "şifre sıfırla" demek olduğunu kimse tahmin etmek zorunda kalmıyor. Geri
 * dönüşü olmayan işlemler menüden çıkınca onay penceresi açıyor — tek tıkla
 * daire ya da fatura silinmesin diye.
 */
export function RowActions({ actions }: { actions: RowAction[] }) {
  const [confirming, setConfirming] = useState<RowAction | null>(null);
  const visible = actions.filter(Boolean);
  if (visible.length === 0) return null;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" aria-label="İşlemler">
            <MoreHorizontal className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-44">
          {visible.map((action) => (
            <DropdownMenuItem
              key={action.label}
              disabled={action.disabled}
              variant={action.destructive ? "destructive" : "default"}
              asChild={Boolean(action.href)}
              onSelect={() => {
                if (!action.confirm) return action.onSelect?.();
                // Menü kapanışı bittikten sonra aç: ikisi aynı anda açılırsa
                // odak yönetimi çakışıyor ve pencere hemen kapanıyor.
                setTimeout(() => setConfirming(action), 0);
              }}
            >
              {action.href ? (
                <a href={action.href} target="_blank" rel="noreferrer">
                  {action.label}
                </a>
              ) : (
                action.label
              )}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <ConfirmDialog
        open={confirming !== null}
        onOpenChange={(open) => !open && setConfirming(null)}
        title={confirming?.confirm?.title}
        description={confirming?.confirm?.description}
        confirmLabel={confirming?.confirm?.confirmLabel}
        destructive={confirming?.destructive}
        onConfirm={() => {
          confirming?.onSelect?.();
          setConfirming(null);
        }}
      />
    </>
  );
}
