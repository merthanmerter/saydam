import type { LucideIcon } from "lucide-react";
import { cloneElement, isValidElement, type ReactNode, useId } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { DialogClose, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FieldIdContext } from "@/lib/field-id";
import { money } from "@/lib/format";
import { SHARE_METHODS, type ShareMethod } from "@/lib/types";
import { cn } from "@/lib/utils";

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3 pb-6">
      <div>
        <h1 className="font-semibold text-2xl tracking-tight">{title}</h1>
        {description && (
          <p className="mt-1 max-w-2xl text-muted-foreground text-sm">{description}</p>
        )}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Stat({
  label,
  value,
  hint,
  icon: Icon,
  tone = "default",
}: {
  label: string;
  value: string;
  hint?: string;
  icon?: LucideIcon;
  tone?: "default" | "positive" | "negative" | "warning";
}) {
  const toneClass = {
    default: "text-foreground",
    positive: "text-[var(--success)]",
    negative: "text-[var(--danger)]",
    warning: "text-[var(--warning)]",
  }[tone];

  return (
    <Card className="gap-0 py-4">
      <CardContent className="px-4">
        <div className="flex items-center gap-2 text-muted-foreground text-xs uppercase tracking-wide">
          {Icon && <Icon className="size-3.5" />}
          {label}
        </div>
        <div className={cn("tabular mt-2 font-semibold text-2xl", toneClass)}>{value}</div>
        {hint && <div className="mt-1 text-muted-foreground text-xs">{hint}</div>}
      </CardContent>
    </Card>
  );
}

export const Money = ({ cents, className }: { cents: number; className?: string }) => (
  <span className={cn("tabular", className)}>{money(cents)}</span>
);

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed px-6 py-14 text-center">
      <Icon className="size-7 text-muted-foreground/60" />
      <p className="mt-3 font-medium">{title}</p>
      {description && (
        <p className="mt-1 max-w-sm text-muted-foreground text-sm">{description}</p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

/**
 * Etiketli form alanı.
 *
 * Etiket ile kontrol programatik olarak bağlanır: görsel olarak yan yana
 * durmaları yeterli değil, ekran okuyucunun alanın adını okuyabilmesi için
 * `htmlFor`/`id` eşleşmesi gerekir. Kimlik burada üretilip tek çocuğa
 * kopyalanır; Radix `Select` gibi kendi DOM'unu üretmeyen bileşenlerde
 * `SelectTrigger`'a doğrudan `id` verilerek bağlanır.
 */
export function Field({
  label,
  hint,
  error,
  children,
  className,
}: {
  label: string;
  hint?: string;
  /** Doluysa ipucunun yerine geçer: iki satır birden gösterip alanı şişirmez. */
  error?: string;
  children: ReactNode;
  className?: string;
}) {
  const id = useId();
  const control =
    isValidElement<{ id?: string }>(children) && children.props.id === undefined
      ? cloneElement(children, { id })
      : children;

  return (
    <div className={cn("grid gap-1.5", className)}>
      <Label htmlFor={id} className="text-xs">
        {label}
      </Label>
      <FieldIdContext.Provider value={id}>{control}</FieldIdContext.Provider>
      {error ? (
        <p className="text-[var(--danger)] text-xs">{error}</p>
      ) : (
        hint && <p className="text-muted-foreground text-xs">{hint}</p>
      )}
    </div>
  );
}

/** Tutar girişi — kullanıcı TL yazar, form kuruş üretir. */
export function AmountInput(props: React.ComponentProps<typeof Input>) {
  return (
    <div className="relative">
      <Input inputMode="decimal" className="tabular pr-8" {...props} />
      <span className="-translate-y-1/2 absolute top-1/2 right-3 text-muted-foreground text-sm">
        ₺
      </span>
    </div>
  );
}

/**
 * Dialog aksiyon çubuğu.
 *
 * Her form dialogu aynı iskeleti kullansın diye: solda vazgeçme, sağda
 * onay. Kapatma yalnızca köşedeki çarpıya bırakılmaz — dokunmatik
 * ekranda ve klavyeyle en çok aranan buton budur.
 */
export function DialogActions({ children }: { children: ReactNode }) {
  return (
    <DialogFooter>
      <DialogClose asChild>
        <Button type="button" variant="outline">
          İptal
        </Button>
      </DialogClose>
      {children}
    </DialogFooter>
  );
}

/**
 * KMK m.20 paylaşım yöntemi seçici.
 *
 * Hem gider formunda hem site ayarlarında aynı liste gösteriliyor; seçenek
 * metinleri tek yerde dursun diye burada.
 */
export function ShareMethodSelect({
  value,
  onChange,
}: {
  value: ShareMethod;
  onChange: (method: ShareMethod) => void;
}) {
  return (
    <Select value={value} onValueChange={(next) => onChange(next as ShareMethod)}>
      <SelectTrigger className="w-full">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {SHARE_METHODS.map((method) => (
          <SelectItem key={method.id} value={method.id}>
            {method.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/** Seçili yöntemin açıklaması — `Field` ipucu olarak kullanılır. */
export const shareMethodHint = (value: ShareMethod) =>
  SHARE_METHODS.find((method) => method.id === value)?.hint;
